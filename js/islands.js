/* 天空群島：住宅島（每位員工一棟家）、娛樂島（7-11・健身房・電影院・網球場）、牧場島、草原島（UFO 公車站）、吊橋、熱氣球 */
(() => {
const H = HQ, {scene} = H, PI = Math.PI, K = H.SKY, {flat} = K;
const V3 = THREE.Vector3, box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const mk = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
function signTex(lines, w = 512, h = 128, bg = '#17363c', fg = '#ffffff', accent = '#f37021'){
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (bg){ g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => { const big = i === 0, n = lines.length; g.fillStyle = big ? fg : accent; g.font = `${big ? 800 : 600} ${Math.round(h * (n > 1 ? (big ? .42 : .26) : .56))}px "Noto Sans TC","PingFang TC",sans-serif`; g.fillText(l, w / 2, n > 1 ? h * (big ? .38 : .78) : h / 2); });
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}
const board = (tex, w, h, parent, x, y, z, ry = 0, emissive = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map:tex, roughness:.6, emissive:emissive ? 0xffffff : 0, emissiveMap:emissive ? tex : null, emissiveIntensity:emissive})); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; };

/* ---------- islands ---------- */
const ISL = H.ISL = {
  res:{name:'住宅島', sub:'雙層泳池豪宅社區', c:[-31, -1.6, 34], ax:14, az:11, dc:'var(--d-growth)'},
  fun:{name:'娛樂島', sub:'7-11・GYM・電影院・網球', c:[34, -2.4, 34], ax:16, az:12.5, dc:'var(--accent)'},
  farm:{name:'牧場島', c:[-37, 4, -35], ax:11, az:9, dc:'#6f9c3e'},
  pasture:{name:'草原島', sub:'UFO 公車站', c:[39, 2.6, -33], ax:10, az:8, dc:'#8b5cf6'},
};
for (const k in ISL){
  const I = ISL[k]; I.key = k; I.y = I.c[1] - .06; I.g = new THREE.Group(); I.g.position.set(...I.c); scene.add(I.g);
  const m = new THREE.Mesh(K.islandGeo(I.ax, I.az, Math.max(I.ax, I.az) * 1.25, 1.1), K.rockM); m.receiveShadow = true; I.g.add(m);
  I.W = (x, z) => new V3(I.c[0] + x, I.y, I.c[2] + z);
  I.rim = th => { const c = Math.cos(th), s = Math.sin(th); return [I.ax * c / Math.max(Math.abs(c),Math.abs(s)), I.az * s / Math.max(Math.abs(c),Math.abs(s))]; };
}
const bushAt = (I, x, z, s = 1) => { const b = mk(new THREE.IcosahedronGeometry(.6 * s, 0), K.leafM[(K.rnd() * 3) | 0], I.g, x, .2 * s, z); b.scale.y = .7; };
const flowersAt = (I, x, z, n = 6) => { const cols = ['#f37021', '#ffd54f', '#ffffff', '#e57399']; for (let i = 0; i < n; i++) mk(new THREE.SphereGeometry(.09, 6, 4), flat(cols[i % 4]), I.g, x + (K.rnd() - .5) * 1.4, .08, z + (K.rnd() - .5) * 1.4); };
const lamps = [], lampM = new THREE.MeshStandardMaterial({color:0xfff2c8, emissive:0xffd27a, emissiveIntensity:0});
function lampPost(I, x, z){ mk(new THREE.CylinderGeometry(.06, .08, 2.6, 6), flat('#17363c'), I.g, x, 1.3, z); mk(new THREE.SphereGeometry(.2, 10, 8), lampM, I.g, x, 2.7, z); }
function bench(I, x, z, ry){ const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; I.g.add(g); mk(box(1.5, .08, .45), flat('#a87b52'), g, 0, .45, 0); mk(box(1.5, .4, .06), flat('#a87b52'), g, 0, .72, -.2); for (const s of [-1, 1]) mk(box(.08, .45, .4), flat('#17363c'), g, .65 * s, .22, 0); return g; }
/* ring path around each plaza so people walk around the fountain, not through it */
function ringPts(I, a0, a1, r = 2.6){ let d = a1 - a0; d = Math.atan2(Math.sin(d), Math.cos(d)); const n = Math.max(1, Math.ceil(Math.abs(d) / .45)), out = []; for (let i = 0; i <= n; i++){ const a = a0 + d * i / n; out.push(I.W(Math.cos(a) * r * 1.15, Math.sin(a) * r)); } return out; }
H.ISL_ringPts = ringPts;
function fountain(I){ mk(new THREE.CylinderGeometry(1.5, 1.6, .45, 20), flat('#d9d2c7', {flatShading:false}), I.g, 0, .22, 0); const w = mk(new THREE.CylinderGeometry(1.3, 1.3, .06, 20), new THREE.MeshStandardMaterial({color:0x7fc8ee, roughness:.1, metalness:.1}), I.g, 0, .42, 0); w.castShadow = false; mk(new THREE.CylinderGeometry(.15, .2, 1.1, 8), flat('#d9d2c7'), I.g, 0, .8, 0); }

