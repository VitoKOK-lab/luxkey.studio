import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { createFollowCamera } from '../app/follow-camera.js';

const { degToRad: radians } = MathUtils;
const UP = new Vector3(0, 1, 0);
const angularDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const direction = (camera) => camera.getWorldDirection(new Vector3());
const viewingYaw = (camera) => {
  const { x, z } = direction(camera);
  return Math.atan2(-x, -z);
};
const close = (value, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(value - expected) <= tolerance, `${value} should be within ${tolerance} of ${expected}`);
};

function setup(mode, heading = 0, reduced = false) {
  const camera = new PerspectiveCamera();
  const target = new Vector3();
  const group = new Group();
  group.rotation.y = heading;
  const eyeOffset = new Vector3(0, 0.8, 0.9);
  const bot = { id: 'hall', group, eyeOffset, eyeHeight: eyeOffset.y };
  const controller = createFollowCamera(camera, target);
  camera.position.set(54, 35, 68);
  controller.update(mode, bot, 0, reduced);
  return { camera, target, controller, bot };
}

test('third-person view tracks translation while preserving its world-relative direction', () => {
  const { camera, target, controller, bot } = setup('third');
  const initialDirection = direction(camera);
  const initialOffset = camera.position.clone().sub(target);
  bot.group.rotation.y = Math.PI;
  bot.group.position.set(4, 1, 3);
  controller.update('third', bot, 1 / 60, false);
  assert.ok(target.x > 0 && target.x < 4);
  for (let frame = 0; frame < 180; frame++) {
    bot.group.rotation.y += 0.22;
    controller.update('third', bot, 1 / 60, false);
    close(direction(camera).distanceTo(initialDirection), 0);
    close(camera.position.clone().sub(target).distanceTo(initialOffset), 0);
  }
  close(target.distanceTo(new Vector3(4, 1.52, 3)), 0, 1e-6);
});

test('entering follow mode or changing stewards places the camera nearby immediately', () => {
  const { camera, controller, bot } = setup('third', 0.4);
  assert.ok(camera.position.distanceTo(bot.group.position) < 6);
  controller.drag(300, 300);
  controller.update('third', bot, 1 / 30, false);
  const group = new Group();
  group.position.set(-30, 10, 12);
  group.rotation.y = -0.7;
  const other = { ...bot, id: 'garden', group };
  controller.update('third', other, 0, false);
  assert.ok(camera.position.distanceTo(group.position) < 6);
  controller.update('steward', other, 0, false);
  close(camera.position.distanceTo(other.eyeOffset.clone().applyAxisAngle(UP, group.rotation.y).add(group.position)), 0);
  close(angularDifference(viewingYaw(camera), group.rotation.y + Math.PI), 0);
  close(camera.rotation.x, 0);
});

test('POV automatic yaw takes the short path through the ±180° boundary and stays below 25°/s', () => {
  for (const sign of [-1, 1]) {
    const { camera, controller, bot } = setup('steward', radians(179) * sign);
    const start = viewingYaw(camera);
    bot.group.rotation.y = radians(-179) * sign;
    controller.update('steward', bot, 1 / 30, false);
    const firstStep = angularDifference(viewingYaw(camera), start) * sign;
    assert.ok(firstStep > 0 && firstStep <= radians(25) / 30);
    for (let frame = 0; frame < 180; frame++) controller.update('steward', bot, 1 / 60, false);
    close(angularDifference(viewingYaw(camera), start), radians(2) * sign, 1e-5);

    bot.group.rotation.y += radians(170) * sign;
    const previous = viewingYaw(camera);
    controller.update('steward', bot, 1 / 30, false);
    close(angularDifference(viewingYaw(camera), previous) * sign, radians(25) / 30);
    close(camera.position.y, bot.eyeHeight);
    close(camera.rotation.z, 0);
  }
});

test('manual yaw stays below 45°/s and can look behind in either mode', () => {
  for (const mode of ['third', 'steward']) {
    const { camera, controller, bot } = setup(mode);
    const start = viewingYaw(camera);
    const sensitivity = mode === 'third' ? 0.0022 : 0.0024;
    controller.drag(-Math.PI / sensitivity, 0);
    let previous = start;
    for (let frame = 0; frame < 420; frame++) {
      controller.update(mode, bot, 1 / 60, false);
      const current = viewingYaw(camera);
      const step = angularDifference(current, previous);
      assert.ok(step >= -1e-8 && step <= radians(45) / 60 + 1e-8);
      previous = current;
    }
    close(Math.abs(angularDifference(previous, start)), Math.PI);
  }
});

test('simultaneous manual and automatic POV turning share a 50°/s limit', () => {
  const { camera, controller, bot } = setup('steward');
  bot.group.rotation.y = radians(90);
  controller.drag(-Math.PI / 0.0024, 0);
  const start = viewingYaw(camera);
  controller.update('steward', bot, 1 / 30, false);
  close(angularDifference(viewingYaw(camera), start), radians(50) / 30);
});

test('reduced motion holds the current POV heading but permits manual turning', () => {
  const { camera, controller, bot } = setup('steward');
  bot.group.rotation.y = radians(90);
  controller.update('steward', bot, 1 / 30, false);
  const start = viewingYaw(camera);
  const position = camera.position.clone();
  for (let frame = 0; frame < 60; frame++) controller.update('steward', bot, 1 / 60, true);
  close(angularDifference(viewingYaw(camera), start), 0);
  close(camera.position.distanceTo(position), 0);
  controller.drag(150, 0);
  for (let frame = 0; frame < 120; frame++) controller.update('steward', bot, 1 / 60, true);
  close(angularDifference(viewingYaw(camera), start), -150 * 0.0024, 1e-6);
  close(camera.position.distanceTo(position), 0);
});

test('a fixed target turn and translation settle consistently at 30 and 60 FPS', () => {
  function simulate(fps) {
    const { camera, controller, bot } = setup('steward', radians(174));
    bot.group.rotation.y = radians(-172);
    bot.group.position.set(4, 2, -3);
    controller.drag(160, -35);
    for (let frame = 0; frame < fps * 3; frame++) controller.update('steward', bot, 1 / fps, false);
    return camera;
  }
  const slower = simulate(30);
  const faster = simulate(60);
  close(slower.position.distanceTo(faster.position), 0, 0.001);
  close(direction(slower).distanceTo(direction(faster)), 0, 0.001);
});
