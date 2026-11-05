import { Box3, Color, Group, MathUtils, PointLight, SpotLight, Vector3 } from 'three';

const POOL_SIZE = { point: 5, spot: 6 };
const ROOM_MARGIN = 0.24;
const SELECTION_STEP = 0.28;
const FADE_THRESHOLD = 0.012;
const COOL_ACCENT = new Color(0x85dcff);
const CYAN_ACCENT = new Color(0x54eaff);
const ROSE_ACCENT = new Color(0xff79ba);
// The browser uses inverse-square point sources, without Cycles' area-light
// spreading or occlusion. Calibrate broad fill separately from reading/path
// lights so overlapping pools do not flatten every pale surface into white.
const FIXTURE_GAIN = { ambient: 0.36, task: 0.65, accent: 0.60, path: 1 };

const isVector = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const contains = (box, position, margin) =>
  position.x >= box.min.x - margin && position.x <= box.max.x + margin &&
  position.y >= box.min.y - margin && position.y <= box.max.y + margin &&
  position.z >= box.min.z - margin && position.z <= box.max.z + margin;

function readRegions(manifest) {
  if (manifest?.version !== 1) return [];
  const regions = [];
  for (const [source, circulation] of [[manifest.rooms, false], [manifest.circulation, true]]) {
    if (!Array.isArray(source)) continue;
    for (const entry of source) {
      const { id, floor, interior, bounds, fixtures } = entry ?? {};
      if (typeof id !== 'string' || !Number.isInteger(floor) || !isVector(bounds?.min) || !isVector(bounds?.max)) continue;
      const box = new Box3(new Vector3().fromArray(bounds.min), new Vector3().fromArray(bounds.max));
      if (box.isEmpty()) continue;
      const region = { id, floor, interior: interior === true, circulation, box, fixtures: [], selected: 0 };
      regions.push(region);
      if (!Array.isArray(fixtures)) continue;
      for (const item of fixtures) {
        const { type, position, target, color, intensity, distance } = item ?? {};
        if ((type !== 'point' && type !== 'spot') || !isVector(position) ||
            !Number.isFinite(intensity) || intensity <= 0 || !Number.isFinite(distance) || distance <= 0 ||
            (type === 'spot' && !isVector(target))) continue;
        region.fixtures.push({
          id: item.id, role: item.role, type, region, intensity, distance,
          position: new Vector3().fromArray(position),
          target: type === 'spot' ? new Vector3().fromArray(target) : null,
          angle: Number.isFinite(item.angle) ? MathUtils.clamp(item.angle, 0.04, Math.PI * 0.49) : Math.PI / 4,
          penumbra: Number.isFinite(item.penumbra) ? MathUtils.clamp(item.penumbra, 0, 1) : 0.5,
          color: new Color(color ?? 0xffebd0),
          alternateAccent: region.fixtures.length % 2 === 1,
          wanted: false,
          score: 0,
          slot: null,
        });
      }
    }
  }
  return regions;
}

function createPool(group, type, shadows) {
  const slots = Array.from({ length: POOL_SIZE[type] }, (_, index) => {
    const light = type === 'point' ? new PointLight(0xffffff, 0, 0.25, 2) : new SpotLight(0xffffff, 0, 0.25);
    light.name = `Estate ${type} light ${index + 1}`;
    group.add(light);
    if (light.isSpotLight) group.add(light.target);
    return { light, fixture: null, weight: 0 };
  });
  const shadowSlot = type === 'spot' && shadows ? slots[0] : null;
  if (shadowSlot) {
    const { light } = shadowSlot;
    light.castShadow = true;
    light.shadow.autoUpdate = false;
    light.shadow.camera.near = 0.08;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0002;
    light.shadow.normalBias = 0.024;
  }
  return { candidates: [], desired: [], slots, shadowSlot };
}

function available(region, floor, viewMode) {
  return floor == null || region.floor <= floor || (viewMode === 'third' && region.circulation);
}

function findRegion(regions, position, previous, floor, viewMode) {
  if (previous && available(previous, floor, viewMode) && contains(previous.box, position, ROOM_MARGIN)) return previous;
  // The edge of a landing can overlap a room entrance. Give enclosed rooms priority.
  let circulation = null;
  for (const region of regions) {
    if (!available(region, floor, viewMode) || !contains(region.box, position, 0)) continue;
    if (!region.circulation) return region;
    circulation ??= region;
  }
  return circulation;
}