/* ---------- rope bridges from the office lawn ---------- */
const woodM = flat('#9b7653'), ropeM = flat('#6b5440');
function rimToward(I, P){ let best = null, bd = 1e9; for (let i = 0; i < 360; i++){ const [x, z] = I.rim(i / 360 * PI * 2), d = Math.hypot(I.c[0] + x - P.x, I.c[2] + z - P.z); if (d < bd){ bd = d; best = [x, z]; } } const l = Math.hypot(...best), k = (l - 1.1) / l; return {x:best[0] * k, z:best[1] * k}; }
function bridge(A, I){
  const bl = rimToward(I, A), B = I.W(bl.x, bl.z), len = A.distanceTo(B), sag = len * .05;
  const at = t => { const p = A.clone().lerp(B, t); p.y = A.y + (B.y - A.y) * t - sag * Math.sin(PI * t) + .06; return p; };
  const g = new THREE.Group(); scene.add(g);
  const n = Math.ceil(len / .42), plankG = box(1.5, .07, .32);
  for (let i = 0; i <= n; i++){ const t = i / n, p = at(t), m = mk(plankG, woodM, g, p.x, p.y, p.z); m.lookAt(at(Math.min(1, t + .01)).add(t >= 1 ? p.clone().sub(at(.99)) : new V3())); }
  const dir = B.clone().sub(A).setY(0).normalize(), side = new V3(-dir.z, 0, dir.x);
  for (const s of [-1, 1]){
    const pts = []; for (let i = 0; i <= 20; i++){ const t = i / 20, p = at(t).addScaledVector(side, .78 * s); p.y += 1 - .25 * Math.sin(PI * t); pts.push(p); }
    mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, .035, 5), ropeM, g);
    for (let i = 0; i <= n; i += 3){ const t = i / n, p = at(t).addScaledVector(side, .78 * s), top = 1 - .25 * Math.sin(PI * t); mk(new THREE.CylinderGeometry(.015, .015, top, 4), ropeM, g, p.x, p.y + top / 2, p.z); }
    for (const P of [at(0), at(1)]){ const q = P.clone().addScaledVector(side, .8 * s); mk(new THREE.CylinderGeometry(.08, .1, 1.3, 6), woodM, g, q.x, q.y + .6, q.z); }
  }
  const walk = []; for (let i = 0; i <= n; i++) { const p = at(i / n); p.y += .035; walk.push(p); }
  const angle = Math.atan2(bl.z, bl.x);
  return {walk, angle};
}
/* the office exits: floor point inside the nav grid, then the bridge head on the lawn */
ISL.res.exit = {x:-12, z:10.7}; ISL.fun.exit = {x:12, z:10.7};
for (const I of [ISL.res, ISL.fun]){ const b = bridge(new V3(I.exit.x, -.06, 13.4), I); I.bridge = b.walk; I.bridgeAngle = b.angle; }

