import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { Color, DefaultLoadingManager, Raycaster, Scene, Vector3 } from 'three';
import { createStewards, roster } from '../app/stewards.js';

const manifest = JSON.parse(await readFile(new URL('../assets/scene-manifest.json', import.meta.url)));
const ids = Object.keys(roster);
const rooms = new Map(manifest.rooms.map((room) => [room.id, room]));
const originalFetch = globalThis.fetch;
const originalProgressEvent = globalThis.ProgressEvent;
const originalSelf = globalThis.self;
const originalCreateImageBitmap = globalThis.createImageBitmap;
let qualityUnavailable = false;

before(() => {
  DefaultLoadingManager.setURLModifier((url) => new URL(url, 'http://memory-palace.test').href);
  globalThis.fetch = async (request, options) => {
    const { pathname, protocol } = new URL(request.url ?? request);
    if (protocol === 'blob:') return originalFetch(request, options);
    if (pathname === '/assets/quality/robot-noa.glb') {
      if (qualityUnavailable) return new Response(null, { status: 404 });
    } else {
      assert.match(pathname, /^\/assets\/stewards\/robot-(dog|cat|owl)\.glb$/);
    }
    return new Response(await readFile(new URL(`..${pathname}`, import.meta.url)));
  };
  globalThis.ProgressEvent ??= class ProgressEvent extends Event {
    constructor(type, options) {
      super(type);
      Object.assign(this, options);
    }
  };
  globalThis.self ??= globalThis;
  // The tests use the real GLTFLoader in Node. Read embedded PNG dimensions
  // without a browser image decoder because nothing uploads them to WebGL.
  globalThis.createImageBitmap ??= async (blob) => {
    assert.equal(blob.type, 'image/png');
    const header = new DataView(await blob.slice(0, 24).arrayBuffer());
    assert.equal(header.getUint32(0), 0x89504e47);
    return { width: header.getUint32(16), height: header.getUint32(20) };
  };
});

after(() => {
  DefaultLoadingManager.setURLModifier(undefined);
  globalThis.fetch = originalFetch;
  if (!originalProgressEvent) delete globalThis.ProgressEvent;
  if (!originalSelf) delete globalThis.self;
  if (!originalCreateImageBitmap) delete globalThis.createImageBitmap;
});

async function setup() {
  const scene = new Scene();
  const updates = [];
  const stewards = createStewards(scene, manifest, (status) => updates.push(status), { matches: false });
  await stewards.ready;
  const groups = new Map(scene.children.map((group) => [group.userData.stewardId, group]));
  const homes = new Map([...groups].map(([id, group]) => [id, group.position.clone()]));
  let frame = 0;
  function advance(seconds) {
    for (let i = 0; i < Math.round(seconds * 60); i++) stewards.update(1 / 60, ++frame / 60);
  }
  function send(roomId, done, kind = 'retrieve') {
    const room = rooms.get(roomId);
    return stewards.dispatchTo(room, [room.loci[0]], kind, done);
  }
  return { stewards, updates, groups, homes, advance, send };
}

function meshWithMaterial(group, name) {
  let mesh;
  group.traverse((node) => {
    if (node.material?.name === name) mesh = node;
  });
  return mesh;
}

test('NOA falls back to the stock dog when its quality asset is missing', async () => {
  qualityUnavailable = true;
  try {
    const { groups } = await setup();
    const noa = meshWithMaterial(groups.get('hall'), 'Steward Glow · mint optical core');
    const fern = meshWithMaterial(groups.get('garden'), 'Steward Glow · mint optical core');
    assert.equal(noa.geometry, fern.geometry);
    assert.ok(noa.material.emissive.equals(new Color(roster.hall.color).multiplyScalar(0.36)));
  } finally {
    qualityUnavailable = false;
  }
});

