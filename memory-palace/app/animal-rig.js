import { MathUtils, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStewardContactShadow, styleStewardModel } from './steward-appearance.js';

const profiles = {
  dog: { stride: 1.45, swing: 0.48, bend: 0.60, lift: 0.023, phases: [0, Math.PI, Math.PI, 0] },
  cat: { stride: 1.28, swing: 0.42, bend: 0.49, lift: 0.022, phases: [0, Math.PI, -Math.PI / 2, Math.PI / 2] },
  owl: { stride: 1.56, swing: 0.32, bend: 0, lift: 0.018, phases: [0, Math.PI] },
};

const loader = new GLTFLoader();
const prototypes = new Map();
const variants = { noa: '/assets/quality/robot-noa.glb' };

function loadPrototype(species, variant) {
  const variantURL = species === 'dog' && Object.hasOwn(variants, variant) ? variants[variant] : null;
  const url = variantURL ?? `/assets/stewards/robot-${species}.glb`;
  if (!prototypes.has(url)) {
    const request = loader.loadAsync(url)
      .then(({ scene }) => {
        if (!scene.getObjectByName('EyeCamera')) throw new Error('Missing EyeCamera.');
        return scene;
      })
      .catch((error) => {
        prototypes.delete(url);
        if (variantURL) return loadPrototype(species);
        throw new Error(`Could not load the ${species} steward model.`, { cause: error });
      });
    prototypes.set(url, request);
  }
  return prototypes.get(url);
}

export async function attachAnimalRig(group, { species, color, variant }, index) {
  const prototype = await loadPrototype(species, variant);
  const model = prototype.clone(true);
  styleStewardModel(model, color);
  const profile = profiles[species];
  const find = (name) => model.getObjectByName(name);
  const joint = (name) => {
    const node = find(name);
    return node && { node, rotation: node.rotation.clone() };
  };
  const head = joint('Head');
  const body = joint('Body');
  const bodyY = body?.node.position.y ?? 0;
  const tail = joint('Tail');
  const ears = ['L', 'R'].map((side) => joint(`Ear_${side}`));
  const wings = ['L', 'R'].map((side) => joint(`Wing_${side}`));
  const eyes = ['Eye_L', 'Eye_R'].map(find).filter(Boolean)
    .map((node) => ({ node, height: node.scale.y }));
  const legs = (species === 'owl' ? ['L', 'R'] : ['FL', 'FR', 'BL', 'BR']).map((name, leg) => ({
    hip: joint(`Leg_${name}`), knee: joint(`Shin_${name}`), offset: profile.phases[leg],
  }));
  const eye = find('EyeCamera');
  // Measure the resting eye position before attachment so head motion does not shake the camera.
  const eyeOffset = eye.getWorldPosition(new Vector3());
  const shadow = createStewardContactShadow(species);
  group.add(model, shadow);

  let previousY = group.position.y;
  let gait = 0, phase = 0, focusYaw = 0, focusPitch = 0;
  const rotate = (pivot, axis, angle) => {
    if (pivot) pivot.node.rotation[axis] = pivot.rotation[axis] + angle;
  };

  return {
    eyeOffset,
    update(delta, clock, step, target, reduced) {
      // The route interpolates through steps, where a flat shadow can float above the treads.
      shadow.visible = Math.abs(group.position.y - previousY) <= step * 0.05;
      previousY = group.position.y;
      gait = reduced ? 0 : MathUtils.damp(gait, step > 0.001 ? 1 : 0, 14, delta);
      phase = (phase + step / profile.stride * 2 * Math.PI) % (2 * Math.PI);
      const idle = reduced ? 0 : 1 - gait;
      const time = clock + index * 1.37;
      const sway = Math.sin(phase) * gait;

      if (body) body.node.position.y = bodyY + profile.lift * Math.sin(phase) ** 2 * gait;
      rotate(body, 'z', sway * (species === 'owl' ? 0.075 : 0.025));
      for (const { hip, knee, offset } of legs) {
        const cycle = phase + offset;
        rotate(hip, 'x', Math.cos(cycle) * gait * profile.swing);
        rotate(knee, 'x', Math.max(0, Math.sin(cycle)) * gait * profile.bend);
      }

      let yaw = idle * Math.sin(time * 0.72) * (species === 'owl' ? 0.20 : 0.12);
      let pitch = idle * Math.sin(time * 0.94) * 0.035 + sway * 0.02;
      if (!reduced && target) {
        const dx = target[0] - group.position.x;
        const dz = target[2] - group.position.z;
        const angle = Math.atan2(dx, dz) - group.rotation.y;
        yaw = MathUtils.clamp(Math.atan2(Math.sin(angle), Math.cos(angle)), -0.40, 0.40);
        pitch = MathUtils.clamp(Math.atan2(group.position.y + eyeOffset.y - target[1], Math.hypot(dx, dz)), -0.20, 0.15);
      }
      focusYaw = reduced ? 0 : MathUtils.damp(focusYaw, yaw, 6, delta);
      focusPitch = reduced ? 0 : MathUtils.damp(focusPitch, pitch, 6, delta);
      rotate(head, 'y', focusYaw);
      rotate(head, 'x', focusPitch);
      rotate(tail, species === 'cat' ? 'z' : 'y', sway * 0.15 + idle * Math.sin(time * 2.6) * 0.13);

      for (const [side, ear] of ears.entries()) {
        rotate(ear, 'x', idle * Math.sin(time * 1.6 + side) * 0.05);
      }
      for (const [side, wing] of wings.entries()) {
        rotate(wing, 'z', sway * (side === 0 ? 0.07 : -0.07));
      }
      const blink = reduced ? 1 : 1 - 0.90 * Math.max(0, 1 - Math.abs(time % 5.1 - 0.09) / 0.09);
      for (const { node, height } of eyes) node.scale.y = height * blink;
    },
  };
}
