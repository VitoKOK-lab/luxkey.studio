import assert from 'node:assert/strict';
import test from 'node:test';
import { Color, Scene, Vector3 } from 'three';
import { createRoomLighting } from '../app/room-lighting.js';

const fixture = (id, type, role, x, y = 0) => ({
  id, type, role, position: [x, y + 2.85, 0], target: [x, y + 0.4, 0],
  color: '#ffe7cb', intensity: 48, distance: 7, angle: 0.84, penumbra: 0.63,
});

function room(id, x, floor = 0, fixtures) {
  const y = floor * 4;
  return {
    id, floor, interior: true, bounds: { min: [x - 4, y, -4], max: [x + 4, y + 3.6, 4] },
    fixtures: fixtures ?? [fixture(`${id}-ceiling`, 'spot', 'ambient', x, y), fixture(`${id}-sconce`, 'point', 'accent', x, y)],
  };
}

function setup(rooms, circulation = []) {
  const scene = new Scene();
  const controller = createRoomLighting({ scene, manifest: { version: 1, rooms, circulation } });
  const all = () => scene.children.flatMap((group) => group.children.filter(({ isLight }) => isLight));
  const lit = () => all().filter(({ intensity }) => intensity > 0);
  const light = (id) => lit().find((source) => source.userData.fixtureId === id);
  function step(x, options = {}, delta = 1 / 60) {
    return controller.update({ viewMode: 'human', position: new Vector3(x, 1.6, 0), ...options }, delta);
  }
  function settle(x, options) {
    for (let frame = 0; frame < 60; frame++) step(x, options);
  }
  return { scene, controller, step, settle, all, lit, light };
}

test('transitions between authored fixture positions with a fixed-size light pool', () => {
  function furnished(id, x) {
    return room(id, x, 0, ['point', 'spot'].flatMap((type) => Array.from({ length: 8 }, (_, index) =>
      fixture(`${id}-${type}-${index}`, type, index === 7 ? 'task' : 'ambient', x + index * 0.2))));
  }
  const runtime = setup([furnished('west', -4), furnished('east', 4)]);
  assert.equal(runtime.step(-3).roomId, 'west');
  const pool = runtime.all();
  assert.equal(pool.filter(({ isPointLight }) => isPointLight).length, 5);
  assert.equal(pool.filter(({ isSpotLight }) => isSpotLight).length, 6);
  assert.equal(runtime.lit().length, 9);
  assert.ok(runtime.light('west-spot-7'));
  const retiring = runtime.lit().find(({ isPointLight }) => isPointLight);
  const intensity = retiring.intensity;
  assert.equal(runtime.step(0.3).roomId, 'east');
  assert.ok(retiring.intensity > 0 && retiring.intensity < intensity);
  assert.ok(runtime.lit().some(({ userData }) => userData.fixtureId.startsWith('east-')));
  runtime.settle(3);
  assert.deepEqual(runtime.all(), pool);
  assert.equal(runtime.lit().length, 9);
  assert.ok(runtime.lit().every(({ userData, position }) => userData.fixtureId.startsWith('east-') && position.x >= 4));
  runtime.controller.dispose();
  assert.equal(runtime.all().length, 0);
});

test('room detection has doorway hysteresis and follows the steward through third person', () => {
  const { step, settle } = setup([room('west', -4), room('east', 4)]);
  assert.equal(step(-1, { roomId: 'east' }).roomId, 'west');
  assert.equal(step(0.12).roomId, 'west');
  assert.equal(step(0.28).roomId, 'east');
  assert.equal(step(-0.12).roomId, 'east');
  const third = { viewMode: 'third', roomId: 'east', focusPosition: new Vector3(-2, 1.1, 0) };
  assert.equal(step(30, third).roomId, 'west');
  const overview = { viewMode: 'overview', roomId: 'east', focusPosition: new Vector3(4, 1.1, 0) };
  settle(30, overview);
  assert.equal(step(30, overview).roomId, 'east');
  assert.ok(step(30, overview).interior < 0.001);
});

test('floor cuts immediately retire hidden fixtures and leave a guide on a visible stair', () => {
  const guide = { ...room('stair', 1, 1, [fixture('tread', 'spot', 'path', 1)]), interior: false,
    bounds: { min: [0, 0, -1], max: [2, 6, 1] } };
  const { step, settle, light } = setup([room('ground', 0), room('upper', 0, 1)], [guide]);
  assert.equal(step(0, { position: new Vector3(0, 5.6, 0) }).roomId, 'upper');
  assert.ok(light('upper-ceiling'));
  const third = { viewMode: 'third', floor: 0, focusPosition: new Vector3(1, 1.2, 0) };
  assert.equal(step(5, third).roomId, 'ground');
  assert.equal(light('upper-ceiling'), undefined);
  assert.equal(light('upper-sconce'), undefined);
  settle(5, third);
  assert.ok(light('ground-ceiling'));
  assert.ok(light('tread'));
});

test('spotlight shadow is cached and refreshed when the visible slice changes', () => {
  const { controller, step, all, light } = setup([room('hall', 0)]);
  step(0);
  const shadows = all().filter(({ castShadow }) => castShadow);
  assert.equal(shadows.length, 1);
  const [source] = shadows;
  assert.equal(source, light('hall-ceiling'));
  assert.equal(source.shadow.autoUpdate, false);
  assert.equal(source.shadow.needsUpdate, true);
  assert.deepEqual(source.target.position.toArray(), [0, 0.4, 0]);
  assert.equal(source.distance, 7);
  source.shadow.needsUpdate = false;
  step(0.4);
  assert.equal(source.shadow.needsUpdate, false);
  step(0.4, { floor: 0 });
  assert.equal(source.shadow.needsUpdate, true);
  source.shadow.needsUpdate = false;
  controller.invalidateShadows();
  assert.equal(source.shadow.needsUpdate, true);
});

test('brightness clamps safely and visual styles color the accents only', () => {
  const { controller, step, settle, light } = setup([room('hall', 0)]);
  controller.setLevel(4);
  step(0);
  const ceiling = light('hall-ceiling');
  const accent = light('hall-sconce');
  const highLevel = ceiling.intensity;
  assert.ok(highLevel < 48 * 1.5, 'ambient fixtures are calibrated below authored Cycles power');
  const warm = new Color('#ffe7cb');
  controller.setStyle('cyberpunk');
  assert.ok(ceiling.color.equals(warm));
  assert.ok(!accent.color.equals(warm));
  controller.setStyle('original');
  assert.ok(accent.color.equals(warm));
  controller.setLevel(-4);
  controller.setLevel(NaN);
  settle(0);
  assert.ok(Math.abs(ceiling.intensity / highLevel - 0.7 / 1.5) < 0.001,
    'brightness remains proportional after browser fixture calibration');
  settle(30);
  assert.equal(light('hall-ceiling'), undefined);
});
