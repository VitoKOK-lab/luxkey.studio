/* 天空島：辦公室漂浮在空中 — 岩石浮島、瀑布、樹、雲海、小浮島、日月、星空、鳥群、UFO */
(() => {
const H = HQ, {scene, camera} = H, PI = Math.PI;
const FW = H.FLOOR.w, FD = H.FLOOR.d;
let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const flat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({color:c, roughness:.95, metalness:0, flatShading:true}, o));

/* ---------- sky gradient (screen-space background) ---------- */
const bgC = document.createElement('canvas'); bgC.width = 4; bgC.height = 256;
const bgT = new THREE.CanvasTexture(bgC); bgT.encoding = THREE.sRGBEncoding; scene.background = bgT;
const PAL = {
  day:   ['#4f9ee0', '#9fcdf0', '#e3f1fb'],
  dusk:  ['#3e4f8f', '#e98f73', '#fbd3a8'],
  night: ['#050a1c', '#0f1d40', '#1d3159'],
};
const mix = (a, b, k) => { const x = new THREE.Color(a), y = new THREE.Color(b); return x.lerp(y, k); };
let lastKey = '';
function paintSky(d, tw){
  const key = d.toFixed(3) + tw.toFixed(3); if (key === lastKey) return; lastKey = key;
  const g = bgC.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 256);
  [0, .55, 1].forEach((s, i) => { const c = mix(PAL.night[i], PAL.day[i], d).lerp(new THREE.Color(PAL.dusk[i]), tw * .85); grd.addColorStop(s, '#' + c.getHexString()); });
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256); bgT.needsUpdate = true;
}

/* ---------- the floating island ---------- */
function islandGeo(ax, az, depth, rough, grass = '#6fa83e'){
  const N = 48, rings = [[-.06, 1, 0], [-.85, 1.03, 1], [-1.6, .98, 2], [-.24, .86, 3], [-.44, .7, 3], [-.62, .52, 3], [-.8, .32, 3], [-.93, .14, 3]];
  const pts = rings.map(([y, s, kind], k) => {
    const yy = k < 3 ? y : -1.9 - (-y - .24) / .69 * (depth - 1.9), row = [];
    for (let j = 0; j < N; j++){
      const a = j / N * PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const jit = k === 0 ? 0 : (rnd() - .5) * rough * (k < 3 ? .5 : 1.4);
      const r = s + (k ? jit / Math.max(ax, az) * 4 : 0);
      row.push(new THREE.Vector3(ax * Math.sign(c) * Math.pow(Math.abs(c), .5) * r, yy + (k > 2 ? (rnd() - .5) * rough : 0), az * Math.sign(sn) * Math.pow(Math.abs(sn), .5) * r));
    }
    return {row, kind};
  });
  const tip = new THREE.Vector3((rnd() - .5) * ax * .2, -depth * 1.12 - 1, (rnd() - .5) * az * .2);
  const pos = [], col = [], C = [new THREE.Color(grass), new THREE.Color('#6f9c3e'), new THREE.Color('#8a6a4a'), new THREE.Color('#7b6d63')];
  const tri = (a, b, c, color) => { for (const v of [a, b, c]){ pos.push(v.x, v.y, v.z); col.push(color.r, color.g, color.b); } };
  const shade = (c, k) => c.clone().multiplyScalar(.82 + rnd() * .3 - k * .035);
  const center = new THREE.Vector3(0, -.06, 0);
  for (let j = 0; j < N; j++){ const a = pts[0].row[j], b = pts[0].row[(j + 1) % N]; tri(center, b, a, shade(C[0], 0)); }
  for (let k = 0; k < pts.length - 1; k++) for (let j = 0; j < N; j++){
    const a = pts[k].row[j], b = pts[k].row[(j + 1) % N], c = pts[k + 1].row[j], d = pts[k + 1].row[(j + 1) % N];
    const col1 = shade(C[Math.min(3, pts[k].kind)], k), col2 = shade(C[Math.min(3, pts[k].kind)], k);
    tri(a, b, c, col1); tri(b, d, c, col2);
  }
  const last = pts[pts.length - 1].row; for (let j = 0; j < N; j++) tri(last[j], last[(j + 1) % N], tip, shade(C[3], 9));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}
