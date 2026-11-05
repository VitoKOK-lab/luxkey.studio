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

// Only manifest-authored segments enter this graph. A summoned steward never
// connects directly to the caller: its destination stays on the nearest safe edge.
function routeGraph(manifest) {
  const nodes = new Map();
  const edges = [];
  const key = (point) => point.map((value) => value.toFixed(4)).join(',');
  const node = (point) => {
    const id = key(point);
    if (!nodes.has(id)) nodes.set(id, { id, point: asVector(point), neighbors: new Map() });
    return nodes.get(id);
  };
  function add(path) {
    if (!isWalkPath(path)) return;
    for (let i = 1; i < path.length; i++) {
      const a = node(path[i - 1]), b = node(path[i]);
      const distance = a.point.distanceTo(b.point);
      if (distance < 0.0001) continue;
      a.neighbors.set(b.id, distance);
      b.neighbors.set(a.id, distance);
      edges.push({ a, b, distance });
    }
  }
  for (const entry of Array.isArray(manifest.stewards) ? manifest.stewards : []) add(entry.home_path);
  for (const room of Array.isArray(manifest.rooms) ? manifest.rooms : []) {
    add(room.entry_path);
    for (const locus of room.loci || []) add(locus.walk_path);
  }
  function shortest(from, to) {
    const start = nodes.get(key(from.toArray()));
    if (!start) return null;
    const distances = new Map([[start.id, 0]]), previous = new Map();
    const pending = new Set(nodes.keys());
    while (pending.size) {
      let current;
      for (const id of pending) {
        if (distances.has(id) && (!current || distances.get(id) < distances.get(current))) current = id;
      }
      if (!current) break;
      pending.delete(current);
      if (current === to.id) {
        const path = [];
        for (let id = current; id; id = previous.get(id)) path.unshift(nodes.get(id).point.clone());
        return { path, distance: distances.get(current) };
      }
      for (const [next, distance] of nodes.get(current).neighbors) {
        const candidate = distances.get(current) + distance;
        if (candidate < (distances.get(next) ?? Infinity)) {
          distances.set(next, candidate);
          previous.set(next, current);
        }
      }
    }
    return null;
  }
  return { edges, shortest };
}