/* ---------- 住宅島: one house per teammate, plus two neighbours ---------- */
const DEPT_ROOF = {sales:'#c9560f', creative:'#17363c', production:'#f37021', growth:'#3f7f8c'};
const R = ISL.res; R.houses = {};
function house(I, ang, who, roof, wall){
  const lx = Math.cos(ang) * 9.6, lz = Math.sin(ang) * 7.4, g = new THREE.Group(); g.position.set(lx, 0, lz); g.rotation.y = Math.atan2(-lx, -lz); I.g.add(g);
  g.name=who+' 的泳池豪宅';
  const stone=flat('#f5f0e7'),frame=flat('#214b49'),timber=flat('#a66e40');
  const win=new THREE.MeshStandardMaterial({color:0x8bd7de,transparent:true,opacity:.3,emissive:0xffc66b,emissiveIntensity:0,roughness:.08,depthWrite:false});
  // Two full storeys, open glass facades, shaded balcony and a private rear pool.
  for(const y of [.04,2.5,5])mk(box(3.6,.16,3),stone,g,0,y,0);
  for(const x of [-1.65,1.65])for(const z of [-1.35,1.35])mk(box(.15,5,.15),frame,g,x,2.5,z);
  mk(box(1.1,4.8,2.7),flat(wall),g,-1.1,2.5,0);
  for(const y of [1.3,3.8]){
    mk(box(2.4,2.25,.04),win,g,.45,y,1.38);mk(box(2.4,2.25,.04),win,g,.45,y,-1.38);
    mk(box(.04,2.25,2.7),win,g,1.7,y,0);
    mk(box(1,.35,.55),timber,g,.5,y-.9,.1);mk(box(.65,.35,.65),flat(roof),g,.9,y-.75,-.7);
  }
  mk(box(3.6,.12,.6),stone,g,0,2.5,1.72);
  mk(box(3.55,.65,.04),win,g,0,2.88,2);mk(box(3.6,.05,.05),frame,g,0,3.23,2);
  // Ground-level threshold stays on the established walking route.
  mk(box(.8,1.9,.08),timber,g,-.2,.9,1.43);
  board(signTex([who+' 的家','雙層泳池別墅'],256,96,'#17363c','#fffaf2'),1.25,.46,g,-.8,1.9,1.5);
  mk(box(3.6,.08,2.1),stone,g,0,-.02,-2.6);
  const pool=mk(box(2.8,.035,1.45),new THREE.MeshStandardMaterial({color:0x00b8c8,roughness:.12,metalness:.25}),g,0,.035,-2.65);pool.name='private-swimming-pool';
  for(const z of [-3.43,-1.87])mk(box(3,.12,.12),stone,g,0,.06,z);
  for(const x of [-1.46,1.46])mk(box(.12,.12,1.65),stone,g,x,.06,-2.65);
  for(const x of [-1.5,1.5]){mk(box(.35,.16,.75),timber,g,x,.17,-2.65);mk(box(.35,.09,.3),stone,g,x,.29,-2.95);}
  g.userData.residence={storeys:2,pool:true,owner:who};
  // Door coordinates are world-space: update the island ancestor before sampling.
  g.updateWorldMatrix(true, true);
  const door = g.localToWorld(new V3(0, 0, 1.9)); door.y = I.y;
  return {g, win, door, ang, home:false, npc:false};
}
{
  const N = 10, step = PI * 2 / (N + 1), names = H.ROSTER.map(r => r.name).concat(['王阿姨', '陳伯']);
  names.forEach((nm, i) => {
    const r = H.ROSTER[i], ang = R.bridgeAngle + (i + 1) * step;
    const h = house(R, ang, nm, r ? DEPT_ROOF[r.dept] : '#7a8b99', ['#f4ede3', '#efe4d6', '#f8f1e6', '#eadfce'][i % 4]);
    if (!r) h.npc = true; R.houses[nm] = h;
    const tx = Math.cos(ang + step / 2), tz = Math.sin(ang + step / 2);
    if (i < N - 2) K.tree(tx * 12, tz * 9.3, .75 + K.rnd() * .3, R.g);
  });
  fountain(R); flowersAt(R, 2.4, -2.6); flowersAt(R, -2.6, 2.3);
  for (const a of [.8, 2.4, 4, 5.6]) lampPost(R, Math.cos(R.bridgeAngle + a) * 4.6, Math.sin(R.bridgeAngle + a) * 3.8);
  R.benches = [PI - .55, PI + .55].map(d => { const a = R.bridgeAngle + d, x = Math.cos(a) * 4.2, z = Math.sin(a) * 3.4; bench(R, x, z, Math.atan2(-x, -z)); return {p:R.W(x * .92, z * .92), face:Math.atan2(-x, -z)}; });
  const [sx, sz] = R.rim(R.bridgeAngle + .35); board(signTex(['A.C.E. 泳池豪宅社區', '每人一棟 · 私人泳池'], 512, 160), 2.2, .7, R.g, sx * .82, 1.4, sz * .82, Math.atan2(-sx, -sz) + PI);
  mk(new THREE.CylinderGeometry(.06, .06, 1.1, 5), flat('#17363c'), R.g, sx * .82, .55, sz * .82);
}