function rankFixtures(regions, pools, position, primary, floor, viewMode) {
  const overview = viewMode === 'overview';
  for (const region of regions) {
    region.selected = 0;
    if (!available(region, floor, viewMode)) continue;
    const isPrimary = region === primary;
    if (!isPrimary && overview && floor != null && region.floor !== floor) continue;
    if (!isPrimary && !overview) {
      if (primary?.interior && !region.circulation) continue;
      if (primary && !region.circulation && region.floor !== primary.floor) continue;
      if (position.y < region.box.min.y - 0.9 || position.y > region.box.max.y + 0.9) continue;
    }
    for (const fixture of region.fixtures) {
      if (!isPrimary && !overview && fixture.position.distanceToSquared(position) > (fixture.distance + 1.15) ** 2) continue;
      const aim = fixture.target ?? fixture.position;
      const distance = Math.hypot(aim.x - position.x, (aim.y - position.y) * 1.4, aim.z - position.z);
      fixture.score = distance + (isPrimary ? 0 : 16) - (fixture.wanted ? 0.48 : 0);
      pools[fixture.type].candidates.push(fixture);
    }
  }
}

const byScore = (a, b) => a.score - b.score;
const isAmbient = (fixture) => fixture.role === 'ambient';
const isFocal = (fixture) => fixture.role === 'task' || fixture.role === 'accent';

function chooseFixtures({ candidates, desired, slots }, primary, position, overview) {
  for (const fixture of desired) fixture.wanted = false;
  desired.length = 0;
  candidates.sort(byScore);
  const limit = slots.length - 1; // Keep a slot available while previous lights fade out.

  function choose(fixture) {
    if (!fixture || fixture.wanted || desired.length === limit) return;
    fixture.wanted = true;
    desired.push(fixture);
    fixture.region.selected++;
  }

  if (primary?.interior) {
    choose(candidates.find((fixture) => fixture.region === primary && isAmbient(fixture)));
    choose(candidates.find((fixture) => fixture.region === primary && isFocal(fixture)));
    if (!overview) {
      choose(candidates.find((fixture) => fixture.role === 'path' && fixture.region.circulation &&
        contains(fixture.region.box, position, 0)));
    }
  } else if (overview && !primary) {
    // An estate/floor overview shows several rooms. Spread the light across them.
    for (const fixture of candidates) {
      if (fixture.region.selected < 1) choose(fixture);
    }
  }
  for (const fixture of candidates) choose(fixture);
  candidates.length = 0;
}

function applyColor(light, fixture, style) {
  light.color.copy(fixture.color);
  if (fixture.role !== 'accent') return;
  if (style === 'scifi') light.color.lerp(COOL_ACCENT, 0.42);
  if (style === 'cyberpunk') light.color.lerp(fixture.alternateAccent ? ROSE_ACCENT : CYAN_ACCENT, 0.78);
}

function clearSlot(slot) {
  slot.fixture.slot = null;
  slot.fixture = null;
  slot.weight = 0;
  slot.light.intensity = 0;
  slot.light.userData.fixtureId = null;
  if (slot.light.castShadow) slot.light.shadow.needsUpdate = false;
}

function bindSlot(slot, fixture, style) {
  const { light } = slot;
  slot.fixture = fixture;
  fixture.slot = slot;
  light.userData.fixtureId = fixture.id;
  light.position.copy(fixture.position);
  light.distance = fixture.distance;
  if (light.isSpotLight) {
    light.target.position.copy(fixture.target);
    light.angle = fixture.angle;
    light.penumbra = fixture.penumbra;
  }
  applyColor(light, fixture, style);
  if (light.castShadow) light.shadow.needsUpdate = true;
}

