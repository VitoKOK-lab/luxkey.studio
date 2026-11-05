import * as THREE from 'three';

import { attachAnimalRig } from './animal-rig.js';

const dog = { species: 'dog', speciesName: '機械狗' };
const cat = { species: 'cat', speciesName: '機械貓' };
const owl = { species: 'owl', speciesName: '機械貓頭鷹' };

export const roster = {
  hall: { ...dog, name: 'NOA', role: '迎賓管家', color: 0x89e2dc, variant: 'noa' },
  library: { ...owl, name: 'INDEX', role: '知識管家', color: 0xf1c382 },
  gallery: { ...cat, name: 'MUSE', role: '人生管家', color: 0xda9ece },
  garden: { ...dog, name: 'FERN', role: '花園管家', color: 0xa9db97 },
  observatory: { ...owl, name: 'VEGA', role: '遠景管家', color: 0x91b6f9 },
  'quiet-room': { ...cat, name: 'SOLA', role: '靜心管家', color: 0xd5cbf7 },
};

const asVector = (point) => new THREE.Vector3().fromArray(point);
const loadingEyeOffset = new THREE.Vector3(0, 0.85, 0);
const pauseAt = (seconds, phase, locus) => ({ seconds, phase, locus });
const isWalkPath = (path) => Array.isArray(path) && path.length > 0 &&
  path.every((point) => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite));
const totalDistance = (origin, route) => route.reduce(({ position, distance }, point) =>
  point.isVector3 ? { position: point, distance: distance + position.distanceTo(point) } :
    { position, distance }, { position: origin, distance: 0 }).distance;