const rockM = new THREE.MeshStandardMaterial({vertexColors:true, roughness:1, flatShading:true});
const island = new THREE.Mesh(islandGeo(FW / 2 + 3.6, FD / 2 + 3.6, 20, 1.4), rockM);
island.receiveShadow = true; scene.add(island);

/* trees, bushes, flowers, rocks on the island rim (tall trees only behind the walls) */
const trunkM = flat('#7a5236'), leafM = [flat('#5f9a3c'), flat('#77b04a'), flat('#4c8a3a')], stoneM = flat('#a59a90');
function tree(x, z, s = 1, parent = scene){
  const g = new THREE.Group(); g.position.set(x, -.06, z); g.scale.setScalar(s); g.rotation.y = rnd() * PI;
  const t = new THREE.Mesh(new THREE.CylinderGeometry(.14, .22, 2.2, 6), trunkM); t.position.y = 1.1; g.add(t);
  for (let i = 0; i < 3; i++){ const f = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25 - i * .25, 0), leafM[i % 3]); f.position.set((rnd() - .5) * .6, 2.4 + i * .85, (rnd() - .5) * .6); f.rotation.set(rnd(), rnd(), rnd()); g.add(f); }
  g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); parent.add(g); return g;
}
function bush(x, z, s = 1){ const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.6 * s, 0), leafM[(rnd() * 3) | 0]); b.scale.y = .7; b.position.set(x, .25 * s - .06, z); b.rotation.y = rnd() * PI; b.castShadow = true; scene.add(b); }
function stone(x, z, s = 1, parent = scene, y = -.06){ const r = new THREE.Mesh(new THREE.DodecahedronGeometry(.45 * s, 0), stoneM); r.position.set(x, y + .2 * s, z); r.rotation.set(rnd(), rnd(), rnd()); r.castShadow = true; parent.add(r); return r; }
const FLOWERS = ['#f37021', '#ffd54f', '#ffffff', '#e57399', '#c9560f'];
function flowers(x, z, n = 6){ for (let i = 0; i < n; i++){ const f = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 4), flat(FLOWERS[(rnd() * FLOWERS.length) | 0], {emissive:'#331a00', emissiveIntensity:.2})); f.position.set(x + (rnd() - .5) * 1.4, .12, z + (rnd() - .5) * 1.4); scene.add(f); } }
for (const [x, z, s] of [[-17.2, -13.2, 1.3], [-11, -13.4, 1.1], [-4.5, -13.5, 1.25], [3, -13.3, 1], [9.5, -13.4, 1.2], [15.5, -13, 1.05], [-17.4, -6.5, 1.15], [-17.6, 0, 1.3], [-17.3, 6.5, 1.1], [-16.6, 12.4, .9]]) tree(x, z, s);
for (const [x, z] of [[-14.4, 12], [-6, 13.2], [-1, 12.4], [4, 13.4], [14.2, 11.8], [16.6, 11.8], [16.8, 4], [17, -4.5], [16.6, -10]]) bush(x, z, .8 + rnd() * .6);
for (const [x, z] of [[-9, 12.8], [1.5, 13], [14.5, 13.2], [17, 0], [16.9, 8]]) flowers(x, z);
for (const [x, z, s] of [[-14, 13.4, 1.2], [6.5, 12.6, .8], [17.6, -7, 1.1], [17.4, 10.2, .9]]) stone(x, z, s);