test('NOA loads its quality model on retry and preserves the dog camera pivot', async () => {
  const { groups, stewards } = await setup();
  const noa = groups.get('hall');
  const ceramic = meshWithMaterial(noa, 'NOA warm sintered ceramic');
  const opticalCore = meshWithMaterial(noa, 'Steward Glow · mint optical core');
  assert.ok(ceramic, 'the hall steward is using the quality GLB');
  assert.equal(ceramic.material.emissive.getHex(), 0);
  assert.ok(ceramic.material.normalMap.image.width > 0);
  assert.ok(ceramic.material.roughnessMap.image.width > 0);
  assert.ok(opticalCore.material.emissive.equals(new Color(roster.hall.color).multiplyScalar(0.36)));
  stewards.follow(true, 'hall');
  const hallEye = stewards.followedInfo().eyeOffset;
  stewards.follow(true, 'garden');
  assert.ok(hallEye.distanceTo(stewards.followedInfo().eyeOffset) < 1e-5);
});

test('stewards sharing a model retain their own district colors and share source geometry', async () => {
  const { groups } = await setup();
  for (const [first, second] of [['library', 'observatory'], ['gallery', 'quiet-room']]) {
    const a = meshWithMaterial(groups.get(first), 'Steward Glow · mint optical core');
    const b = meshWithMaterial(groups.get(second), 'Steward Glow · mint optical core');
    assert.equal(a.geometry, b.geometry);
    assert.notEqual(a.material, b.material);
    for (const [id, mesh] of [[first, a], [second, b]]) {
      const districtColor = new Color(roster[id].color);
      assert.ok(mesh.material.emissive.equals(districtColor.clone().multiplyScalar(0.36)));
      assert.ok(mesh.material.color.equals(districtColor.multiplyScalar(0.54)));
      const accent = meshWithMaterial(groups.get(id), 'Steward accent · eucalyptus ceramic');
      assert.equal(accent.material.emissive.getHex(), 0);
    }
  }
});

test('contact shadow follows the steward and stays out of selection and steward POV', async () => {
  const { stewards, groups, advance, send } = await setup();
  const group = groups.get('hall');
  const shadow = group.getObjectByName('Steward contact shadow');
  group.updateWorldMatrix(true, true);
  const center = shadow.getWorldPosition(new Vector3());
  const down = new Vector3(0, -1, 0);
  assert.equal(stewards.pick(new Raycaster(center.clone().addScaledVector(down, -0.06), down)), null);
  const bodyRay = new Raycaster(center.clone().addScaledVector(down, -2), down);
  assert.equal(stewards.pick(bodyRay), 'hall');
  assert.equal(shadow.castShadow, false);

  stewards.follow(true, 'hall');
  stewards.setPOV(true);
  assert.equal(shadow.parent.visible, false);
  assert.equal(stewards.pick(bodyRay), null);
  stewards.setPOV(false);

  assert.equal(send('hall'), 'started');
  advance(2 / 60);
  assert.equal(shadow.visible, false, 'descending from the dock');
  advance(1);
  const moved = shadow.getWorldPosition(new Vector3());
  assert.ok(moved.distanceTo(center) > 0.5);
  assert.ok(Math.abs(moved.y - group.position.y - 0.012) < 1e-6);
  assert.equal(shadow.parent.visible, true);
  assert.equal(shadow.visible, true, 'walking on level paving');
});

test('all six districts start and move at the same time and complete at their own homes', async () => {
  const { stewards, groups, homes, advance, send } = await setup();
  const completed = [];
  assert.deepEqual(stewards.snapshot().activities.map(({ id, phase }) => [id, phase]),
    ids.map((id) => [id, 'idle']));
  for (const id of ids) assert.equal(send(id, () => completed.push(id)), 'started');
  assert.equal(stewards.snapshot().activeCount, 6);
  assert.equal(stewards.snapshot().queuedCount, 0);
  assert.equal(stewards.snapshot().id, ids.at(-1));

  advance(2);
  for (const [id, group] of groups) {
    assert.ok(group.position.distanceTo(homes.get(id)) > 0.5, `${id} left home`);
    assert.equal(stewards.getStatus(id).phase, 'outbound');
  }
  assert.deepEqual(completed, []);

  advance(60);
  assert.deepEqual(completed.sort(), [...ids].sort());
  assert.equal(stewards.snapshot().activeCount, 0);
  assert.equal(stewards.snapshot().queuedCount, 0);
  for (const [id, group] of groups) {
    assert.ok(group.position.equals(homes.get(id)), `${id} returned home`);
    assert.equal(stewards.getStatus(id).phase, 'complete');
    assert.equal(stewards.getStatus(id).remaining, 0);
  }
});