export function createStewards(scene, manifest, onUpdate, reduced) {
  const dispatch = asVector(Array.isArray(manifest.dispatch) ? manifest.dispatch :
    manifest.dispatch?.position || manifest.dispatch?.walk_position || [0, 0.215, 19]);
  const config = Array.isArray(manifest.stewards) ? manifest.stewards : [];
  const bots = Object.keys(roster).map((id, index) => {
    const matching = config.find((entry) => (entry.district_id || entry.id) === id);
    const home = matching?.home_path?.[0] || matching?.position || matching?.home_position || matching?.home;
    const fallback = dispatch.clone().add(new THREE.Vector3((index - 2.5) * 1.22, 0, 0.45));
    const start = Array.isArray(home) ? asVector(home) : fallback;
    const toDispatch = (matching?.home_path || []).map(asVector);
    const group = new THREE.Group();
    group.name = `Steward ${roster[id].name}`;
    const bot = { id, start, toDispatch, task: null, queue: [], completed: null, finishing: false, group, rig: null };
    bot.group.userData.stewardId = id;
    bot.group.position.copy(start);
    bot.group.rotation.y = 0.15 * (2 - index);
    scene.add(bot.group);
    return bot;
  });
  const ready = Promise.all(bots.map(async (bot, index) => {
    bot.rig = await attachAnimalRig(bot.group, roster[bot.id], index);
  }));
  let followed;
  let focused = bots[0];
  let lastStatus = 0;

  function begin(bot) {
    const task = bot.queue.shift();
    if (!task) return false;
    const path = task.room.entry_path.map(asVector);
    const fromHome = [...bot.toDispatch];
    if (path[0].distanceTo(fromHome.at(-1) || bot.start) > 0.15) fromHome.push(path[0]);
    const dwell = { route: 2.4, encode: 6, retrieve: 1.8 }[task.kind] || 2.4;
    const visit = task.loci.flatMap((locus) => {
      const branch = locus.walk_path.map(asVector);
      return [...branch, pauseAt(dwell, 'locus', locus),
        ...[...branch].reverse().slice(1)];
    });
    const route = [...fromHome, ...path, ...visit, ...[...path].reverse(),
      ...[...bot.toDispatch].reverse(), bot.start];
    bot.task = { ...task, route, remaining: totalDistance(bot.group.position, route), phase: 'outbound', pause: null };
    return true;
  }

  function dispatchTo(room, loci, kind, done) {
    if (!isWalkPath(room?.entry_path) || !Array.isArray(loci) || !loci.length ||
      loci.some((locus) => !isWalkPath(locus?.walk_path))) return false;
    const bot = bots.find(({ id }) => id === (room.district_id || room.id)) || bots[0];
    const busy = bot.task || bot.finishing;
    bot.queue.push({ room, loci, kind, done });
    if (!busy) begin(bot);
    if (!followed) focused = bot;
    publish();
    return busy ? 'queued' : 'started';
  }

  function finish(bot, task) {
    const { room, loci, kind } = task;
    bot.completed = { room, loci, kind, phase: 'complete', remaining: 0 };
    bot.task = null;
    // A callback can dispatch more work. Let it join the queue behind existing jobs.
    bot.finishing = true;
    try {
      publish();
      task.done?.();
    } catch (error) {
      console.error(`Could not finish ${roster[bot.id].name}'s steward task.`, error);
    } finally {
      bot.finishing = false;
      if (begin(bot)) publish();
    }
  }

  function stepBot(bot, delta, clock) {
    const task = bot.task;
    if (!task) return 0;
    let step = 0;
    if (!task.route.length) {
      finish(bot, task);
      return 0;
    }
    const goal = task.route[0];
    if (!goal.isVector3) {
      if (!task.pause) {
        task.pause = clock + goal.seconds;
        task.phase = goal.phase;
        task.locus = goal.locus;
        publish();
      }
      if (clock >= task.pause) {
        task.route.shift();
        task.pause = null;
        task.phase = task.route.some((point) => !point.isVector3) ? 'outbound' : 'returning';
        task.locus = null;
        publish();
      }
    } else {
      const position = bot.group.position;
      const direction = goal.clone().sub(position);
      const distance = direction.length();
      const speed = 4;
      step = Math.min(distance, speed * delta);
      if (distance > 0) {
        position.addScaledVector(direction, step / distance);
        if (Math.hypot(direction.x, direction.z) > 0.02) {
          const target = Math.atan2(direction.x, direction.z);
          const angle = target - bot.group.rotation.y;
          bot.group.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * Math.min(1, delta * 11);
        }
      }
      task.remaining = Math.max(0, task.remaining - step);
      if (step === distance) {
        position.copy(goal);
        task.route.shift();
      }
    }
    return step;
  }

  function activity(bot) {
    const task = bot.task || bot.completed;
    return { ...roster[bot.id], id: bot.id, room: task?.room ?? null, loci: task?.loci ?? [],
      kind: task?.kind ?? null, phase: task?.phase ?? 'idle', locus: task?.locus ?? null,
      remaining: Math.ceil(task?.remaining ?? 0), queued: bot.queue.length };
  }

  function snapshot() {
    const activities = bots.map(activity);
    return { ...activities[bots.indexOf(focused)], activities,
      activeCount: bots.filter((bot) => bot.task).length,
      queuedCount: activities.reduce((count, status) => count + status.queued, 0) };
  }

  function publish() {
    onUpdate?.(snapshot());
  }

  return {
    ready,
    dispatchTo,
    snapshot,
    getStatus(id) {
      const bot = bots.find((candidate) => candidate.id === id);
      return bot && activity(bot);
    },
    follow(active, id) {
      if (active) focused = bots.find((bot) => bot.id === id) || focused;
      followed = active ? focused : undefined;
      publish();
      return Boolean(followed);
    },
    followedInfo() {
      if (!followed) return;
      const eyeOffset = followed.rig?.eyeOffset ?? loadingEyeOffset;
      return { id: followed.id, group: followed.group, eyeOffset, eyeHeight: eyeOffset.y };
    },
    setPOV(active) {
      for (const bot of bots) bot.group.visible = !(active && bot === followed);
    },
    pick(raycaster) {
      for (const hit of raycaster.intersectObjects(bots.filter((bot) => bot.group.visible).map((bot) => bot.group), true)) {
        let object = hit.object;
        while (object && !object.userData.stewardId) object = object.parent;
        if (object) return object.userData.stewardId;
      }
      return null;
    },
    update(delta, clock) {
      const reducedMotion = reduced.matches;
      for (const bot of bots) {
        const step = stepBot(bot, delta, clock);
        bot.rig?.update(delta, clock, step, bot.task?.locus?.position, reducedMotion);
      }
      if (bots.some((bot) => bot.task) && clock - lastStatus >= 0.4) {
        lastStatus = clock;
        publish();
      }
      return followed?.group || null;
    },
  };
}