/* waterfall: a stream across the front lawn spilling off the edge */
const wfC = document.createElement('canvas'); wfC.width = 64; wfC.height = 256;
{ const g = wfC.getContext('2d'); g.fillStyle = '#9fd6f2'; g.fillRect(0, 0, 64, 256); for (let i = 0; i < 70; i++){ g.fillStyle = `rgba(255,255,255,${.25 + rnd() * .5})`; g.fillRect(rnd() * 64, rnd() * 256, 2 + rnd() * 4, 18 + rnd() * 40); } }
const wfT = new THREE.CanvasTexture(wfC); wfT.wrapS = wfT.wrapT = THREE.RepeatWrapping; wfT.encoding = THREE.sRGBEncoding;
const wfT2 = wfT.clone(); wfT2.needsUpdate = true; wfT2.repeat.set(1, 6);
const WX = 8.6, WZ0 = FD / 2 + .25, WZ1 = FD / 2 + 3.75;
const stream = new THREE.Mesh(new THREE.PlaneGeometry(1.5, WZ1 - WZ0), new THREE.MeshStandardMaterial({map:wfT, roughness:.15, metalness:.1, transparent:true, opacity:.92}));
stream.rotation.x = -PI / 2; stream.position.set(WX, -.02, (WZ0 + WZ1) / 2); scene.add(stream);
const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 26), new THREE.MeshBasicMaterial({map:wfT2, transparent:true, opacity:.85, side:THREE.DoubleSide, depthWrite:false}));
fall.position.set(WX, -13, WZ1 + .15); scene.add(fall);
const mistM = new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.5, depthWrite:false});
const mist = []; for (let i = 0; i < 10; i++){ const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.7 + rnd() * .6, 0), mistM); mist.push({m, k:rnd()}); scene.add(m); }

/* ---------- clouds ---------- */
function cloudGeo(n, size){
  const pos = [];
  for (let i = 0; i < n; i++){
    const r = size * (.55 + rnd() * .55), g = new THREE.IcosahedronGeometry(r, 1);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3((i - n / 2) * size * .55 + (rnd() - .5) * size * .4, (rnd() - .3) * size * .35, (rnd() - .5) * size * .7), new THREE.Quaternion(), new THREE.Vector3(1, .62, 1)));
    pos.push(...g.attributes.position.array);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals(); return geo;
}
/* clouds draw in the transparent pass without writing depth, so the sun/moon can glow over them while the island still hides them */
const cloudM = new THREE.MeshStandardMaterial({color:0xffffff, roughness:1, flatShading:true, emissive:0xffffff, emissiveIntensity:.25, transparent:true, opacity:.96, depthWrite:false});
const clouds = [];
function addCloud(r, a, y, n, size){ const m = new THREE.Mesh(cloudGeo(n, size), cloudM); m.position.set(Math.cos(a) * r, y, Math.sin(a) * r); m.rotation.y = rnd() * PI; scene.add(m); clouds.push({m, r, a, y, w:(.004 + rnd() * .006) * (rnd() < .5 ? 1 : -1), bob:rnd() * 6}); }
for (let i = 0; i < 16; i++) addCloud(62 + rnd() * 50, rnd() * PI * 2, -13 + rnd() * 10, 4 + (rnd() * 4 | 0), 3 + rnd() * 3);
for (let i = 0; i < 18; i++) addCloud(rnd() * 110, rnd() * PI * 2, -34 - rnd() * 8, 5 + (rnd() * 4 | 0), 6 + rnd() * 5); // cloud sea below

/* small floating islets with a tree, plus loose rocks under the main island */
const islets = [];
for (const [x, y, z, s] of [[-82, -8, 4, .2], [84, -12, -6, .16], [-4, -16, -74, .14]]){
  const g = new THREE.Group(); g.position.set(x, y, z);
  const m = new THREE.Mesh(islandGeo(30 * s, 26 * s, 34 * s, .6), rockM); g.add(m);
  tree(0, 0, s * 4, g); if (s > .15) tree(3 * s * 5, -2 * s * 5, s * 3, g);
  scene.add(g); islets.push({g, y, k:rnd() * 6});
}
const shards = [];
for (let i = 0; i < 9; i++){ const a = rnd() * PI * 2, r = 16 + rnd() * 9; const s = stone(Math.cos(a) * r, Math.sin(a) * r, 1.5 + rnd() * 2.5, scene, -4 - rnd() * 12); shards.push({s, y:s.position.y, k:rnd() * 6}); }

