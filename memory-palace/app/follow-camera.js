import { MathUtils, Vector3 } from 'three';

const { clamp, degToRad, euclideanModulo } = MathUtils;
const UP = new Vector3(0, 1, 0);
const THIRD_DISTANCE = Math.hypot(0.65, 5.2);
const BODY_RATE = degToRad(25);
const MANUAL_YAW_RATE = degToRad(45);
const COMBINED_YAW_RATE = degToRad(50);
const PITCH_RATE = degToRad(30);

function wrap(angle) {
  return euclideanModulo(angle + Math.PI, 2 * Math.PI) - Math.PI;
}

function easedStep(error, response, limit, delta) {
  return clamp(error * (1 - Math.exp(-response * delta)), -limit, limit);
}

export function createFollowCamera(camera, target) {
  const anchor = new Vector3();
  const offset = new Vector3();
  let mode, stewardId;
  let heading = 0;
  let yaw = 0, pitch = 0;
  let pendingYaw = 0, desiredPitch = 0;

  function update(nextMode, { id, group, eyeOffset, eyeHeight }, delta, reduced) {
    const pov = nextMode === 'steward';
    if (mode !== nextMode || stewardId !== id) {
      mode = nextMode;
      stewardId = id;
      heading = wrap(group.rotation.y);
      yaw = pitch = pendingYaw = desiredPitch = 0;
      anchor.copy(group.position);
    } else {
      anchor.lerp(group.position, 1 - Math.exp(-(pov ? 12 : 6) * delta));
      // Keep the third-person direction fixed as the steward takes a corner.
      // Reduced motion also holds the POV heading while still allowing the user to look around.
      const bodyStep = pov && !reduced
        ? easedStep(wrap(group.rotation.y - heading), 3, BODY_RATE * delta, delta)
        : 0;
      heading = wrap(heading + bodyStep);
      const manualLimit = Math.min(MANUAL_YAW_RATE * delta, COMBINED_YAW_RATE * delta - Math.abs(bodyStep));
      const manualStep = easedStep(pendingYaw, 8, manualLimit, delta);
      yaw = wrap(yaw + manualStep);
      pendingYaw -= manualStep;
      pitch += easedStep(desiredPitch - pitch, 8, PITCH_RATE * delta, delta);
    }

    if (pov) {
      camera.position.copy(eyeOffset).applyAxisAngle(UP, heading).add(anchor);
      camera.rotation.set(pitch, wrap(heading + Math.PI + yaw), 0, 'YXZ');
    } else {
      const targetHeight = eyeHeight * 0.65;
      const elevation = Math.atan2(2.2 - targetHeight, THIRD_DISTANCE) + pitch;
      offset.set(0.65, Math.tan(elevation) * THIRD_DISTANCE, -5.2).applyAxisAngle(UP, heading + yaw);
      target.copy(anchor);
      target.y += targetHeight;
      camera.position.copy(target).add(offset);
      camera.lookAt(target);
    }
  }

  return {
    update,
    reset() { mode = undefined; },
    drag(dx, dy) {
      const pov = mode === 'steward';
      const sensitivity = pov ? 0.0024 : 0.0022;
      const pitchLimit = pov ? 1.1 : 0.24;
      pendingYaw = clamp(pendingYaw - dx * sensitivity, -Math.PI, Math.PI);
      desiredPitch = clamp(desiredPitch - dy * sensitivity, -pitchLimit, pitchLimit);
    },
  };
}
