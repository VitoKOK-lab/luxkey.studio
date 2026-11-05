import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Texture } from 'three';
import { createMaterialStyles } from '../app/material-styles.js';
import { createHumanNavigation } from '../app/navigation.js';
import { loadHallQuality, prepareEstateModels, sliceEstateParts } from '../app/quality-model.js';

function mesh(tags, material = new MeshStandardMaterial()) {
  const object = new Mesh(new BoxGeometry(12, 0.4, 12), material);
  object.userData = tags;
  return object;
}

function baseEstate() {
  const model = new Group();
  const baseHall = mesh({ floor: 0, room_id: 'hall', part: 'architecture' });
  const locus = new Group();
  locus.userData = { floor: 0, room_id: 'hall', part: 'locus' };
  const upper = mesh({ floor: 1, room_id: 'library', part: 'furniture' });
  upper.position.y = 4;
  model.add(baseHall, locus, upper);
  return { model, baseHall, locus, upper };
}

test('quality hall retains its textures and style changes while the base hall stays out of floor views', async () => {
  const { model, baseHall, locus, upper } = baseEstate();
  const candidate = new Group();
  const parent = new Group();
  parent.userData = { floor: 0, room_id: 'hall', part: 'architecture' };
  const map = new Texture();
  const aoMap = new Texture();
  const material = new MeshStandardMaterial({ name: '01 · Vein-cut ivory travertine · Hall quality', map, aoMap });
  const originalColor = material.color.clone();
  const overlay = mesh({}, material);
  parent.add(overlay);
  candidate.add(parent);
  const hall = await loadHallQuality({
    loadAsync(url) {
      assert.equal(url, '/assets/quality/hall-quality.glb');
      return Promise.resolve({ scene: candidate });
    },
  });
  const { renderModels, slices, occluders, hallInstalled } = prepareEstateModels(model, hall, 8);
  assert.equal(hallInstalled, true);
  assert.deepEqual(renderModels, [model, candidate]);
  assert.deepEqual(occluders, [upper, overlay]);
  assert.equal(overlay.userData.part, 'architecture');
  assert.equal(overlay.receiveShadow, true);
  assert.equal(overlay.castShadow, true);
  for (const texture of [map, aoMap]) assert.equal(texture.anisotropy, 8);

  const styles = createMaterialStyles();
  for (const renderModel of renderModels) styles.registerModel(renderModel);
  styles.setStyle('cyberpunk');
  const effectiveColor = material.color.clone().multiply(new Color(0xcfc4b0));
  const cyberpunkStone = new Color(0x405269);
  assert.ok(effectiveColor.toArray().every((channel, index) => Math.abs(channel - cyberpunkStone.toArray()[index]) < 1e-6));
  styles.setStyle('original');
  assert.ok(material.color.equals(originalColor));
  assert.equal(material.map, map);
  assert.equal(material.aoMap, aoMap);

  for (const [ceiling, cutaway, walking, upperVisible] of [[0, true, true, false], [1, true, false, true], [null, false, false, true]]) {
    sliceEstateParts(slices, ceiling, cutaway, walking);
    assert.equal(baseHall.visible, false);
    assert.equal(overlay.visible, true);
    assert.equal(locus.visible, true);
    assert.equal(upper.visible, upperVisible);
  }
  assert.equal(baseHall.parent, model);
  assert.equal(locus.parent, model);
});

test('missing or invalid hall quality assets keep the base hall visible and sliceable', async () => {
  const failed = await loadHallQuality({ loadAsync: () => Promise.reject(new Error('not found')) });
  const invalid = new Group();
  invalid.add(mesh({ floor: 0, room_id: 'library', part: 'furniture' }));
  for (const candidate of [failed, new Group(), invalid]) {
    const { model, baseHall } = baseEstate();
    const { renderModels, slices, hallInstalled } = prepareEstateModels(model, candidate, 2);
    assert.equal(hallInstalled, false);
    assert.deepEqual(renderModels, [model]);
    assert.ok(slices.includes(baseHall));
    sliceEstateParts(slices, 1, true, false);
    assert.equal(baseHall.visible, true);
  }
});

test('human navigation walks on the hidden original hall collision surface', (t) => {
  const { model, baseHall } = baseEstate();
  const candidate = new Group();
  const qualityFloor = mesh({ floor: 0, room_id: 'hall', part: 'architecture' });
  qualityFloor.position.y = 0.1;
  candidate.add(qualityFloor);
  const { hallInstalled } = prepareEstateModels(model, candidate, 2);
  assert.equal(hallInstalled, true);
  assert.equal(baseHall.visible, false);

  const window = new EventTarget();
  const document = new EventTarget();
  const canvas = new EventTarget();
  document.querySelector = () => null;
  document.createElement = () => Object.assign(new EventTarget(), {
    classList: { add() {}, remove() {} }, dataset: {}, children: [], setAttribute() {},
    append(child) { this.children.push(child); },
  });
  document.body = document.createElement();
  globalThis.window = window;
  globalThis.document = document;
  t.after(() => { delete globalThis.window; delete globalThis.document; });

  const hall = { id: 'hall', floor: 0, walk_height: 0.2, position: [0, 0.2, -4], entry_path: [[0, 0.2, 0]], loci: [] };
  const navigation = createHumanNavigation({ camera: new PerspectiveCamera(), canvas, manifest: { rooms: [hall] }, model });
  assert.equal(navigation.enter(), true);
  const walk = Object.assign(new Event('keydown'), { code: 'KeyW' });
  window.dispatchEvent(walk);
  navigation.update(0.07);
  const { y, z } = navigation.getPosition();
  assert.ok(z < -0.1);
  assert.ok(Math.abs(y - 0.2) < 1e-6);
});