/* ---------- 娛樂島: 7-11, gym, cinema, tennis court ---------- */
const F = ISL.fun; F.venues = {};
{
  /* 7-11 */
  const s = new THREE.Group(); s.position.set(-8.5, 0, 4.5); s.rotation.y = PI / 2; F.g.add(s);
  mk(box(4.2, 2.8, 3.2), flat('#fbfbf7'), s, 0, 1.4, 0);
  [['#f37021', 2.35], ['#1f9d55', 2.15], ['#e11d2a', 1.95]].forEach(([c, y]) => mk(box(4.24, .16, 3.24), flat(c, {emissive:c, emissiveIntensity:.15}), s, 0, y, 0));
  F.storeGlass = new THREE.MeshStandardMaterial({color:0xd8f0ff, emissive:0xfff7df, emissiveIntensity:.25, roughness:.05, transparent:true, opacity:.85});
  mk(box(3.2, 1.5, .06), F.storeGlass, s, 0, .95, 1.62);
  F.storeSign = board(signTex(['7-11', 'OPEN 24H'], 256, 128, '#ffffff', '#1f9d55', '#e11d2a'), 1.6, .8, s, 0, 3.15, 1.62, 0, .4);
  mk(box(.9, .05, .5), flat('#e11d2a'), s, 1.6, 1.85, 1.85);
  F.venues['711'] = {door:F.W(-6.5, 4.5), label:'7-11'};
  /* cinema */
  const c = new THREE.Group(); c.position.set(1, 0, -8.6); F.g.add(c);
  mk(box(6, 3.6, 4.4), flat('#7a1f2b'), c, 0, 1.8, 0); mk(box(6.2, .3, 4.6), flat('#17363c'), c, 0, 3.7, 0);
  F.marquee = board(signTex(['CINEMA 王牌影城', '今日上映：讓 AI 成為每個品牌的王牌'], 512, 128, '#17363c', '#ffd27a', '#ffffff'), 4.4, 1.1, c, 0, 3.0, 2.22, 0, .6);
  for (const x of [-2.2, 2.2]) board(signTex(['♠', 'A.C.E.'], 128, 192, '#f37021', '#ffffff', '#17363c'), .8, 1.2, c, x, 1.2, 2.22);
  mk(box(1.4, 1.9, .06), flat('#1c1f22'), c, 0, .95, 2.22);
  F.bulbs = []; for (let i = 0; i < 14; i++){ const b = mk(new THREE.SphereGeometry(.07, 6, 4), new THREE.MeshStandardMaterial({color:0xfff2c8, emissive:0xffd27a, emissiveIntensity:.3}), c, -2.3 + i * 4.6 / 13, 3.62, 2.26); F.bulbs.push(b); }
  F.venues.cinema = {door:F.W(1, -6.0), label:'電影院'};
  /* gym */
  const y = new THREE.Group(); y.position.set(-10, 0, -.8); y.rotation.y = PI / 2; F.g.add(y);
  mk(box(5, 3, 4), flat('#2a3236'), y, 0, 1.5, 0);
  F.gymGlass = new THREE.MeshStandardMaterial({color:0xbfe3ff, emissive:0x9fd8ff, emissiveIntensity:.15, roughness:.05});
  mk(box(4, 1.8, .06), F.gymGlass, y, 0, 1.2, 2.02);
  board(signTex(['GYM', 'A.C.E. FITNESS'], 256, 128, '#f37021', '#ffffff', '#17363c'), 1.6, .8, y, 0, 2.55, 2.04, 0, .3);
  const db = new THREE.Group(); db.position.set(0, 3.35, 0); y.add(db); mk(new THREE.CylinderGeometry(.08, .08, 2.2, 8), flat('#9aa1ad'), db).rotation.z = PI / 2; for (const s2 of [-1, 1]) mk(new THREE.CylinderGeometry(.42, .42, .3, 14), flat('#17363c'), db, .95 * s2, 0, 0).rotation.z = PI / 2;
  F.venues.gym = {door:F.W(-7.4, -.8), label:'健身房'};
  /* tennis */
  const ct = document.createElement('canvas'); ct.width = 256; ct.height = 512; const g = ct.getContext('2d');
  g.fillStyle = '#3f7f8c'; g.fillRect(0, 0, 256, 512); g.fillStyle = '#5a9a6a'; g.fillRect(0, 0, 256, 18); g.fillRect(0, 494, 256, 18); g.fillRect(0, 0, 18, 512); g.fillRect(238, 0, 18, 512);
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(24, 24, 208, 464); g.beginPath(); g.moveTo(54, 24); g.lineTo(54, 488); g.moveTo(202, 24); g.lineTo(202, 488); g.moveTo(54, 140); g.lineTo(202, 140); g.moveTo(54, 372); g.lineTo(202, 372); g.moveTo(128, 140); g.lineTo(128, 372); g.stroke();
  const tt = new THREE.CanvasTexture(ct); tt.encoding = THREE.sRGBEncoding;
  const court = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 9.6), new THREE.MeshStandardMaterial({map:tt, roughness:.9})); court.rotation.x = -PI / 2; court.position.set(8.5, .03, 0); court.receiveShadow = true; F.g.add(court);
  mk(box(4.6, .5, .04), new THREE.MeshStandardMaterial({color:0xffffff, transparent:true, opacity:.55}), F.g, 8.5, .45, 0); for (const s2 of [-1, 1]) mk(new THREE.CylinderGeometry(.04, .04, .9, 6), flat('#17363c'), F.g, 8.5 + 2.4 * s2, .45, 0);
  F.court = {A:{p:F.W(8.5, -3.9), face:0}, B:{p:F.W(8.5, 3.9), face:PI}, center:F.W(8.5, 0)};
  F.ball = mk(new THREE.SphereGeometry(.09, 8, 6), new THREE.MeshStandardMaterial({color:0xe7ff3a, emissive:0x9db800, emissiveIntensity:.3}), scene); F.ball.visible = false;
  fountain(F); flowersAt(F, -3, -3); flowersAt(F, 3.5, 3);
  for (const a of [.6, 2.2, 4.4, 5.4]) lampPost(F, Math.cos(a) * 5, Math.sin(a) * 4);
  F.benches = [[-4.2, -1.6], [-4, 1.8]].map(([x, z]) => { bench(F, x, z, Math.atan2(-x, -z)); return {p:F.W(x * .9, z * .9), face:Math.atan2(-x, -z)}; });
  for (const [x, z] of [[12.5, -7], [13, 7], [-12, 9], [6, 10], [-6, -9.5]]) K.tree(x, z, .8, F.g);
  const [sx, sz] = F.rim(F.bridgeAngle - .4); board(signTex(['娛樂島', '7-11 · GYM · CINEMA · TENNIS'], 512, 160), 2.4, .75, F.g, sx * .8, 1.4, sz * .8, Math.atan2(-sx, -sz) + PI);
  mk(new THREE.CylinderGeometry(.06, .06, 1.1, 5), flat('#17363c'), F.g, sx * .8, .55, sz * .8);
}