export function createStewards(scene, manifest, onUpdate, reduced, options = {}) {
  const dispatch = asVector(Array.isArray(manifest.dispatch) ? manifest.dispatch :
    manifest.dispatch?.position || manifest.dispatch?.walk_position || [0, 0.215, 19]);
  const graph = routeGraph(manifest);
  const config = Array.isArray(manifest.stewards) ? manifest.stewards : [];
  const bots = Object.keys(roster).map((id, index) => {
    const matching = config.find((entry) => (entry.district_id || entry.id) === id);
    const home = matching?.home_path?.[0] || matching?.position || matching?.home_position || matching?.home;
    const fallback = dispatch.clone().add(new THREE.Vector3((index - 2.5) * 1.22, 0, 0.45));
    const start = Array.isArray(home) ? asVector(home) : fallback;
    const toDispatch = (matching?.home_path || []).map(asVector);
    const group = new THREE.Group();
    group.name = `Steward ${roster[id].name}`;
    const bot = { id, index, start, toDispatch, task: null, queue: [], completed: null,
      finishing: false, group, rig: null, leisure: null, gathering: null,
      gathered: false, gatherRoute: null, idleAt: 2 + index * 1.6, cycle: 0 };
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
  let now = 0;
  let firstClock = null;
  let gatherRequested = false;
  let gatherTarget = null;

  function returnHome(bot, motion) {
    motion.route = [...motion.trail].reverse().map((point) => point.clone());
    motion.phase = 'returning';
    motion.pause = null;
    motion.remaining = totalDistance(bot.group.position, motion.route);
  }

  function beginGather(bot) {
    if (!gatherRequested || bot.task || bot.leisure || bot.gathering || bot.gathered) return false;
    const route = (bot.gatherRoute || []).map((point) => point.clone());
    bot.gathering = { kind: 'gather', phase: 'gathering', route,
      trail: [bot.start.clone()], remaining: totalDistance(bot.group.position, route) };
    bot.completed = null;
    return true;
  }

  function schedule(bot) {
    if (bot.task || bot.finishing || bot.leisure || bot.gathering || bot.gathered) return;
    if (gatherRequested && !(bot.resumeDuringGather && bot.queue.length)) {
      bot.resumeDuringGather = false;
      beginGather(bot);
    } else begin(bot);
  }

  function beginLeisure(bot, clock) {
    if (options.ambient === false || reduced?.matches || gatherRequested || bot.task ||
      bot.queue.length || bot.gathering || bot.gathered || clock < bot.idleAt) return;
    const rooms = (manifest.rooms || []).filter((room) =>
      (room.district_id || room.id) === bot.id && isWalkPath(room.entry_path) &&
      room.loci?.some((locus) => isWalkPath(locus.walk_path)));
    if (!rooms.length) return;
    const room = rooms[bot.cycle % rooms.length];
    const loci = room.loci.filter((locus) => isWalkPath(locus.walk_path));
    const locus = loci[Math.floor(bot.cycle / rooms.length) % loci.length];
    // Each leisure excursion has exactly one branch, so its visited prefix is
    // also a safe return route when a memory dispatch interrupts it mid-edge.
    const entry = room.entry_path.map(asVector), branch = locus.walk_path.map(asVector);
    if (!bot.toDispatch.length || bot.toDispatch[0].distanceTo(bot.start) > 0.001 ||
      bot.toDispatch.at(-1).distanceTo(entry[0]) > 0.001 ||
      entry.at(-1).distanceTo(branch[0]) > 0.001) return;
    const route = [...bot.toDispatch, ...entry, ...branch];
    bot.leisure = { kind: ['wander', 'play', 'clean'][(bot.index + bot.cycle++) % 3],
      phase: 'outbound', room, loci: [locus], locus: null, route,
      trail: [bot.start.clone()], remaining: totalDistance(bot.group.position, route), pause: null };
    bot.completed = null;
    publish();
  }

  function move(bot, motion, delta, speed) {
    const goal = motion.route[0];
    const direction = goal.clone().sub(bot.group.position);
    const distance = direction.length();
    const step = Math.min(distance, speed * delta);
    if (distance > 0) {
      bot.group.position.addScaledVector(direction, step / distance);
      if (Math.hypot(direction.x, direction.z) > 0.02) {
        const target = Math.atan2(direction.x, direction.z);
        const angle = target - bot.group.rotation.y;
        bot.group.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * Math.min(1, delta * 11);
      }
    }
    motion.remaining = Math.max(0, motion.remaining - step);
    if (step === distance) {
      bot.group.position.copy(goal);
      motion.route.shift();
      if (motion.phase !== 'returning') motion.trail.push(goal.clone());
    }
    return step;
  }

  function stepLife(bot, delta, clock) {
    const leisure = bot.leisure;
    if (leisure) {
      // Reduced motion freezes autonomous excursions, including the return.
      // Explicit memory work and summons still retrace that route normally.
      if (reduced?.matches && !bot.queue.length && !gatherRequested) return 0;
      if ((bot.queue.length || gatherRequested) && leisure.phase !== 'returning') returnHome(bot, leisure);
      if (leisure.route.length) return move(bot, leisure, delta, 2.15);
      if (leisure.phase === 'outbound') {
        leisure.phase = 'activity';
        leisure.locus = leisure.loci[0];
        leisure.pause = clock + 5 + bot.index * 0.45;
        publish();
      } else if (leisure.phase === 'activity' && clock >= leisure.pause) {
        leisure.locus = null;
        returnHome(bot, leisure);
        publish();
      } else if (leisure.phase === 'returning') {
        bot.leisure = null;
        bot.idleAt = clock + 5 + bot.index * 0.7;
        schedule(bot);
        publish();
      }
      return 0;
    }
    const gathering = bot.gathering;
    if (gathering) {
      if (gathering.route.length) return move(bot, gathering, delta, 3.2);
      bot.gathering = null;
      if (gathering.phase === 'returning') schedule(bot);
      else {
        bot.gathered = true;
        bot.gatherTrail = gathering.trail;
      }
      bot.idleAt = clock + 5 + bot.index * 0.7;
      publish();
      return 0;
    }
    if (bot.gathered) {
      const direction = bot.gatherLookTarget.clone().sub(bot.group.position);
      if (Math.hypot(direction.x, direction.z) > 0.02) {
        const angle = Math.atan2(direction.x, direction.z) - bot.group.rotation.y;
        bot.group.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * (1 - Math.exp(-6 * delta));
      }
      return 0;
    }
    beginLeisure(bot, clock);
    return 0;
  }

  function begin(bot) {
    if ((gatherRequested && !bot.resumeDuringGather) || bot.leisure || bot.gathering || bot.gathered) return false;
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
    const busy = Boolean(bot.task || bot.finishing || bot.leisure || bot.gathering || bot.gathered || gatherRequested);
    bot.queue.push({ room, loci, kind, done });
    if (gatherRequested) {
      bot.resumeDuringGather = true;
      if (bot.gathered) {
        bot.gathered = false;
        bot.gathering = { kind: 'gather', trail: bot.gatherTrail, route: [] };
        returnHome(bot, bot.gathering);
      } else if (bot.gathering && bot.gathering.phase !== 'returning') returnHome(bot, bot.gathering);
    }
    if (bot.leisure && bot.leisure.phase !== 'returning') returnHome(bot, bot.leisure);
    schedule(bot);
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
      bot.idleAt = now + 5 + bot.index * 0.7;
      schedule(bot);
      publish();
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
    const task = bot.task || bot.leisure || bot.gathering || (bot.gathered ?
      { kind: 'gather', phase: 'gathered', remaining: 0 } : bot.completed);
    return { ...roster[bot.id], id: bot.id, room: task?.room ?? null, loci: task?.loci ?? [],
      kind: task?.kind ?? null, behavior: bot.leisure?.phase === 'activity' ? bot.leisure.kind : null, phase: task?.phase ?? 'idle', locus: task?.locus ?? null,
      remaining: Math.ceil(task?.remaining ?? 0), queued: bot.queue.length };
  }

  function snapshot() {
    const activities = bots.map(activity);
    return { ...activities[bots.indexOf(focused)], activities,
      activeCount: bots.filter((bot) => bot.task).length,
      queuedCount: activities.reduce((count, status) => count + status.queued, 0),
      gatherState: !gatherRequested ? 'idle' : bots.every((bot) => bot.gathered) ? 'gathered' : 'gathering',
      gatherTarget: gatherTarget?.slice() ?? null,
      gatheredCount: bots.filter((bot) => bot.gathered).length };
  }

  function publish() {
    onUpdate?.(snapshot());
  }

  return {
    ready,
    dispatchTo,
    async setAppearance(id, appearance) {
      const bot = bots.find((item) => item.id === id);
      if (!bot) return false;
      await ready;
      return bot.rig.setAppearance(appearance);
    },
    gatherAll(target) {
      if (target !== undefined && (!Array.isArray(target) || target.length !== 3 || !target.every(Number.isFinite))) return false;
      const point = Array.isArray(target) && target.length === 3 && target.every(Number.isFinite) ? asVector(target) : null;
      let nearest;
      let plans;
      if (point) {
        const edges = [];
        for (const edge of graph.edges) {
          if (Math.abs(edge.a.point.y - edge.b.point.y) > 0.25 || edge.distance < 6.3) continue;
          const direction = edge.b.point.clone().sub(edge.a.point);
          const t = THREE.MathUtils.clamp(point.clone().sub(edge.a.point).dot(direction) / direction.lengthSq(), 0, 1);
          const projection = edge.a.point.clone().addScaledVector(direction, t);
          if (Math.abs(projection.y - point.y) > 0.35) continue;
          edges.push({ edge, t, projection, distance: projection.distanceTo(point) });
        }
        edges.sort((a, b) => a.distance - b.distance);
        for (const candidate of edges) {
          const { edge, t } = candidate;
          const spacing = 1.05, clearance = 1.2;
          const low = spacing * 2.5, high = edge.distance - low;
          const preferred = THREE.MathUtils.clamp(t * edge.distance, low, high);
          const centers = [preferred, low, high];
          const dx = edge.b.point.x - edge.a.point.x, dz = edge.b.point.z - edge.a.point.z;
          const horizontal = Math.hypot(dx, dz);
          const along = ((point.x - edge.a.point.x) * dx + (point.z - edge.a.point.z) * dz) / horizontal;
          const perpendicular = Math.abs((point.x - edge.a.point.x) * dz - (point.z - edge.a.point.z) * dx) / horizontal;
          // Valid centers start/end where one animal's clearance circle touches
          // this authored segment. No lateral offset or off-route step is added.
          if (perpendicular < clearance) {
            const radius = Math.sqrt(clearance ** 2 - perpendicular ** 2) * edge.distance / horizontal;
            const projected = along * edge.distance / horizontal;
            for (const bot of bots) {
              const offset = (bot.index - 2.5) * spacing;
              centers.push(THREE.MathUtils.clamp(projected - offset - radius - 0.00001, low, high),
                THREE.MathUtils.clamp(projected - offset + radius + 0.00001, low, high));
            }
          }
          centers.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
          const center = centers.find((value) => bots.every((bot) => {
            const position = edge.a.point.clone().lerp(edge.b.point, (value + (bot.index - 2.5) * spacing) / edge.distance);
            return Math.hypot(position.x - point.x, position.z - point.z) >= clearance;
          }));
          if (center === undefined) continue;
          const routes = bots.map((bot) => {
            const destination = edge.a.point.clone().lerp(edge.b.point, (center + (bot.index - 2.5) * spacing) / edge.distance);
            const routes = [edge.a, edge.b].map((endpoint) => {
              const path = graph.shortest(bot.start, endpoint);
              return path && { route: [...path.path, destination], distance: path.distance + endpoint.point.distanceTo(destination) };
            }).filter(Boolean).sort((a, b) => a.distance - b.distance);
            return routes[0]?.route;
          });
          if (routes.every((route) => route?.length)) {
            nearest = candidate;
            plans = routes;
            break;
          }
        }
        if (!plans) return false;
      } else {
        plans = bots.map((bot) => bot.toDispatch.length >= 2 &&
          bot.toDispatch[0].distanceTo(bot.start) < 0.001 ? bot.toDispatch.slice(0, 2) : null);
        if (plans.some((route) => !route?.length)) return false;
      }
      // Route validation is atomic: failed summons leave prior work and any
      // existing gathering unchanged, rather than gathering only some animals.
      gatherTarget = (nearest?.projection || dispatch).toArray();
      gatherRequested = true;
      for (const bot of bots) {
        bot.resumeDuringGather = false;
        bot.gatherRoute = plans[bot.index];
        bot.gatherLookTarget = (point || dispatch).clone();
        if (bot.leisure && bot.leisure.phase !== 'returning') returnHome(bot, bot.leisure);
        if (bot.gathered) {
          bot.gathered = false;
          bot.gathering = { kind: 'gather', trail: bot.gatherTrail, route: [] };
          returnHome(bot, bot.gathering);
        } else if (bot.gathering && bot.gathering.phase !== 'returning') returnHome(bot, bot.gathering);
        schedule(bot);
      }
      publish();
      return snapshot();
    },
    releaseAll() {
      gatherRequested = false;
      gatherTarget = null;
      for (const bot of bots) {
        if (bot.gathered) {
          bot.gathered = false;
          bot.gathering = { kind: 'gather', trail: bot.gatherTrail, route: [] };
          returnHome(bot, bot.gathering);
        } else if (bot.gathering && bot.gathering.phase !== 'returning') returnHome(bot, bot.gathering);
        schedule(bot);
      }
      publish();
      return snapshot();
    },
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
      const reducedMotion = Boolean(reduced?.matches);
      now = clock;
      if (firstClock === null) {
        firstClock = clock;
        for (const bot of bots) bot.idleAt += clock;
      }
      for (const bot of bots) {
        const step = bot.task ? stepBot(bot, delta, clock) : stepLife(bot, delta, clock);
        const behavior = bot.leisure?.phase === 'activity' && ['play', 'clean'].includes(bot.leisure.kind) ? bot.leisure.kind : null;
        bot.rig?.update(delta, clock, step, bot.task?.locus?.position || bot.leisure?.locus?.position, reducedMotion, behavior);
      }
      if (bots.some((bot) => bot.task || bot.leisure || bot.gathering) && clock - lastStatus >= 0.4) {
        lastStatus = clock;
        publish();
      }
      return followed?.group || null;
    },
  };
}
