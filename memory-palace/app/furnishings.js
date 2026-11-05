import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Cosmetic sockets are separate from permanent mnemonic loci and walking paths.
const centralSockets = {
  hall: [[-2.65, 0.748, 1.3], [2.65, 0.748, 1.3]],
  library: [[-8.2, 0.748, 1.7], [-3.45, 0.748, 1.7]],
  gallery: [[-7.5, 4.738, 1.8], [-3.5, 4.738, 1.8]],
  'quiet-room': [[3.4, 4.738, 1.8], [7.5, 4.738, 1.8]],
  observatory: [[-3.2, 8.728, 0.4], [3.2, 8.728, 0.4]],
  garden: [[-6, 0.213, 17.4], [6, 0.213, 17.4]],
  skybridge: [[-3.5, 8.728, 3.45], [3.5, 8.728, 3.45]],
};

export function decorationPosition(room, slot) {
  const index = slot === 'right' ? 1 : 0;
  if (centralSockets[room.id]) return new THREE.Vector3(...centralSockets[room.id][index]);
  const [x, , z] = room.position;
  const height = room.walk_height;
  if (room.floor === -1) return new THREE.Vector3(x + (index ? 3.1 : -3.1), height, 22.8);
  return new THREE.Vector3(Math.sign(x) * 18.55, height, z + (index ? 1.4 : -1.4));
}

function ornament(item, color) {
  const group = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf4e9d7, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x25353c, roughness: 0.4 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xb8a27c, metalness: 0.65, roughness: 0.35 });
  function mesh(geometry, material, position, scale) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    if (scale) object.scale.set(...scale);
    group.add(object);
    return object;
  }
  function ball(radius, material, position, scale) {
    return mesh(new THREE.SphereGeometry(radius, 14, 10), material, position, scale);
  }
  mesh(new THREE.CylinderGeometry(0.39, 0.42, 0.12, 24), gold, [0, 0.06, 0]);
  if (item === 'plush-bear') {
    ball(0.31, accent, [0, 0.48, 0], [0.95, 1.2, 0.8]);
    ball(0.27, accent, [0, 0.96, 0]);
    for (const side of [-1, 1]) {
      ball(0.105, accent, [side * 0.21, 1.15, 0]);
      ball(0.12, accent, [side * 0.3, 0.56, 0], [0.72, 1.5, 0.8]);
      ball(0.13, accent, [side * 0.17, 0.23, 0.11], [1, 0.8, 1.3]);
      ball(0.025, dark, [side * 0.09, 1.02, 0.245]);
    }
    ball(0.12, cream, [0, 0.89, 0.225], [1, 0.7, 0.5]);
    ball(0.035, dark, [0, 0.93, 0.29]);
  } else if (item === 'moon-lamp') {
    mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.58, 10), gold, [0, 0.42, 0]);
    const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.65, roughness: 0.4 });
    ball(0.3, glow, [0, 0.98, 0]);
    const orbit = mesh(new THREE.TorusGeometry(0.4, 0.018, 6, 36), gold, [0, 0.98, 0]);
    orbit.rotation.set(0.3, 0.4, 0.3);
  } else if (item === 'plant') {
    mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.4, 16), accent, [0, 0.32, 0]);
    mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.65, 8), gold, [0, 0.78, 0]);
    const leaf = new THREE.MeshStandardMaterial({ color: 0x668e70, roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4;
      const frond = ball(0.2, leaf, [Math.cos(angle) * 0.19, 0.68 + i * 0.1, Math.sin(angle) * 0.19], [1.4, 0.42, 0.7]);
      frond.rotation.set(0, -angle, 0.4);
    }
  } else if (item === 'crystal') {
    const crystal = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.25, emissive: color, emissiveIntensity: 0.13 });
    for (const [x, h, tilt] of [[0, 0.9, 0], [-0.2, 0.55, 0.2], [0.2, 0.65, -0.22]]) {
      const prism = mesh(new THREE.CylinderGeometry(0.08, 0.14, h, 5), crystal, [x, 0.12 + h / 2, 0]);
      prism.rotation.z = tilt;
      mesh(new THREE.ConeGeometry(0.085, 0.2, 5), crystal, [x - Math.sin(tilt) * h / 2, 0.22 + h, 0]);
    }
  }
  // Dispose unused palette entries together with geometry when changing decor.
  group.userData.palette = [accent, cream, dark, gold];
  return group;
}

export function createFurnishings(scene, manifest) {
  const root = new THREE.Group();
  root.name = 'Personal furnishings · separate from memory anchors';
  scene.add(root);
  let ceiling = null;
  let lastDesign = null;
  const models = new Map();
  const loader = new GLTFLoader();
  const ready = Promise.all(['plush-bear', 'moon-lamp', 'plant', 'crystal'].map(async (id) => {
    try {
      const { scene: model } = await loader.loadAsync(`/assets/accessories/${id}.glb`);
      models.set(id, model);
    } catch (error) {
      console.warn(`Accessory ${id} unavailable; using the lightweight preview.`, error);
    }
  })).then(() => { if (lastDesign) apply(lastDesign); });

  function detailedOrnament(item, color) {
    if (!models.has(item)) return ornament(item, color);
    const object = models.get(item).clone(true);
    const materials = new Map();
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.userData.sharedGeometry = true;
      const cloneMaterial = (source) => {
        if (!materials.has(source)) {
          const copy = source.clone();
          if (copy.name.startsWith('Custom accent')) {
            copy.color.set(color);
            if (copy.emissiveIntensity > 0.05) copy.emissive.set(color);
          }
          materials.set(source, copy);
        }
        return materials.get(source);
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
    });
    return object;
  }
  function visibleFloor(level) {
    ceiling = level;
    for (const object of root.children) object.visible = level === null || level < 0 || object.userData.floor <= level;
  }
  function clear() {
    const geometries = new Set();
    const materials = new Set();
    root.traverse((object) => {
      if (object.geometry && !object.userData.sharedGeometry) geometries.add(object.geometry);
      if (object.material) [object.material].flat().forEach((material) => materials.add(material));
      for (const material of object.userData.palette || []) materials.add(material);
    });
    root.clear();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }
  function apply(design) {
    lastDesign = design;
    clear();
    for (const decoration of design.decorations || []) {
      const room = manifest.rooms.find(({ id }) => id === decoration.room_id);
      if (!room || !['plush-bear', 'moon-lamp', 'plant', 'crystal'].includes(decoration.item)) continue;
      const object = detailedOrnament(decoration.item, decoration.color);
      object.position.copy(decorationPosition(room, decoration.slot));
      object.userData.floor = room.floor;
      object.name = `Decoration · ${room.id} · ${decoration.slot}`;
      root.add(object);
    }
    visibleFloor(ceiling);
  }
  return { apply, visibleFloor, ready };
}