/* ---------- 牧場島 & 草原島 (UFO bus stops) ---------- */
const FA = ISL.farm, PA = ISL.pasture;
{
  const b = new THREE.Group(); b.position.set(-4.5, 0, -3.8); FA.g.add(b);
  mk(box(4.2, 2.6, 3.6), flat('#b23a2e'), b, 0, 1.3, 0);
  const roof = mk(new THREE.CylinderGeometry(2.3, 2.3, 4.4, 3, 1), flat('#5b4e45'), b, 0, 3.1, 0); roof.rotation.set(0, 0, PI / 2); roof.scale.set(.7, 1, 1);
  mk(box(1.6, 1.9, .06), flat('#f4ede3'), b, 0, .95, 1.82); mk(box(.08, 1.9, .08), flat('#7a2a20'), b, 0, .95, 1.86);
  mk(new THREE.CylinderGeometry(1, 1, 4.6, 12), flat('#d9d2c7', {flatShading:false}), FA.g, -8, 2.3, -2.6); mk(new THREE.SphereGeometry(1, 12, 6, 0, PI * 2, 0, PI / 2), flat('#9aa1ad'), FA.g, -8, 4.6, -2.6);
  const wm = new THREE.Group(); wm.position.set(5.5, 0, -4); FA.g.add(wm);
  mk(new THREE.CylinderGeometry(.5, 1, 4.6, 8), flat('#f4ede3'), wm, 0, 2.3, 0); mk(new THREE.ConeGeometry(.75, .9, 8), flat('#b23a2e'), wm, 0, 5, 0);
  FA.blades = new THREE.Group(); FA.blades.position.set(0, 4.3, .75); wm.add(FA.blades);
  for (let i = 0; i < 4; i++){ const bl = mk(box(.32, 2.6, .05), flat('#fbf6f2'), FA.blades); bl.position.set(Math.sin(i * PI / 2) * 1.3, Math.cos(i * PI / 2) * 1.3, 0); bl.rotation.z = -i * PI / 2; }
  for (const [x, z] of [[1.6, -5.4], [2.8, -6], [.4, -6.2]]) mk(new THREE.CylinderGeometry(.5, .5, .8, 12), flat('#e6c35c'), FA.g, x, .5, z).rotation.z = PI / 2;
  mk(box(.6, .4, 2), flat('#8a6a4a'), FA.g, -8.6, .2, 2.2);
  for (let i = 0; i < 9; i++){ const x = -7.5 + i * 1.9; mk(box(.1, .8, .1), woodM, FA.g, x, .4, 7.4); if (i < 8) mk(box(1.9, .08, .06), woodM, FA.g, x + .95, .6, 7.4); }
  K.tree(8.5, 2, .9, FA.g); K.tree(-9, 5, .8, FA.g); flowersAt(FA, 7, 6);
  FA.zone = {x0:-7.5, x1:7.5, z0:-.6, z1:6.4};
  PA.zone = {x0:-6, x1:6, z0:.6, z1:5.2};
  const pond = mk(new THREE.CylinderGeometry(2.2, 2.2, .05, 24), new THREE.MeshStandardMaterial({color:0x6fb4dd, roughness:.08, metalness:.15}), PA.g, -3.4, .02, -2.4); pond.castShadow = false;
  K.tree(4.6, -4.4, 1, PA.g); K.tree(7, -1.5, .7, PA.g); flowersAt(PA, 1, -3); flowersAt(PA, 5.5, 4.5); bushAt(PA, -7, -1);
  for (const [I, x, z, txt] of [[FA, 7.4, 4.6, ['UFO 站', '→ 草原島']], [PA, -6.8, 4.2, ['UFO 站', '→ 牧場島']]]){
    mk(new THREE.CylinderGeometry(.06, .06, 2.2, 6), flat('#17363c'), I.g, x, 1.1, z);
    board(signTex(txt, 256, 160, '#8b5cf6', '#ffffff', '#e9ddff'), 1.1, .7, I.g, x, 2.1, z + .05, 0, .3);
  }
}

