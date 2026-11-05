import * as THREE from 'three';

const EYE_HEIGHT = 1.6;
const WALK_SPEED = 2.3;
const STEP_HEIGHT = 0.28;
const MAX_DROP = 0.33;
const BODY_RADIUS = 0.21;
const BODY_PROBES = [0.32, 0.72, 1.19, 1.67];
const PROBE_OFFSETS = [-BODY_RADIUS * 0.68, 0, BODY_RADIUS * 0.68];
const CARDINAL_DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const PITCH_LIMIT = Math.PI / 2 - 0.08;
const CELL_SIZE = 2;
const DOWN = new THREE.Vector3(0, -1, 0);
const COLLISION_PARTS = new Set(['architecture', 'circulation', 'furniture', 'glazing', 'landscape', 'roof']);
const MOVEMENT_KEYS = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};

const gridCell = (value) => Math.floor(value / CELL_SIZE);
const cellKey = (x, z) => `${x},${z}`;

function createCollisionGrid(model) {
  // The GLB groups geometry by material. Index individual triangles so the
  // controller only queries the piece of the estate beneath and around the player.
  const cells = new Map();
  const normal = new THREE.Vector3();
  const edge = new THREE.Vector3();
  model.updateWorldMatrix(true, true);
  model.traverse((object) => {
    if (!object.isMesh || !COLLISION_PARTS.has(object.userData.part)) return;
    const position = object.geometry.getAttribute('position');
    if (!position) return;
    const water = (object.material.name || '').includes('Reflecting pool');
    const vertices = Array.from({ length: position.count }, (_, index) =>
      new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld));
    const indices = object.geometry.index;
    const vertex = (index) => vertices[indices ? indices.getX(index) : index];
    for (let i = 0; i < (indices?.count ?? position.count); i += 3) {
      const a = vertex(i);
      const b = vertex(i + 1);
      const c = vertex(i + 2);
      normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
      const minY = Math.min(a.y, b.y, c.y);
      const maxY = Math.max(a.y, b.y, c.y);
      const triangle = { a, b, c, minY, maxY, walkable: normal.y > 0.68, water };
      const left = gridCell(Math.min(a.x, b.x, c.x));
      const right = gridCell(Math.max(a.x, b.x, c.x));
      const front = gridCell(Math.min(a.z, b.z, c.z));
      const back = gridCell(Math.max(a.z, b.z, c.z));
      for (let x = left; x <= right; x++) {
        for (let z = front; z <= back; z++) {
          const key = cellKey(x, z);
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(triangle);
        }
      }
    }
  });
  return cells;
}

