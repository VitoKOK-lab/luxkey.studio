const hallParts = new Set(['architecture', 'finish', 'furniture']);
const isOpaque = (material) => material && !material.transparent && !material.transmission;

export async function loadHallQuality(loader) {
  try {
    return (await loader.loadAsync('/assets/quality/hall-quality.glb')).scene;
  } catch {
    return null;
  }
}

function hallTags(mesh) {
  // GLTFLoader can put a multi-material node's extras on a parent group.
  for (let node = mesh; node; node = node.parent) {
    if (node.userData.room_id !== undefined) return node.userData;
  }
}

function installHallQuality(model, candidate, anisotropy) {
  if (!candidate) return null;
  const meshes = new Map();
  candidate.traverse((object) => {
    if (object.isMesh) meshes.set(object, hallTags(object));
  });
  if (!meshes.size || [...meshes.values()].some((tags) =>
    tags?.room_id !== 'hall' || tags.floor !== 0 || !hallParts.has(tags.part))) return null;

  const replaced = new Set();
  model.traverse((object) => {
    if (object.isMesh && object.userData.room_id === 'hall') replaced.add(object);
  });
  if (!replaced.size) return null;

  const textures = new Set();
  for (const [mesh, { room_id, floor, part }] of meshes) {
    Object.assign(mesh.userData, { room_id, floor, part });
    for (const material of [mesh.material].flat()) {
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  }
  for (const texture of textures) {
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
  }
  // Leave the original meshes attached to the base model for human navigation.
  for (const mesh of replaced) mesh.visible = false;
  return { model: candidate, replaced };
}

export function prepareEstateModels(model, hallCandidate, anisotropy) {
  const hall = installHallQuality(model, hallCandidate, anisotropy);
  const renderModels = hall ? [model, hall.model] : [model];
  const embeddedLights = [];
  const slices = [];
  const occluders = [];
  for (const renderModel of renderModels) {
    renderModel.traverse((object) => {
      if (hall?.replaced.has(object)) return;
      if (object.isLight || object.userData.part === 'butler') embeddedLights.push(object);
      if (typeof object.userData.floor === 'number' || object.userData.part === 'roof') slices.push(object);
      if (object.isMesh) {
        const materials = [object.material].flat();
        const opaque = materials.every(isOpaque);
        object.receiveShadow = opaque;
        object.castShadow = opaque && ['architecture', 'circulation', 'furniture', 'landscape', 'roof'].includes(object.userData.part);
        if (!['butler', 'locus'].includes(object.userData.part) && materials.some(isOpaque)) occluders.push(object);
      }
    });
  }
  for (const light of embeddedLights) light.removeFromParent();
  return { renderModels, slices, occluders, hallInstalled: Boolean(hall) };
}

export function sliceEstateParts(parts, ceiling, cutaway, walking) {
  for (const part of parts) {
    const hiddenAbove = ceiling !== null && ceiling >= 0 && part.userData.floor > ceiling &&
      !(walking && ['circulation', 'lighting-guide'].includes(part.userData.part));
    const hiddenRoof = part.userData.part === 'roof' && (cutaway || ceiling !== null && ceiling >= 0);
    part.visible = !(hiddenAbove || hiddenRoof);
  }
}