/* ---------- hot-air balloons ---------- */
const balloons = [];
function balloon(cols, text, r, y, w, a){
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  cols.forEach((col, i, arr) => { g.fillStyle = col; for (let k = 0; k < 4; k++) g.fillRect((k * arr.length + i) * 512 / (arr.length * 4), 0, 512 / (arr.length * 4) + 1, 256); });
  if (text){ g.font = '900 34px Georgia,"Noto Serif TC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; for (const u of [.25, .75]){ g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.ellipse(u * 512, 105, 70, 34, 0, 0, PI * 2); g.fill(); g.fillStyle = '#17363c'; g.fillText(text, u * 512, 106); } }
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  const prof = [[.45, 0], [.8, .5], [1.4, 1.2], [1.95, 2], [2.3, 2.8], [2.45, 3.5], [2.38, 4.2], [2.05, 4.8], [1.45, 5.3], [.7, 5.6], [0, 5.7]].map(([x, yy]) => new THREE.Vector2(x, yy));
  const grp = new THREE.Group(); scene.add(grp);
  const envM = new THREE.MeshStandardMaterial({map:tex, roughness:.75, emissive:0xff9a40, emissiveIntensity:0});
  mk(new THREE.LatheGeometry(prof, 28), envM, grp);
  mk(box(.9, .6, .9), flat('#8a6a4a'), grp, 0, -1.3, 0);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){ const p0 = new V3(.4 * sx, -1, .4 * sz), p1 = new V3(.42 * sx, .05, .42 * sz), m = mk(new THREE.CylinderGeometry(.015, .015, p0.distanceTo(p1), 4), ropeM, grp); m.position.copy(p0).lerp(p1, .5); m.lookAt(p1); m.rotateX(PI / 2); }
  const flame = mk(new THREE.ConeGeometry(.16, .55, 8), new THREE.MeshBasicMaterial({color:0xffb347, toneMapped:false}), grp, 0, -.5, 0);
  balloons.push({grp, envM, flame, r, y, w, a, burn:0, k:Math.random() * 6});
}
balloon(['#f37021', '#fbf6f2', '#17363c'], 'A.C.E.', 60, 17, .028, 0);
balloon(['#3f7f8c', '#fbf6f2'], 'LUXKEY', 72, 22, -.02, 2);
balloon(['#e11d2a', '#ffd54f', '#1f9d55', '#2f7cf6', '#8b5cf6'], '', 54, 13, .034, 3.6);
balloon(['#c9560f', '#ffd27a'], '♠', 80, 26, .016, 5);