function updatePool({ desired, slots, shadowSlot }, level, style, floor, viewMode, delta, first) {
  const principal = shadowSlot ? desired[0] : null;
  for (const slot of slots) {
    const fixture = slot.fixture;
    if (!fixture) continue;
    if (!available(fixture.region, floor, viewMode)) {
      clearSlot(slot);
      continue;
    }
    const wanted = slot === shadowSlot ? fixture === principal : fixture.wanted && fixture !== principal;
    slot.weight = MathUtils.damp(slot.weight, wanted ? 1 : 0, wanted ? 11 : 17, delta);
    if (!wanted && slot.weight < FADE_THRESHOLD) clearSlot(slot);
  }
  for (const fixture of desired) {
    if (fixture.slot) continue;
    let slot = null;
    if (fixture === principal) {
      if (!shadowSlot.fixture) slot = shadowSlot;
    } else {
      for (const candidate of slots) {
        if (candidate === shadowSlot || candidate.fixture) continue;
        slot = candidate;
        break;
      }
    }
    if (!slot) continue;
    bindSlot(slot, fixture, style);
    slot.weight = first ? 1 : MathUtils.damp(0, 1, 11, delta);
  }
  for (const slot of slots) {
    if (slot.fixture) slot.light.intensity = slot.fixture.intensity *
      (FIXTURE_GAIN[slot.fixture.role] ?? 1) *
      (style === 'cyberpunk' && slot.fixture.role === 'accent' ? 1.22 : 1) * slot.weight * level;
  }
}

export function createRoomLighting({ scene, manifest, shadows = true }) {
  const regions = readRegions(manifest);
  const byId = new Map(regions.map((region) => [region.id, region]));
  const group = new Group();
  group.name = 'Estate fixture lighting';
  const pools = {};
  for (const type of Object.keys(POOL_SIZE)) {
    if (regions.some((region) => region.fixtures.some((fixture) => fixture.type === type))) pools[type] = createPool(group, type, shadows);
  }
  const poolList = Object.values(pools);
  if (poolList.length) scene.add(group);
  const state = { interior: 0, roomId: null };
  const lastPosition = new Vector3();
  let physical = null;
  let primary = null;
  let previousMode, previousFloor;
  let style = 'original';
  let level = 1;
  let desiredLevel = 1;

  function invalidateShadows() {
    const slot = pools.spot?.shadowSlot;
    if (slot?.fixture) slot.light.shadow.needsUpdate = true;
  }

  return {
    update({ position, focusPosition, viewMode = 'overview', roomId, floor }, delta) {
      const first = previousMode === undefined;
      const overview = viewMode === 'overview';
      const anchor = focusPosition ?? position;
      const viewer = overview ? position : anchor;
      physical = findRegion(regions, viewer, viewMode === previousMode ? physical : null, floor, viewMode);
      const selected = overview ? byId.get(roomId) : null;
      const next = selected && available(selected, floor, viewMode) ? selected : physical;
      if (first || next !== primary || viewMode !== previousMode || floor !== previousFloor ||
          anchor.distanceToSquared(lastPosition) > SELECTION_STEP ** 2) {
        primary = next;
        lastPosition.copy(anchor);
        rankFixtures(regions, pools, anchor, primary, floor, viewMode);
        for (const pool of poolList) chooseFixtures(pool, primary, anchor, overview);
      }
      if (viewMode !== previousMode || floor !== previousFloor) invalidateShadows();
      previousMode = viewMode;
      previousFloor = floor;
      level = first ? desiredLevel : MathUtils.damp(level, desiredLevel, 11, delta);
      const inside = physical?.interior ? 1 : 0;
      state.interior = first ? inside : MathUtils.damp(state.interior, inside, 9, delta);
      if (Math.abs(state.interior - inside) < 0.001) state.interior = inside;
      state.roomId = primary?.id ?? null;
      for (const pool of poolList) updatePool(pool, level, style, floor, viewMode, delta, first);
      return state;
    },
    setLevel(value) {
      if (Number.isFinite(value)) desiredLevel = MathUtils.clamp(value, 0.7, 1.5);
    },
    setStyle(value) {
      if (style === value) return;
      style = value;
      for (const { slots } of poolList) {
        for (const { light, fixture } of slots) if (fixture) applyColor(light, fixture, style);
      }
    },
    invalidateShadows,
    dispose() {
      group.removeFromParent();
      for (const { slots } of poolList) {
        for (const { light } of slots) light.dispose();
      }
    },
  };
}