test('shared-district jobs wait for their steward to return and retain FIFO order', async () => {
  const { stewards, updates, groups, homes, advance, send } = await setup();
  const completed = [];
  let fromCallback;
  function record(roomId) {
    const id = rooms.get(roomId).district_id;
    const status = stewards.getStatus(id);
    completed.push([roomId, status.room.id, status.phase, groups.get(id).position.equals(homes.get(id))]);
  }

  assert.equal(send('library', () => {
    record('library');
    fromCallback = send('cartography-room', () => record('cartography-room'));
  }), 'started');
  assert.equal(send('archive', () => record('archive')), 'queued');
  assert.equal(send('workshop', () => record('workshop')), 'queued');
  assert.equal(send('garden', () => record('garden')), 'started');
  assert.equal(stewards.snapshot().activeCount, 2);
  assert.equal(stewards.snapshot().queuedCount, 2);
  assert.equal(stewards.getStatus('library').room.id, 'library');

  advance(240);
  assert.equal(fromCallback, 'queued');
  assert.ok(updates.some(({ activities }) => activities.some(({ id, room, phase, queued }) =>
    id === 'library' && room?.id === 'library' && phase === 'returning' && queued === 2)));
  assert.deepEqual(completed.filter(([id]) => id !== 'garden'),
    ['library', 'archive', 'workshop', 'cartography-room'].map((id) => [id, id, 'complete', true]));
  assert.deepEqual(completed.filter(([id]) => id === 'garden'), [['garden', 'garden', 'complete', true]]);
  assert.equal(stewards.snapshot().activeCount, 0);
  assert.equal(stewards.snapshot().queuedCount, 0);
});

test('following a steward immediately reports its status and pins focus across other walks', async () => {
  const { stewards, updates, groups, advance, send } = await setup();
  assert.equal(send('garden'), 'started');
  assert.equal(stewards.follow(true, 'quiet-room'), true);
  assert.equal(updates.at(-1).id, 'quiet-room');
  assert.equal(updates.at(-1).phase, 'idle');
  assert.equal(updates.at(-1).room, null);
  assert.equal(stewards.followedInfo().group, groups.get('quiet-room'));

  const firstFollowUpdate = updates.length;
  assert.equal(send('observatory'), 'started');
  advance(90);
  const followedUpdates = updates.slice(firstFollowUpdate);
  assert.ok(followedUpdates.every(({ id, phase }) => id === 'quiet-room' && phase === 'idle'));
  assert.ok(followedUpdates.some(({ activities }) =>
    activities.some(({ id, phase }) => id === 'garden' && phase === 'complete')));
  assert.equal(updates.at(-1).activeCount, 0);

  assert.equal(stewards.follow(true, 'garden'), true);
  assert.equal(updates.at(-1).id, 'garden');
  assert.equal(updates.at(-1).phase, 'complete');
  assert.equal(stewards.followedInfo().group, groups.get('garden'));
  assert.equal(stewards.follow(false), false);
  assert.equal(updates.at(-1).id, 'garden');
  assert.equal(stewards.followedInfo(), undefined);
});

test('invalid room or locus paths do not schedule jobs or change status', async () => {
  const { stewards, updates, advance } = await setup();
  const room = rooms.get('hall');
  const locus = room.loci[0];
  const done = () => assert.fail('invalid job completed');
  assert.equal(stewards.dispatchTo(null, [locus], 'route', done), false);
  assert.equal(stewards.dispatchTo({ ...room, entry_path: [] }, [locus], 'route', done), false);
  assert.equal(stewards.dispatchTo(room, [], 'route', done), false);
  assert.equal(stewards.dispatchTo(room, [null], 'route', done), false);
  assert.equal(stewards.dispatchTo(room, [{ ...locus, walk_path: [[NaN, 0, 0]] }], 'route', done), false);
  advance(1);
  assert.equal(updates.length, 0);
  assert.equal(stewards.snapshot().activeCount, 0);
  assert.equal(stewards.snapshot().queuedCount, 0);
});