/* island name labels (click to fly there) */
for (const I of Object.values(ISL)){
  const el = document.createElement('button'); el.className = 'zone isle'; el.style.setProperty('--dc', I.dc);
  el.textContent = I.sub ? `${I.name} · ${I.sub}` : I.name;
  el.onclick = () => { H.focusOn(I.c[0], I.c[2], 40); H.goal.ty = I.y + 1; };
  H.$('#overlay').append(el); H.zoneTags.push({el, x:I.c[0], y:I.y + .1, z:I.c[2] + I.az * .98});
}

/* ---------- per-frame ---------- */
H.airDecor.push(...balloons.map(b=>b.grp));
const prev = H.updateWorld;
H.updateWorld = (dt, t) => {
  prev && prev(dt, t);
  const d = H.daylight, night = 1 - d;
  lampM.emissiveIntensity = night * 1.6;
  for (const h of Object.values(R.houses)) h.win.emissiveIntensity = (h.home || (h.npc && night > .3)) ? .25 + night * 1.2 : 0;
  F.storeGlass.emissiveIntensity = .25 + night * 1.1; F.storeSign.material.emissiveIntensity = .4 + night;
  F.gymGlass.emissiveIntensity = .15 + night * .9; F.marquee.material.emissiveIntensity = .5 + night * .8;
  F.bulbs.forEach((b, i) => b.material.emissiveIntensity = .3 + night * (Math.sin(t * 6 + i * 1.3) > 0 ? 2 : .4));
  FA.blades.rotation.z -= dt * .9;
  for (const b of balloons){
    b.a += b.w * dt; const g = b.grp; g.position.set(Math.cos(b.a) * b.r, b.y + Math.sin(t * .4 + b.k) * 1.4, Math.sin(b.a) * b.r);
    g.rotation.y += dt * .05; g.rotation.z = Math.sin(t * .5 + b.k) * .04;
    if ((b.burn -= dt) < -4 - Math.random() * 6) b.burn = 1 + Math.random();
    const on = b.burn > 0; b.flame.visible = on; b.flame.scale.setScalar(on ? .8 + Math.random() * .5 : 1); b.envM.emissiveIntensity = on ? .1 + night * .5 : 0;
  }
};
})();