/* ---------- sun, moon, stars ---------- */
function glowTex(inner, outer, disc){
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, inner); grd.addColorStop(disc, inner); grd.addColorStop(disc + .04, outer); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  if (disc < .3){ g.fillStyle = 'rgba(160,160,190,.35)'; for (const [x, y, r] of [[112, 118, 9], [142, 136, 6], [124, 146, 5], [140, 110, 4]]){ g.beginPath(); g.arc(x, y, r, 0, PI * 2); g.fill(); } }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
const sunS = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex('#fff6d8', 'rgba(255,190,90,.45)', .36), transparent:true, depthWrite:false, toneMapped:false}));
const moonS = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex('#f4f1e6', 'rgba(170,200,255,.28)', .22), transparent:true, depthWrite:false, toneMapped:false}));
sunS.scale.setScalar(24); moonS.scale.setScalar(19); sunS.renderOrder = moonS.renderOrder = 10; scene.add(sunS, moonS);
const starPos = []; for (let i = 0; i < 700; i++){ const v = new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).normalize().multiplyScalar(300); starPos.push(v.x, v.y, v.z); }
const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({color:0xffffff, size:2, sizeAttenuation:false, transparent:true, opacity:0, depthWrite:false, toneMapped:false}));
scene.add(stars);
/* sun and moon ride an arc across the strip of sky between the top HUD and the island's top edge, following the sim clock */
const TOPS = [[-FW / 2, 3.7, -FD / 2], [FW / 2, 3.7, -FD / 2], [-FW / 2, 3.7, FD / 2], [0, 3.7, -FD / 2], [-FW / 2 - 2, 6, -FD / 2 - 2], [0, 6, -FD / 2 - 2.4], [FW / 2, 6, -FD / 2 - 2]].map(v => new THREE.Vector3(...v));
const tmp = new THREE.Vector3(), dir = new THREE.Vector3();
let skyBand = {top:60, bot:200}, bandT = 0;
function measureBand(){
  const W = innerWidth, Hh = innerHeight; let top = 0;
  for (const sel of ['.top', '#kpis', '.actions']){ const n = document.querySelector(sel), r = n && n.getBoundingClientRect(); if (r && r.height && r.bottom < Hh * .5) top = Math.max(top, r.bottom); }
  camera.updateMatrixWorld(); let isl = Hh;
  for (const v of TOPS){ tmp.copy(v).project(camera); if (tmp.z < 1) isl = Math.min(isl, (-tmp.y * .5 + .5) * Hh); }
  skyBand = {top, bot:isl, W, Hh};
}
function placeBody(sprite, p){
  const {top, bot, W, Hh} = skyBand, gap = bot - top;
  const base = gap > 50 ? top + gap * .62 : bot - 30, bump = gap > 50 ? Math.min(gap * .3, 60) : 8;
  const sx = W * (.1 + .8 * p), sy = Math.max(12, base - bump * Math.sin(PI * p));
  tmp.set(sx / W * 2 - 1, -(sy / Hh) * 2 + 1, .5).unproject(camera);
  dir.copy(tmp).sub(camera.position).normalize();
  sprite.position.copy(camera.position).addScaledVector(dir, 160);
  const k = 160 * Math.tan(camera.fov * PI / 360) * 2 / Hh; sprite.scale.setScalar(sprite.userData.px * k); /* constant pixel size */
}
sunS.userData.px = 130; moonS.userData.px = 104;

/* ---------- birds ---------- */
const birdBody = flat('#f6f1ea'), birdWing = new THREE.MeshStandardMaterial({color:'#ffffff', roughness:.9, flatShading:true, side:THREE.DoubleSide});
const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .25, 0, 0, -.2, 1.1, 0, -.05], 3)); wingGeo.computeVertexNormals();
function bird(){
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.ConeGeometry(.13, .7, 5), birdBody); b.rotation.x = PI / 2; g.add(b);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.05, .16, 4), flat('#f3a23a')); beak.rotation.x = PI / 2; beak.position.z = .42; g.add(beak);
  const wl = new THREE.Mesh(wingGeo, birdWing), wr = new THREE.Mesh(wingGeo, birdWing); wr.scale.x = -1; g.add(wl, wr);
  g.scale.setScalar(1.15); scene.add(g); return {g, wl, wr};
}
const flocks = [[26, 9, .16, 0, 5], [38, 13, -.11, 2, 6], [30, 6, .2, 4, 3]].map(([r, y, w, a, n]) => ({r, y, w, a, birds:Array.from({length:n}, (_, i) => Object.assign(bird(), {i, ph:rnd() * 6}))}));

