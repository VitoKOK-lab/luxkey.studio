import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createStewards } from './stewards.js';
import { createFurnishings, decorationPosition } from './furnishings.js';
import { createHumanNavigation } from './navigation.js';
import { createRenderStyle } from './render-style.js';
import { createFollowCamera } from './follow-camera.js';
import { createRoomLighting } from './room-lighting.js';
import { loadHallQuality, prepareEstateModels, sliceEstateParts } from './quality-model.js';
import { createNightWindows } from './night-windows.js';

export async function createEstate({ viewport, tooltip, manifest, describe, activate, onSteward, onViewMode, onTalk, isObscured = () => false }) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  const mobileQuality = window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileQuality ? 1.25 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.12, 320);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.13;
  controls.minDistance = 3;
  controls.maxDistance = 220;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.enablePan = false;

  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environment, 0.04).texture;
  scene.environmentIntensity = 0.65;
  environment.dispose();
  pmrem.dispose();
  const hemisphere = new THREE.HemisphereLight(0xfff8ec, 0xb3bfa3, 1.4);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xfff3df, 1.7);
  key.position.set(-15, 23, 18);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe4edf0, 0.85);
  rim.position.set(14, 17, -18);
  scene.add(rim);
  const renderStyle = createRenderStyle({ renderer, scene, camera, viewport, key, rim, hemisphere });

  let model;
  let lightingManifest;
  let hallCandidate;
  try {
    const loader = new GLTFLoader();
    const [gltf, lighting, hall] = await Promise.all([
      loader.loadAsync(manifest.model),
      fetch('/assets/lighting-manifest.json').then((response) => {
        if (!response.ok) throw new Error('無法載入莊園燈光配置');
        return response.json();
      }),
      loadHallQuality(loader),
    ]);
    model = gltf.scene;
    lightingManifest = lighting;
    hallCandidate = hall;
  } catch (error) {
    scene.environment.dispose();
    renderer.dispose();
    throw error;
  }
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy() || 1, mobileQuality ? 2 : 8);
  const { renderModels, slices, occluders, hallInstalled } = prepareEstateModels(model, hallCandidate, anisotropy);
  viewport.dataset.hallQuality = hallInstalled ? 'detail' : 'standard';
  for (const renderModel of renderModels) renderStyle.registerModel(renderModel);
  const nightWindows = createNightWindows(renderModels);
  scene.add(...renderModels);
  const roomLighting = createRoomLighting({ scene, manifest: lightingManifest, shadows: true });
  const furnishings = createFurnishings(scene, manifest);

  const ring = new THREE.RingGeometry(0.15, 0.18, 28);
  const sphere = new THREE.SphereGeometry(0.065, 12, 8);
  const hitArea = new THREE.SphereGeometry(0.36, 10, 8);
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const markers = manifest.rooms.flatMap((room) => room.loci.map((locus) => {
    const group = new THREE.Group();
    group.position.fromArray(locus.position);
    const point = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: 0xa17e43 }));
    const halo = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({
      color: 0xb08c50, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide,
    }));
    const hit = new THREE.Mesh(hitArea, hitMaterial);
    hit.userData = { room, locus };
    group.add(point, halo, hit);
    scene.add(group);
    return { group, halo, point, hit, room };
  }));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let viewMode = 'overview';
  let humanRoom = null;
  let selectedSteward = 'hall';
  let lookDrag = null;
  let walkStatus = null;
  const stewards = createStewards(scene, manifest, (status) => {
    walkStatus = status;
    onSteward?.(status);
  }, reduced);
  await stewards.ready;
  const followCamera = createFollowCamera(camera, controls.target);
  const floorHeights = [0, 1, 2].map((level) => Math.min(...manifest.rooms.filter((room) => room.floor === level).map((room) => room.walk_height ?? room.position?.[1] ?? level * 4)));
  let followedFloor = null;
  const initialView = { view: manifest.overview, room: null, floor: null, cutaway: false };
  let options = initialView;
  let motion = null;
  let hover = null;
  let pointerStart = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const navigation = createHumanNavigation({ camera, canvas: renderer.domElement, manifest, model,
    onChange(state) {
      if (state.active) humanRoom = state.room;
    },
  });

  function clearHover() {
    hover = null;
    tooltip.hidden = true;
    renderer.domElement.style.cursor = '';
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = viewport;
    if (!width || !height) return;
    camera.aspect = width / height;
    if (viewMode === 'human' || viewMode === 'steward') {
      camera.fov = 70;
      camera.clearViewOffset();
    } else {
      camera.fov = viewMode === 'third' ? 58 : width <= 900 ? 48 : 42;
      const offsetX = width > 900 ? Math.min(96, width * 0.062) : 0;
      const offsetY = width > 900 ? height * 0.027 : height * 0.18;
      camera.setViewOffset(width, height, offsetX, offsetY, width, height);
    }
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderStyle.resize(width, height);
  }

  function sliceEstate(ceiling, cutaway, walking = false) {
    furnishings.visibleFloor(ceiling);
    sliceEstateParts(slices, ceiling, cutaway, walking);
    roomLighting.invalidateShadows();
  }

  function restoreViewVisibility() {
    document.body.classList.remove('walking-follow');
    followedFloor = null;
    const { room, floor, cutaway } = options;
    sliceEstate(room ? room.floor : floor, cutaway);
    for (const marker of markers) {
      marker.group.visible = room ? marker.room.id === room.id : floor === null || marker.room.floor === floor;
    }
  }

  function frameView(viewOptions, immediate = false) {
    const leavingFollow = viewMode === 'third' || viewMode === 'steward';
    followCamera.reset();
    pointerStart = null;
    lookDrag = null;
    navigation.exit();
    viewMode = 'overview';
    document.body.dataset.viewMode = viewMode;
    controls.enabled = true;
    stewards.setPOV(false);
    resize();
    onViewMode?.(viewMode);
    options = viewOptions;
    stewards.follow(false);
    restoreViewVisibility();
    clearHover();
    const { view, room, floor, cutaway } = options;
    sliceEstate(room ? room.floor : floor, cutaway);
    for (const marker of markers) {
      marker.group.visible = room ? marker.room.id === room.id : floor === null || marker.room.floor === floor;
    }

    const target = new THREE.Vector3().fromArray(view.target);
    const position = new THREE.Vector3().fromArray(view.position);
    if (camera.aspect < 1 && !room) {
      position.sub(target).multiplyScalar(Math.min(3.1, 1.35 / camera.aspect)).add(target);
    } else if (!room && floor === null) {
      position.sub(target).multiplyScalar(manifest.rooms.length > 6 ? 1.58 : 1.12).add(target);
    }
    if (immediate || leavingFollow || reduced.matches) {
      motion = null;
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
    } else {
      motion = {
        start: performance.now(),
        position, target,
        fromPosition: camera.position.clone(),
        fromTarget: controls.target.clone(),
      };
    }
  }

  function setViewMode(mode, settings = {}) {
    if (mode === 'overview') { frameView(options); return true; }
    if (!['human', 'third', 'steward'].includes(mode)) return false;
    motion = null;
    clearHover();
    navigation.exit();
    stewards.setPOV(false);
    viewMode = mode;
    document.body.dataset.viewMode = mode;
    controls.enabled = false;
    followedFloor = null;
    pointerStart = null;
    lookDrag = null;
    resize();
    if (mode === 'human') {
      followCamera.reset();
      stewards.follow(false);
      document.body.classList.remove('walking-follow');
      sliceEstate(null, false);
      navigation.enter(settings.roomId || options.room?.id || 'hall', settings.locusId);
    } else {
      selectedSteward = settings.stewardId || walkStatus?.id || selectedSteward;
      stewards.follow(true, selectedSteward);
      stewards.setPOV(mode === 'steward');
      if (mode === 'steward') sliceEstate(null, false);
      followCamera.update(mode, stewards.followedInfo(), 0, reduced.matches);
    }
    onViewMode?.(mode, selectedSteward);
    return true;
  }

  function findMarker(event) {
    if (motion || event.buttons) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      2 * (event.clientX - rect.left) / rect.width - 1,
      1 - 2 * (event.clientY - rect.top) / rect.height,
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(markers.filter(({ group }) => group.visible).map(({ hit }) => hit), false);
    const first = hits[0];
    if (!first) return null;
    // Hidden storeys and transparent window panels should not block the marker.
    const [surface] = raycaster.intersectObjects(occluders.filter((mesh) => mesh.visible), false);
    if (surface && surface.distance + 0.44 < first.distance) return null;
    return first.object.userData;
  }

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (viewMode === 'third' || viewMode === 'steward') {
      lookDrag = { ...pointerStart, moved: false };
      canvas.setPointerCapture(event.pointerId);
    }
    clearHover();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (lookDrag?.id === event.pointerId && event.buttons) {
      const dx = event.clientX - lookDrag.x;
      const dy = event.clientY - lookDrag.y;
      if (lookDrag.moved || Math.hypot(dx, dy) > 6) {
        followCamera.drag(dx, dy);
        lookDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: true };
      }
    }
    hover = findMarker(event);
    if (!hover) return clearHover();
    tooltip.textContent = describe(hover.room, hover.locus);
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(event.clientX + 12, innerWidth - tooltip.offsetWidth - 10)}px`;
    tooltip.style.top = `${Math.max(8, event.clientY - 42)}px`;
    canvas.style.cursor = 'pointer';
  });
  canvas.addEventListener('pointerup', (event) => {
    if (pointerStart?.id !== event.pointerId) return;
    const origin = pointerStart;
    const dragged = lookDrag?.moved;
    lookDrag = null;
    pointerStart = null;
    if (dragged || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 6) return;
    const hit = findMarker(event);
    if (hit) activate(hit.room, hit.locus);
    else {
      const id = stewards.pick(raycaster);
      if (id) onTalk?.(id);
    }
  });
  canvas.addEventListener('pointerleave', clearHover);
  function cancelPointer(event) {
    if (pointerStart?.id !== event.pointerId) return;
    pointerStart = null;
    lookDrag = null;
    clearHover();
  }
  canvas.addEventListener('pointercancel', cancelPointer);
  canvas.addEventListener('lostpointercapture', cancelPointer);
  controls.addEventListener('start', () => {
    motion = null;
    clearHover();
    if (followedFloor !== null) {
      stewards.follow(false);
      restoreViewVisibility();
      onSteward?.({ phase: 'unfollowed' });
    }
  });
  viewport.append(canvas);
  resize();
  frameView(initialView, true);
  window.addEventListener('resize', resize);
  let previous = 0;
  const lightingFocus = new THREE.Vector3();
  renderer.setAnimationLoop((time) => {
    const delta = previous ? Math.min((time - previous) / 1000, 0.07) : 0;
    previous = time;
    const bot = stewards.update(delta, time / 1000);
    if (navigation.isActive()) {
      navigation.update(delta);
      const feet = navigation.getPosition();
      for (const marker of markers) {
        marker.group.visible = marker.room.id === humanRoom?.id && marker.group.position.distanceTo(feet) < 10;
      }
    } else if (bot && (viewMode === 'third' || viewMode === 'steward')) {
      document.body.classList.add('walking-follow');
      motion = null;
      const level = bot.position.y >= floorHeights[2] - 0.2 ? 2 : bot.position.y >= floorHeights[1] - 0.2 ? 1 : 0;
      if (level !== followedFloor && viewMode === 'third') {
        sliceEstate(level, true, true);
        followedFloor = level;
      }
      for (const marker of markers) {
        marker.group.visible = (marker.room.floor === level || level === 0 && marker.room.floor === -1) && marker.room.id === walkStatus?.room?.id &&
          (!walkStatus?.locus || marker.hit.userData.locus.id === walkStatus.locus.id);
      }
      followCamera.update(viewMode, stewards.followedInfo(), delta, reduced.matches);
    } else if (motion) {
      const progress = Math.min((time - motion.start) / 850, 1);
      const easing = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(motion.fromPosition, motion.position, easing);
      controls.target.lerpVectors(motion.fromTarget, motion.target, easing);
      if (progress >= 1) motion = null;
    }
    if (viewMode === 'overview') controls.update();
    for (const { group, halo, point, hit } of markers) {
      if (!group.visible) continue;
      halo.quaternion.copy(camera.quaternion);
      halo.scale.setScalar(reduced.matches ? 1 : 1 + Math.sin(time / 420) * 0.15);
      const night = viewport.dataset.renderStyle === 'cyberpunk';
      point.material.color.setHex(hover?.locus.id === hit.userData.locus.id ? (night ? 0xa5fff2 : 0x4f967d) : (night ? 0xffe9ae : 0xa17e43));
      halo.material.color.setHex(night ? 0xffe9ae : 0xb08c50);
    }
    // Keep steward tasks moving while the opaque meditation surface covers the manor.
    if (isObscured()) return;
    const following = viewMode === 'third' || viewMode === 'steward';
    if (following && bot) lightingFocus.copy(bot.position).y += 0.4;
    const lightState = roomLighting.update({
      position: camera.position,
      focusPosition: following && bot ? lightingFocus : viewMode === 'overview' ? controls.target : undefined,
      viewMode,
      roomId: viewMode === 'overview' ? options.room?.id : undefined,
      floor: viewMode === 'third' ? followedFloor : viewMode === 'overview' ? options.room?.floor ?? options.floor : null,
    }, delta);
    renderStyle.setInterior(lightState.interior);
    renderStyle.render(delta);
  });
  function setRenderStyle(id) {
    if (!renderStyle.setStyle(id)) return false;
    nightWindows.setStyle(id);
    roomLighting.setStyle(id);
    return true;
  }
  return {
    frameView,
    setViewMode,
    getViewMode: () => viewMode,
    enterRoom: (roomId, locusId) => setViewMode('human', { roomId, locusId }),
    dispatchTo: stewards.dispatchTo,
    setStewardAppearance: (id, appearance) => stewards.setAppearance(id, appearance),
    gatherStewards() {
      const target = viewMode === 'human' ? [camera.position.x, camera.position.y - 1.6, camera.position.z] : undefined;
      return stewards.gatherAll(target);
    },
    releaseStewards: () => stewards.releaseAll(),
    setRenderStyle,
    setLightingLevel: roomLighting.setLevel,
    applyDesign(design) {
      furnishings.apply(design);
      renderStyle.setTheme(design.theme);
      setRenderStyle(design.render_style || 'original');
      roomLighting.setLevel(design.lighting_level ?? 1);
      document.body.dataset.estateTheme = design.theme;
    },
    focusDecoration(roomId, slot) {
      const room = manifest.rooms.find(({ id }) => id === roomId);
      if (!room) return;
      const target = decorationPosition(room, slot).add(new THREE.Vector3(0, 0.65, 0));
      const side = Math.abs(room.position[0]) > 16 ? Math.sign(room.position[0]) : 1;
      const offset = new THREE.Vector3(side * 2.2, 1.5, 1.6).multiplyScalar(camera.aspect < 1 ? 1.55 : 1);
      frameView({ room, floor: room.floor, cutaway: true, view: {
        target: target.toArray(), position: target.clone().add(offset).toArray(),
      } });
    },
    follow(active, stewardId) {
      if (!active) { frameView(options); return false; }
      return setViewMode(viewMode === 'steward' ? 'steward' : 'third', { stewardId });
    },
  };
}