function createMovementPad(touchMoves) {
  const pad = document.createElement('div');
  pad.className = 'human-movement';
  pad.setAttribute('role', 'group');
  pad.setAttribute('aria-label', '漫遊移動');
  pad.hidden = true;
  for (const [direction, label, glyph] of [
    ['forward', '往前走', '↑'], ['left', '向左走', '←'],
    ['back', '往後走', '↓'], ['right', '向右走', '→'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.direction = direction;
    button.setAttribute('aria-label', label);
    button.textContent = glyph;
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touchMoves.set(event.pointerId, direction);
      button.dataset.held = '';
    });
    const release = (event) => {
      touchMoves.delete(event.pointerId);
      delete button.dataset.held;
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    pad.append(button);
  }
  document.body.append(pad);
  return pad;
}

function nearbyApproaches(arrival, path) {
  if (!arrival || !path || path.length < 2) return [];
  const previous = path.at(-2);
  const distance = Math.hypot(previous[0] - arrival[0], previous[2] - arrival[2]);
  return [0.25, 0.5, 0.8].filter((meters) => meters < distance).map((meters) =>
    arrival.map((value, axis) => THREE.MathUtils.lerp(value, previous[axis], meters / distance)));
}

export function createHumanNavigation({ camera, canvas, manifest, model, onChange }) {
  const rooms = new Map(manifest.rooms.map((room) => [room.id, room]));
  const roomSamples = manifest.rooms.map((room) => ({
    room,
    points: [room.position, ...room.loci.map((locus) => locus.walk_position)].filter(Boolean),
  }));
  const levelHeights = [0, 1, 2].map((level) => Math.min(...manifest.rooms
    .filter((room) => room.floor === level).map((room) => room.walk_height)));
  const floorThresholds = [levelHeights[0] - 0.17,
    (levelHeights[0] + levelHeights[1]) / 2, (levelHeights[1] + levelHeights[2]) / 2];
  let grid;
  let active = false;
  let room = null;
  let floor = null;
  let yaw = 0;
  let pitch = 0;
  let drag = null;
  const keys = new Set();
  const touchMoves = new Map();
  const movementPad = createMovementPad(touchMoves);
  const feet = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const move = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const cast = new THREE.Ray();
  const intersection = new THREE.Vector3();
  const nearby = new Set();

  function groundAt(x, z, expectedY) {
    cast.origin.set(x, expectedY + STEP_HEIGHT + 0.001, z);
    cast.direction.copy(DOWN);
    let height = expectedY - MAX_DROP;
    let surface = null;
    for (const triangle of grid.get(cellKey(gridCell(x), gridCell(z))) ?? []) {
      if (!triangle.walkable || triangle.maxY <= height || triangle.minY > cast.origin.y) continue;
      const hit = cast.intersectTriangle(triangle.a, triangle.b, triangle.c, true, intersection);
      if (hit && hit.y > height) {
        height = hit.y;
        surface = triangle;
      }
    }
    return surface && !surface.water ? height : null;
  }

  function clearAhead(x, y, z, dx, dz, distance) {
    const reach = distance + BODY_RADIUS;
    nearby.clear();
    for (let i = gridCell(Math.min(x, x + dx * reach) - BODY_RADIUS); i <= gridCell(Math.max(x, x + dx * reach) + BODY_RADIUS); i++) {
      for (let j = gridCell(Math.min(z, z + dz * reach) - BODY_RADIUS); j <= gridCell(Math.max(z, z + dz * reach) + BODY_RADIUS); j++) {
        for (const triangle of grid.get(cellKey(i, j)) ?? []) nearby.add(triangle);
      }
    }
    cast.direction.set(dx, 0, dz);
    for (const probe of BODY_PROBES) {
      for (const offset of PROBE_OFFSETS) {
        cast.origin.set(x - dz * offset, y + probe, z + dx * offset);
        for (const { a, b, c, minY, maxY } of nearby) {
          if (cast.origin.y < minY || cast.origin.y > maxY) continue;
          const hit = cast.intersectTriangle(a, b, c, false, intersection);
          if (hit && hit.distanceToSquared(cast.origin) < reach * reach) return false;
        }
      }
    }
    return true;
  }

  function tryMove(x, z) {
    const distance = Math.hypot(x, z);
    if (!distance) return false;
    const nextX = feet.x + x;
    const nextZ = feet.z + z;
    const height = groundAt(nextX, nextZ, feet.y);
    if (height === null || !clearAhead(feet.x, feet.y, feet.z, x / distance, z / distance, distance)) return false;
    feet.set(nextX, height, nextZ);
    return true;
  }

  function syncCamera() {
    camera.position.set(feet.x, feet.y + EYE_HEIGHT, feet.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  function face(position, level = false) {
    aim.fromArray(position).sub(camera.position);
    if (level) aim.y = 0;
    const horizontal = Math.hypot(aim.x, aim.z);
    if (horizontal > 0.001) yaw = Math.atan2(-aim.x, -aim.z);
    pitch = THREE.MathUtils.clamp(Math.atan2(aim.y, horizontal), -PITCH_LIMIT, PITCH_LIMIT);
    syncCamera();
  }

  function resetInput() {
    keys.clear();
    touchMoves.clear();
    for (const button of movementPad.children) delete button.dataset.held;
    drag = null;
  }

  function publish() {
    onChange?.({ active, room, floor });
  }

  function locate() {
    const nextFloor = floorThresholds.findLastIndex((height) => feet.y >= height);
    let nextRoom = null;
    let best = 4 * 4;
    for (const sample of roomSamples) {
      if (sample.room.floor !== nextFloor || Math.abs(feet.y - sample.room.walk_height) > 0.5) continue;
      for (const [x, , z] of sample.points) {
        const distance = (feet.x - x) ** 2 + (feet.z - z) ** 2;
        const score = distance - (sample.room === room ? 0.8 : 0);
        if (score >= best) continue;
        best = score;
        nextRoom = sample.room;
      }
    }
    if (nextRoom === room && nextFloor === floor) return;
    room = nextRoom;
    floor = nextFloor;
    publish();
  }

  function enter(roomId = 'hall', locusId) {
    const targetRoom = rooms.get(roomId);
    if (!targetRoom) return false;
    grid ??= createCollisionGrid(model);
    const locus = targetRoom.loci.find((item) => item.id === locusId);
    const entry = targetRoom.entry_path.at(-1);
    const approach = locus ?? targetRoom.loci[0];
    const arrival = roomId === 'hall' && !locus ? entry : approach?.walk_position;
    const candidates = [arrival, ...(locus ? nearbyApproaches(arrival, locus.walk_path) : []),
      ...(approach?.walk_path.slice(1).reverse() ?? []),
      ...targetRoom.loci.map((item) => item.walk_position), entry];
    const target = locus?.position ?? targetRoom.position;
    let spawn;
    for (const candidate of candidates) {
      if (!candidate) continue;
      const [x, y, z] = candidate;
      const height = groundAt(x, z, y);
      if (height === null) continue;
      const position = [x, height, z];
      spawn ??= position;
      const heading = Math.atan2(x - target[0], z - target[2]);
      const sine = Math.sin(heading);
      const cosine = Math.cos(heading);
      const step = 0.13;
      const openDirections = CARDINAL_DIRECTIONS.filter(([localX, localZ]) => {
        const dx = cosine * localX + sine * localZ;
        const dz = -sine * localX + cosine * localZ;
        return groundAt(x + dx * step, z + dz * step, height) !== null &&
          clearAhead(x, height, z, dx, dz, step);
      });
      if (openDirections.length >= (locus ? 1 : 2)) {
        spawn = position;
        break;
      }
    }
    if (!spawn) return false;
    feet.fromArray(spawn);
    active = true;
    room = targetRoom;
    floor = targetRoom.floor;
    resetInput();
    movementPad.hidden = false;
    document.body.classList.add('human-walking');
    syncCamera();
    face(target, !locus);
    publish();
    return true;
  }

  function exit() {
    if (!active) return;
    active = false;
    room = null;
    floor = null;
    movementPad.hidden = true;
    document.body.classList.remove('human-walking');
    resetInput();
    publish();
  }

  function blockedInput(target = document.activeElement) {
    return target?.isContentEditable || target?.closest?.('input, textarea, select, [role="textbox"], dialog') || document.querySelector('dialog[open]');
  }

  window.addEventListener('keydown', (event) => {
    if (!active || !Object.hasOwn(MOVEMENT_KEYS, event.code) || blockedInput() || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', resetInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput(); });

  canvas.addEventListener('pointerdown', (event) => {
    if (!active || drag || event.button !== 0 || blockedInput(canvas)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== drag?.id) return;
    const sensitivity = event.pointerType === 'touch' ? 0.005 : 0.0035;
    yaw -= (event.clientX - drag.x) * sensitivity;
    pitch = THREE.MathUtils.clamp(pitch - (event.clientY - drag.y) * sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
    drag.x = event.clientX;
    drag.y = event.clientY;
    syncCamera();
  });
  const endDrag = (event) => { if (drag?.id === event.pointerId) drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);

  return {
    enter,
    exit,
    isActive: () => active,
    getPosition: () => feet.clone(),
    lookAtLocus(targetRoom, locus) {
      if (!active || room?.id !== targetRoom.id) return enter(targetRoom.id, locus.id);
      face(locus.position);
      return true;
    },
    update(delta) {
      if (!active) return;
      if (blockedInput()) resetInput();
      if (!keys.size && !touchMoves.size) return;
      const pressed = new Set([...touchMoves.values(), ...[...keys].map((code) => MOVEMENT_KEYS[code])]);
      const side = Number(pressed.has('right')) - Number(pressed.has('left'));
      const forward = Number(pressed.has('forward')) - Number(pressed.has('back'));
      if (!side && !forward) return;
      direction.set(Math.cos(yaw), 0, -Math.sin(yaw));
      move.set(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(forward)
        .addScaledVector(direction, side).normalize().multiplyScalar(WALK_SPEED * Math.min(delta, 0.07));
      const steps = Math.max(1, Math.ceil(move.length() / 0.06));
      move.divideScalar(steps);
      for (let step = 0; step < steps; step++) {
        if (tryMove(move.x, move.z)) continue;
        tryMove(move.x, 0);
        tryMove(0, move.z);
      }
      syncCamera();
      locate();
    },
  };
}
