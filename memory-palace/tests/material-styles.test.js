import assert from 'node:assert/strict';
import { closeSync, openSync, readSync } from 'node:fs';
import test from 'node:test';
import {
  BoxGeometry, DirectionalLight, Group, HemisphereLight, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Scene, Texture,
} from 'three';
import { createMaterialStyles } from '../app/material-styles.js';
import { createRenderStyle } from '../app/render-style.js';

function readAssetMaterials() {
  const fd = openSync(new URL('../assets/memory-palace.glb', import.meta.url), 'r');
  try {
    const header = Buffer.alloc(20);
    readSync(fd, header);
    assert.equal(header.toString('ascii', 16, 20), 'JSON');
    const json = Buffer.alloc(header.readUInt32LE(12));
    readSync(fd, json);
    return JSON.parse(json).materials;
  } finally {
    closeSync(fd);
  }
}

function makeFixture() {
  const definitions = readAssetMaterials();
  const group = new Group();
  const geometry = new BoxGeometry();
  const byName = (name) => {
    const definition = definitions.find((material) => material.name.endsWith(name));
    assert.ok(definition, `${name} is present in the shipped estate`);
    const pbr = definition.pbrMetallicRoughness;
    const color = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const material = new MeshPhysicalMaterial({
      name: definition.name, opacity: color[3], transparent: definition.alphaMode === 'BLEND',
      depthWrite: definition.alphaMode !== 'BLEND',
      metalness: pbr.metallicFactor ?? 1, roughness: pbr.roughnessFactor ?? 1,
      emissiveIntensity: definition.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1,
    });
    material.color.fromArray(color);
    material.emissive.fromArray(definition.emissiveFactor ?? [0, 0, 0]);
    if (pbr.baseColorTexture) {
      material.map = new Texture();
      material.map.offset.set(.16, .17);
      material.map.channel = pbr.baseColorTexture.texCoord ?? 0;
    }
    if (pbr.metallicRoughnessTexture) {
      material.roughnessMap = new Texture();
      material.metalnessMap = material.roughnessMap;
    }
    if (definition.normalTexture) material.normalMap = new Texture();
    group.add(new Mesh(geometry, material));
    return material;
  };
  const wall = byName('Honed ivory limestone');
  const bronze = byName('Satin champagne bronze');
  const walnut = byName('Natural walnut');
  const glazing = byName('Solar control glazing');
  const strip = byName('Warm concealed light');
  const opal = byName('Warm opal glass and cast crystal');
  const decor = new MeshStandardMaterial({ name: 'Personal moss cushion', color: 0x449638 });
  group.add(new Mesh(geometry, [wall, bronze, new MeshBasicMaterial({ name: wall.name }), decor]));
  return { group, wall, bronze, walnut, glazing, strip, opal, decor };
}

function surface(material) {
  return {
    color: material.color.toArray(), roughness: material.roughness, metalness: material.metalness,
    emissive: material.emissive.toArray(), intensity: material.emissiveIntensity,
  };
}

const luma = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function effectiveColor(material, representativeTextureColor) {
  return representativeTextureColor.clone().multiply(material.color);
}

test('shipped architectural finishes and emissive fixtures change by surface and style', () => {
  const { group, wall, bronze, walnut, strip, opal, decor } = makeFixture();
  const styles = createMaterialStyles();
  const wallTexture = wall.color.clone().setHex(0xece3d1);
  const walnutTexture = walnut.color.clone().setHex(0xac8a6b);
  const original = surface(decor);

  // A saved preset can be applied before the GLB completes loading.
  assert.equal(styles.setStyle('scifi'), true);
  styles.registerModel(group);
  const pearl = effectiveColor(wall, wallTexture);
  const lightJoinery = effectiveColor(walnut, walnutTexture);
  assert.ok(luma(pearl) > .65);
  assert.ok(strip.emissive.b > 3 * strip.emissive.r);
  assert.ok(bronze.metalness > wall.metalness);

  styles.setStyle('cyberpunk');
  const navy = effectiveColor(wall, wallTexture);
  assert.ok(navy.b > navy.r && luma(navy) < luma(pearl) * .48);
  assert.ok(strip.emissive.r > strip.emissive.b && opal.emissive.g > opal.emissive.r);

  styles.setStyle('film');
  const darkWalnut = effectiveColor(walnut, walnutTexture);
  assert.ok(darkWalnut.r > darkWalnut.b * 2 && luma(darkWalnut) < luma(lightJoinery) * .4);
  styles.setStyle('cartoon');
  const blueJoinery = effectiveColor(walnut, walnutTexture);
  assert.ok(blueJoinery.b > blueJoinery.r * 3 && walnut.metalness < .1);
  assert.deepEqual(surface(decor), original);
});

test('repeated previews restore exact GLB factors and preserve maps and glazing', () => {
  const { group, ...materials } = makeFixture();
  const styles = createMaterialStyles();
  const all = Object.values(materials);
  const baseline = all.map(surface);
  const textures = all.map(({ map, normalMap, roughnessMap, metalnessMap }) => [map, normalMap, roughnessMap, metalnessMap]);
  const { opacity, transparent, depthWrite } = materials.glazing;
  const offsets = all.map(({ map }) => map?.offset.toArray());
  styles.registerModel(group);
  styles.setStyle('mono');
  const mono = all.map(surface);
  assert.notDeepEqual(mono, baseline);
  assert.equal(styles.setStyle('__proto__'), false);
  assert.deepEqual(all.map(surface), mono);

  // Re-registering meshes that share already styled materials must not replace
  // the baseline or scale the texture correction a second time.
  styles.registerModel(group);
  styles.setStyle('cyberpunk');
  styles.setStyle('mono');
  assert.deepEqual(all.map(surface), mono);
  styles.setStyle('original');
  assert.deepEqual(all.map(surface), baseline);
  styles.setStyle('film');
  styles.dispose();
  assert.deepEqual(all.map(surface), baseline);
  for (const [index, material] of all.entries()) {
    for (const [slot, key] of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'].entries()) {
      assert.equal(material[key], textures[index][slot]);
    }
    assert.deepEqual(material.map?.offset.toArray(), offsets[index]);
  }
  assert.deepEqual({ opacity: materials.glazing.opacity, transparent: materials.glazing.transparent, depthWrite: materials.glazing.depthWrite }, { opacity, transparent, depthWrite });
});

test('daylight, sci-fi, and cyberpunk render directly with weaker global light indoors', () => {
  const scene = new Scene();
  const camera = {};
  const viewport = { dataset: {}, style: {} };
  const key = new DirectionalLight();
  const rim = new DirectionalLight();
  const hemisphere = new HemisphereLight();
  const calls = [];
  const renderer = {
    getSize: (size) => size.set(800, 600),
    render: (...args) => calls.push(args),
  };
  const styles = createRenderStyle({ renderer, scene, camera, viewport, key, rim, hemisphere });
  for (const id of ['original', 'scifi', 'cyberpunk']) {
    assert.equal(styles.setStyle(id), true);
    styles.setInterior(0);
    const outdoors = [key.intensity, hemisphere.intensity, scene.environmentIntensity];
    styles.setInterior(1);
    assert.ok([key.intensity, hemisphere.intensity, scene.environmentIntensity].every((value, index) => value < outdoors[index]));
    styles.render(0.016);
    assert.equal(viewport.dataset.renderStyle, id);
  }
  assert.deepEqual(calls, [[scene, camera], [scene, camera], [scene, camera]]);
});