/* shared builders for the other islands (islands.js / life.js) */
H.SKY = {islandGeo, rockM, tree, bush, stone, flowers, flat, rnd, leafM, trunkM};

/* ---------- per-frame ---------- */
const prev = H.updateWorld;
H.updateWorld = (dt, t) => {
  prev && prev(dt, t);
  const h = (H.state.simMin / 60) % 24, d = H.daylight, tw = d > 0 && d < 1 ? 1 - Math.abs(d - .5) * 2 : 0;
  paintSky(d, tw);
  if ((bandT -= dt) <= 0){ bandT = .25; measureBand(); }
  /* sun 06–19, moon 18–07 */
  const ps = (h - 6) / 13, pm = ((h - 18 + 24) % 24) / 13;
  sunS.visible = ps > -.05 && ps < 1.05; if (sunS.visible){ placeBody(sunS, H.clamp(ps, 0, 1)); sunS.material.opacity = H.clamp(Math.min(ps, 1 - ps) * 8 + .2, 0, 1); sunS.material.color.setRGB(1, .78 + d * .22, .6 + d * .4); }
  moonS.visible = pm >= 0 && pm <= 1; if (moonS.visible){ placeBody(moonS, pm); moonS.material.opacity = H.clamp((1 - d) * 1.2, 0, 1); }
  stars.position.copy(camera.position); stars.material.opacity = Math.pow(1 - d, 1.5) * .9;
  cloudM.color.copy(mix('#4c5b80', '#ffffff', d).lerp(new THREE.Color('#ffd2b8'), tw * .6)); cloudM.emissiveIntensity = .08 + d * .2;
  birdWing.color.copy(mix('#38425c', '#ffffff', d)); birdBody.color.copy(birdWing.color);
  /* motion */
  wfT.offset.y -= dt * .9; wfT2.offset.y -= dt * 2.2;
  for (const s of mist){ s.k = (s.k + dt * .35) % 1; s.m.position.set(WX + Math.sin(s.k * 9 + s.m.id) * 1.4, -24 + s.k * 3, WZ1 + .4 + Math.cos(s.k * 7) * .8); s.m.scale.setScalar(.6 + s.k); }
  mistM.opacity = .45;
  for (const c of clouds){ c.a += c.w * dt; c.m.position.set(Math.cos(c.a) * c.r, c.y + Math.sin(t * .3 + c.bob) * .6, Math.sin(c.a) * c.r); }
  for (const i of islets){ i.g.position.y = i.y + Math.sin(t * .5 + i.k) * .8; i.g.rotation.y += dt * .02; }
  for (const s of shards){ s.s.position.y = s.y + Math.sin(t * .6 + s.k) * .5; s.s.rotation.y += dt * .1; }
  const showBirds = d > .15;
  for (const f of flocks){
    f.a += f.w * dt;
    const dir = Math.sign(f.w);
    for (const b of f.birds){
      b.g.visible = showBirds; if (!showBirds) continue;
      const row = Math.ceil(b.i / 2), side = b.i % 2 ? 1 : -1, back = row * 1.6 / f.r, a = f.a - dir * back;
      const r = f.r + (b.i ? side * row * 1.3 : 0), y = f.y + Math.sin(t * .8 + f.a * 3) * 1.2 - row * .25;
      b.g.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      b.g.rotation.set(0, -a - (dir > 0 ? 0 : PI), Math.sin(t * .8) * .15 * dir);
      const flap = Math.sin(t * 9 + b.ph) * .55; b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
    }
  }
};
})();
