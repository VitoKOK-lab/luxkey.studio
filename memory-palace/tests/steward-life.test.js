import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { DefaultLoadingManager, Scene, Vector3 } from 'three';
import { createStewards, roster } from '../app/stewards.js';

const manifest = JSON.parse(await readFile(new URL('../assets/scene-manifest.json', import.meta.url)));
const originals = Object.fromEntries(['fetch', 'ProgressEvent', 'self', 'createImageBitmap'].map((key) => [key, globalThis[key]]));
before(() => {
  DefaultLoadingManager.setURLModifier((url) => new URL(url, 'http://memory-palace.test').href);
  globalThis.fetch = async (request, options) => {
    const url = new URL(request.url ?? request);
    if (url.protocol === 'blob:') return originals.fetch(request, options);
    assert.match(url.pathname, /^\/assets\/(stewards\/robot-(dog|cat|owl)|quality\/robot-noa)\.glb$/);
    return new Response(await readFile(new URL(`..${url.pathname}`, import.meta.url)));
  };
  globalThis.ProgressEvent ??= class extends Event { constructor(type, options) { super(type); Object.assign(this, options); } };
  globalThis.self ??= globalThis;
  globalThis.createImageBitmap ??= async (blob) => {
    const header = new DataView(await blob.slice(0, 24).arrayBuffer());
    return { width: header.getUint32(16), height: header.getUint32(20) };
  };
});
after(() => {
  DefaultLoadingManager.setURLModifier(undefined);
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

const paths = [...manifest.stewards.map((entry) => entry.home_path),
  ...manifest.rooms.flatMap((room) => [room.entry_path, ...room.loci.map((locus) => locus.walk_path)])];
const segments = paths.flatMap((path) => path.slice(1).map((point, index) => [new Vector3(...path[index]), new Vector3(...point)]));
function onSafeSegment(position) {
  return segments.some(([a, b]) => {
    const direction = b.clone().sub(a);
    const t = direction.lengthSq() ? Math.max(0, Math.min(1, position.clone().sub(a).dot(direction) / direction.lengthSq())) : 0;
    return a.clone().addScaledVector(direction, t).distanceTo(position) < 1e-5;
  });
}
async function setup(options = {}, reduced = { matches: false }, source = manifest) {
  const scene = new Scene(), updates = [];
  const stewards = createStewards(scene, source, (snapshot) => updates.push(snapshot), reduced, options);
  await stewards.ready;
  const groups = new Map(scene.children.map((group) => [group.userData.stewardId, group]));
  const homes = new Map([...groups].map(([id, group]) => [id, group.position.clone()]));
  let frame = 0;
  function advance(seconds, inspect) {
    for (let i = 0; i < Math.round(seconds * 30); i++) {
      stewards.update(1 / 30, ++frame / 30);
      inspect?.();
    }
  }
  function send(roomId, done) {
    const room = manifest.rooms.find((candidate) => candidate.id === roomId);
    return stewards.dispatchTo(room, [room.loci[0]], 'retrieve', done);
  }
  return { stewards, groups, homes, updates, advance, send, reduced };
}

test('all six stewards independently live on authored district paths and publish all leisure behaviors', async () => {
  const { stewards, groups, updates, advance } = await setup();
  advance(1.9);
  assert.ok(stewards.snapshot().activities.every(({ phase }) => phase === 'idle'));
  advance(0.3);
  assert.equal(stewards.getStatus('hall').kind, 'wander');
  assert.equal(stewards.getStatus('library').phase, 'idle', 'starts are staggered');
  advance(200, () => {
    for (const group of groups.values()) assert.ok(onSafeSegment(group.position), 'leisure stays on manifest segments');
  });
  for (const id of Object.keys(roster)) {
    assert.ok(updates.some(({ activities }) => activities.some((status) => status.id === id && status.phase === 'activity')));
    assert.ok(updates.some(({ activities }) => activities.some((status) => status.id === id && status.phase === 'returning')));
  }
  const kinds = new Set(updates.flatMap(({ activities }) => activities.filter(({ phase }) => phase === 'activity').map(({ kind }) => kind)));
  assert.deepEqual([...kinds].sort(), ['clean', 'play', 'wander']);
  assert.equal(stewards.snapshot().activeCount, 0);
  assert.equal(stewards.snapshot().queuedCount, 0);
});

test('memory dispatch retraces interrupted leisure, preserves FIFO, and fires callbacks once at home', async () => {
  const { stewards, groups, homes, advance, send } = await setup();
  stewards.follow(true, 'quiet-room');
  advance(8);
  const history = [], completions = [];
  const done = (id) => () => {
    assert.ok(groups.get('library').position.equals(homes.get('library')));
    completions.push(id);
  };
  assert.equal(send('library', done('library')), 'queued');
  assert.equal(send('archive', done('archive')), 'queued');
  assert.equal(stewards.getStatus('library').phase, 'returning');
  advance(200, () => {
    history.push(stewards.snapshot().id);
    assert.ok(onSafeSegment(groups.get('library').position));
  });
  assert.deepEqual(completions, ['library', 'archive']);
  assert.ok(history.every((id) => id === 'quiet-room'), 'background life and memory tasks preserve follow focus');
  assert.equal(stewards.followedInfo().id, 'quiet-room');
});

test('summons use nearby authored route segments, hold their formation, and safely release', async () => {
  const { stewards, groups, homes, advance } = await setup();
  advance(16);
  const target = [0.5, 8.728, -1.1];
  stewards.follow(true, 'garden');
  const status = stewards.gatherAll(target);
  assert.equal(status.gatherState, 'gathering');
  assert.equal(status.activeCount, 0);
  advance(200, () => {
    for (const group of groups.values()) assert.ok(onSafeSegment(group.position), 'summons never cut through the building');
  });
  assert.equal(stewards.snapshot().gatherState, 'gathered');
  assert.equal(stewards.snapshot().gatheredCount, 6);
  const positions = [...groups.values()].map((group) => group.position.clone());
  assert.equal(new Set(positions.map((position) => position.toArray().join(','))).size, 6);
  assert.ok(positions.every((position) => Math.abs(position.y - target[1]) < 0.25));
  assert.ok(positions.every((position) => position.distanceTo(new Vector3(...target)) < 7));
  advance(30);
  assert.ok([...groups.values()].every((group, index) => group.position.equals(positions[index])));
  assert.equal(stewards.snapshot().id, 'garden');
  stewards.releaseAll();
  assert.equal(stewards.snapshot().gatherState, 'idle');
  advance(60, () => {
    for (const group of groups.values()) assert.ok(onSafeSegment(group.position));
  });
  assert.ok([...groups].some(([id, group]) => !group.position.equals(homes.get(id))), 'ambient life resumes after release');
});

test('gather waits for the active memory callback, retains queued work, and release resumes FIFO', async () => {
  const { stewards, groups, homes, advance, send } = await setup({ ambient: false });
  const completed = [];
  send('library', () => completed.push(['library', groups.get('library').position.equals(homes.get('library'))]));
  send('archive', () => completed.push(['archive', groups.get('library').position.equals(homes.get('library'))]));
  advance(2);
  stewards.gatherAll();
  advance(70);
  assert.deepEqual(completed, [['library', true]]);
  assert.equal(stewards.snapshot().gatherState, 'gathered');
  assert.equal(stewards.snapshot().queuedCount, 1);
  stewards.releaseAll();
  advance(90);
  assert.deepEqual(completed, [['library', true], ['archive', true]]);
  assert.equal(stewards.snapshot().queuedCount, 0);
});

test('a new memory dispatch leaves the held formation, drains that steward FIFO, and rejoins', async () => {
  const { stewards, advance, send } = await setup({ ambient: false });
  stewards.gatherAll();
  advance(5);
  assert.equal(stewards.snapshot().gatherState, 'gathered');
  const completed = [];
  send('library', () => completed.push('library'));
  send('archive', () => completed.push('archive'));
  assert.equal(stewards.getStatus('library').phase, 'returning');
  advance(150);
  assert.deepEqual(completed, ['library', 'archive']);
  assert.equal(stewards.snapshot().gatherState, 'gathered');
  assert.equal(stewards.snapshot().gatheredCount, 6);
});

test('reduced motion stops autonomous life, while explicit memory and gathering still walk', async () => {
  const { stewards, groups, homes, advance, send, reduced } = await setup({}, { matches: true });
  advance(30);
  assert.ok([...groups].every(([id, group]) => group.position.equals(homes.get(id))));
  reduced.matches = false;
  advance(3);
  reduced.matches = true;
  const frozen = groups.get('hall').position.clone();
  advance(10);
  assert.ok(groups.get('hall').position.equals(frozen));
  let done = 0;
  send('hall', () => done++);
  advance(80);
  assert.equal(done, 1);
  stewards.gatherAll();
  advance(20);
  assert.equal(stewards.snapshot().gatherState, 'gathered');
  stewards.releaseAll();
  advance(30);
  assert.ok([...groups].every(([id, group]) => group.position.equals(homes.get(id))));
});


test('every room can summon six separated stewards to a reachable route on its floor', async () => {
  const { stewards, groups, advance } = await setup({ ambient: false });
  for (const room of manifest.rooms) {
    const target = room.loci[0].walk_path.at(-1);
    assert.notEqual(stewards.gatherAll(target), false, room.id);
    advance(130);
    assert.equal(stewards.snapshot().gatherState, 'gathered', room.id);
    const positions = [...groups.values()].map((group) => group.position);
    for (let i = 0; i < positions.length; i++) {
      assert.ok(onSafeSegment(positions[i]), room.id);
      assert.ok(Math.abs(positions[i].y - target[1]) <= 0.35, room.id);
      const dx = target[0] - positions[i].x, dz = target[2] - positions[i].z;
      assert.ok(Math.hypot(dx, dz) >= 1.2, `${room.id}: caller clearance`);
      const heading = [...groups.values()][i].rotation.y;
      const facing = (Math.sin(heading) * dx + Math.cos(heading) * dz) / Math.hypot(dx, dz);
      assert.ok(facing > 0.999, `${room.id}: faces the caller`);
      for (let j = i + 1; j < positions.length; j++) {
        assert.ok(positions[i].distanceTo(positions[j]) >= 1.049, `${room.id}: formation spacing`);
      }
    }
  }
});

test('unreachable or absent-floor summons reject atomically without interrupting work', async () => {
  const disconnected = structuredClone(manifest);
  delete disconnected.stewards.find(({ id }) => id === 'library').home_path;
  const { stewards, advance, send } = await setup({ ambient: false }, { matches: false }, disconnected);
  send('hall');
  advance(2);
  const before = stewards.snapshot();
  assert.equal(stewards.gatherAll([0, 50, 0]), false);
  assert.deepEqual(stewards.snapshot(), before);
  assert.equal(stewards.gatherAll([0, 0.213, 19]), false, 'all six must have valid graph paths');
  assert.deepEqual(stewards.snapshot(), before);
});

test('idle staggering starts at the first rendered clock after a slow scene load', async () => {
  const { stewards } = await setup();
  stewards.update(1 / 60, 50);
  stewards.update(1 / 60, 51.9);
  assert.ok(stewards.snapshot().activities.every(({ phase }) => phase === 'idle'));
  stewards.update(1 / 60, 52.1);
  assert.equal(stewards.getStatus('hall').kind, 'wander');
  assert.equal(stewards.getStatus('library').phase, 'idle');
});
