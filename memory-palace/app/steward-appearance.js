import { DataTexture, LinearFilter, MathUtils, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';

// Calibrate the Blender finishes for the shared scene lights. Values scale linear RGB.
const finishes = {
  'Oyster porcelain': { albedo: 0.73, roughness: 0.50, clearcoat: 0.09 },
  'Satin alabaster': { albedo: 0.80, roughness: 0.53, clearcoat: 0.06 },
  'Sage graphite polymer': { albedo: 0.70, roughness: 0.57 },
  'Quiet moss elastomer': { albedo: 0.66, roughness: 0.69 },
  'Brushed champagne': { albedo: 0.73, roughness: 0.49, metalness: 0.57 },
  'Soft champagne bevel': { albedo: 0.78, roughness: 0.45, metalness: 0.49 },
  'Steward accent · eucalyptus ceramic': { district: true, albedo: 0.44, roughness: 0.49, clearcoat: 0.08, emission: 0 },
  'Deep jade optical glass': { albedo: 0.76, roughness: 0.31, clearcoat: 0.19 },
  'Eucalyptus optical ring': { district: true, albedo: 0.40, roughness: 0.38, clearcoat: 0.14, emission: 0.12 },
  'Steward Glow · mint optical core': { district: true, albedo: 0.54, roughness: 0.34, clearcoat: 0.12, emission: 0.36 },
  'Ivory optical reflection': { albedo: 0.76, roughness: 0.33, emission: 0.68 },
};

export function styleStewardModel(model, color) {
  const materials = new Map();
  function variantFor(material) {
    const finish = finishes[material.name];
    if (!finish) return material;
    if (materials.has(material)) return materials.get(material);

    const variant = material.clone();
    if (finish.district) variant.color.setHex(color);
    variant.color.multiplyScalar(finish.albedo);
    variant.roughness = finish.roughness;
    if (finish.metalness !== undefined) variant.metalness = finish.metalness;
    if (finish.clearcoat !== undefined) {
      variant.clearcoat = finish.clearcoat;
      variant.clearcoatRoughness = 0.32;
    }
    if (finish.emission !== undefined) {
      if (finish.district) variant.emissive.setHex(color);
      variant.emissive.multiplyScalar(finish.emission);
    }
    materials.set(material, variant);
    return variant;
  }

  model.traverse((node) => {
    if (!node.isMesh) return;
    node.material = Array.isArray(node.material) ? node.material.map(variantFor) : variantFor(node.material);
  });
}

const contactSize = {
  dog: [0.86, 1.26, 0.04],
  cat: [0.74, 1.13, 0.04],
  owl: [0.78, 0.78, 0.07],
};
const contactPlane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
let contactMaterial;

function makeContactMaterial() {
  const size = 32;
  const pixels = new Uint8Array(size * size * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot((x + 0.5) * 2 / size - 1, (y + 0.5) * 2 / size - 1);
      pixels[(y * size + x) * 4 + 3] = Math.round(255 * (1 - MathUtils.smoothstep(radius, 0.16, 0.96)));
    }
  }
  const map = new DataTexture(pixels, size, size);
  map.minFilter = map.magFilter = LinearFilter;
  map.needsUpdate = true;
  return new MeshBasicMaterial({
    color: 0x262724, map, transparent: true, opacity: 0.31, depthWrite: false, toneMapped: false,
  });
}

export function createStewardContactShadow(species) {
  contactMaterial ??= makeContactMaterial();
  const shadow = new Mesh(contactPlane, contactMaterial);
  const [width, length, center] = contactSize[species];
  shadow.name = 'Steward contact shadow';
  shadow.scale.set(width, 1, length);
  // The route's y coordinate follows the walking surface. Lift the plane slightly to avoid z-fighting.
  shadow.position.set(0, 0.012, center);
  shadow.raycast = () => {};
  return shadow;
}
