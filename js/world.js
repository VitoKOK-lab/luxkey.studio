/* A.C.E. loft — renderer, floor, walls, art, kitchen, lounge, studio, nav grid */
(() => {
const H = HQ, {pick, rand} = H;
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
Object.assign(H, {renderer, scene, camera});
const FW = H.FLOOR.w, FD = H.FLOOR.d;

/* theme + daylight */
let baseBg = new THREE.Color('#ece3da');
const nightBg = new THREE.Color('#141b1e');
H.applyTheme = () => { baseBg = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--scene').trim() || '#ece3da'); };
H.applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', H.applyTheme);
new MutationObserver(H.applyTheme).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
const hemi = new THREE.HemisphereLight(0xfff6ea, 0xcfc4b6, .8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, .9);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left:-22, right:22, top:22, bottom:-22, near:1, far:80});
sun.shadow.bias = -.0005; scene.add(sun); scene.add(sun.target);
const winM = new THREE.MeshStandardMaterial({color:0xd8ecf6, transparent:true, opacity:.28, roughness:.05, metalness:.1, depthWrite:false});
H.daylight = 1;
H.setDaylight = min => {
  const h = (min / 60) % 24;
  const d = h < 6 ? 0 : h < 8 ? (h - 6) / 2 : h < 17.5 ? 1 : h < 19.5 ? 1 - (h - 17.5) / 2 : 0;
  H.daylight = d;
  const a = (h - 6) / 13 * Math.PI;
  sun.position.set(Math.cos(a) * 22, 12 + Math.sin(Math.max(0, a)) * 14, 14);
  sun.intensity = .1 + d * .8; sun.color.setRGB(1, .84 + d * .16, .68 + d * .32);
  hemi.intensity = .22 + d * .6;
  winM.opacity = .22 + (1 - d) * .18;
};

/* helpers */
const matCache = {}; H.chairSpots = [];
H.mat = (c, o = {}) => { const key = c + JSON.stringify(o); return matCache[key] || (matCache[key] = new THREE.MeshStandardMaterial(Object.assign({color:c, roughness:.8, metalness:0}, o))); };
H.mesh = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; (parent || scene).add(o); return o; };
const {mat, mesh} = H;
const box = H.box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r1, r2, h, n = 16) => new THREE.CylinderGeometry(r1, r2, h, n);
function canvasTex(w, h, draw, rx = 1, ry = 1){
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t;
}
H.canvasTex = canvasTex;

/* nav grid */
const CS = .5, OX = -FW / 2 - 1, OZ = -FD / 2 - 1, GX = Math.ceil((FW + 2) / CS), GZ = Math.ceil((FD + 2) / CS), grid = new Uint8Array(GX * GZ);
const cx = x => H.clamp(Math.floor((x - OX) / CS), 0, GX - 1), cz = z => H.clamp(Math.floor((z - OZ) / CS), 0, GZ - 1);
const block = H.block = (x0, z0, x1, z1, pad = .25) => { for (let j = cz(z0 - pad); j <= cz(z1 + pad); j++) for (let i = cx(x0 - pad); i <= cx(x1 + pad); i++) grid[j * GX + i] = 1; };
H.navBlocked = (x, z) => !!grid[cz(z) * GX + cx(x)];
for (let i = 0; i < GX; i++){ grid[i] = 1; grid[GX + i] = 1; grid[(GZ - 1) * GX + i] = 1; }
for (let j = 0; j < GZ; j++){ grid[j * GX] = 1; grid[j * GX + 1] = 1; grid[j * GX + GX - 1] = 1; }
function los(ax, az, bx, bz, s, g){ const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / .2); for (let i = 1; i < n; i++){ const k = cz(az + (bz - az) * i / n) * GX + cx(ax + (bx - ax) * i / n); if (grid[k] && k !== s && k !== g) return false; } return true; }
H.findPath = (sx, sz, tx, tz) => {
  const near = k => { if (!grid[k]) return k; const x0 = k % GX, z0 = Math.floor(k / GX); for (let r = 1; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++){ if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const x = x0 + dx, z = z0 + dz; if (x >= 0 && z >= 0 && x < GX && z < GZ && !grid[z * GX + x]) return z * GX + x; } return k; };
  const s = near(cz(sz) * GX + cx(sx)), goal = near(cz(tz) * GX + cx(tx));
  if (s === goal) return [{x:tx, z:tz}];
  const gS = new Float32Array(GX * GZ).fill(Infinity), from = new Int32Array(GX * GZ).fill(-1), closed = new Uint8Array(GX * GZ);
  const heap = [], gx = goal % GX, gz = Math.floor(goal / GX);
  const hf = k => { const dx = Math.abs(k % GX - gx), dz = Math.abs(Math.floor(k / GX) - gz); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
  const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i){ const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length){ heap[0] = last; let i = 0; for (;;){ const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
  gS[s] = 0; push(s, hf(s)); let found = false;
  while (heap.length){
    const k = pop(); if (closed[k]) continue; closed[k] = 1; if (k === goal){ found = true; break; }
    const x = k % GX, z = Math.floor(k / GX);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++){
      if (!dx && !dz) continue; const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= GX || nz >= GZ) continue;
      const n = nz * GX + nx; if (grid[n] && n !== goal) continue; if (dx && dz && (grid[z * GX + nx] || grid[nz * GX + x])) continue;
      const c = gS[k] + (dx && dz ? 1.414 : 1); if (c < gS[n]){ gS[n] = c; from[n] = k; push(n, c + hf(n)); }
    }
  }
  if (!found) return [];
  const cells = []; for (let k = goal; k !== -1; k = from[k]) cells.unshift(k);
  const pts = cells.map(k => ({x:OX + (k % GX + .5) * CS, z:OZ + (Math.floor(k / GX) + .5) * CS}));
  pts[0] = {x:sx, z:sz}; pts.push({x:tx, z:tz});
  const out = []; let i = 0;
  while (i < pts.length - 1){ let j = pts.length - 1; while (j > i + 1 && !los(pts[i].x, pts[i].z, pts[j].x, pts[j].z, s, goal)) j--; out.push(pts[j]); i = j; }
  return out;
};

/* floor: wide pale oak planks + big woven rug areas */
const oak = canvasTex(512, 512, g => {
  const tones = ['#e4cfb2', '#dcc4a4', '#e9d6bb', '#d7bd9c', '#e1caa9'];
  for (let i = 0; i < 6; i++){ const y = i * 86; for (let x = -(i % 3) * 120; x < 512; x += 300){ g.fillStyle = pick(tones); g.fillRect(x, y, 300, 86); g.fillStyle = 'rgba(120,80,40,.18)'; g.fillRect(x, y, 2, 86); for (let s = 0; s < 5; s++){ g.fillStyle = 'rgba(140,95,50,.06)'; g.fillRect(x, y + 10 + Math.random() * 66, 300, 1.2); } } g.fillStyle = 'rgba(120,80,40,.22)'; g.fillRect(0, y, 512, 2); }
}, 5, 3.7);
const side = mat(0xf3ece4);
const floor = new THREE.Mesh(box(FW, .5, FD), [side, side, new THREE.MeshStandardMaterial({map:oak, roughness:.62}), side, side, side]);
floor.position.y = -.25; floor.receiveShadow = true; scene.add(floor);
function rug(x, z, w, d, c1, c2, round){
  const t = canvasTex(256, 256, g => { g.fillStyle = c1; g.fillRect(0, 0, 256, 256); g.fillStyle = c2; for (let i = 0; i < 256; i += 16) g.fillRect(0, i, 256, 6); g.globalAlpha = .35; for (let i = 0; i < 256; i += 32) g.fillRect(i, 0, 10, 256); }, w / 2, d / 2);
  const m = new THREE.MeshStandardMaterial({map:t, roughness:1});
  const r = round ? mesh(cyl(w / 2, w / 2, .03, 40), m, scene, x, .015, z) : mesh(box(w, .03, d), m, scene, x, .015, z);
  r.castShadow = false; return r;
}
H.zoneMeshes = {};
for (const id of H.DEPT_IDS){
  const z = H.DEPTS[id].zone, m = new THREE.MeshStandardMaterial({color:H.DEPTS[id].hex, transparent:true, opacity:.05, roughness:1, depthWrite:false});
  const p = mesh(new THREE.PlaneGeometry(z.x1 - z.x0, z.z1 - z.z0), m, scene, (z.x0 + z.x1) / 2, .012, (z.z0 + z.z1) / 2); p.rotation.x = -Math.PI / 2; p.castShadow = false; H.zoneMeshes[id] = m;
}

/* Estate architecture is built by estate.js after the shared workspaces. */

/* wall screens */
H.screens = {};
function screen(id, w, h, x, y, z, rotY = 0, cw = 1024){
  const c = document.createElement('canvas'); c.width = cw; c.height = Math.round(cw * h / w);
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; scene.add(g);
  mesh(box(w + .22, h + .22, .1), mat(0x111417, {roughness:.4}), g);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({map:tex, toneMapped:false})); p.position.z = .06; g.add(p);
  H.screens[id] = {c, tex, g, W:c.width, Hh:c.height};
}
screen('production', 6.4, 2.4, 1.5, 2.0, -FD / 2 + .06);   // render wall
screen('creative', 3.6, 1.8, -10.4, 2.0, -FD / 2 + .06);
screen('sales', 3.2, 1.7, -FW / 2 + .06, 2.0, 5.6, Math.PI / 2);
screen('growth', 3.2, 1.7, 12.4, 2.0, -FD / 2 + .06);
screen('neon', 2.4, 1.2, 13.6, 2.1, -FD / 2 + .06, 0, 640);
screen('meet', 2.6, 1.2, 12.4, 1.9, -3.6, Math.PI, 640);
const font = (w, px, mono) => `${w} ${px}px ${mono ? '"Noto Serif TC",Georgia,serif' : '"Noto Sans TC","PingFang TC",sans-serif'}`;
H.screenFont = font;
H.wrapText = (g, text, x, y, maxW, lh, maxLines = 4) => { let row = '', n = 0; for (const ch of [...text]){ if (g.measureText(row + ch).width > maxW){ g.fillText(row, x, y + n * lh); row = ''; if (++n >= maxLines) return; } row += ch; } g.fillText(row, x, y + n * lh); };
H.drawScreen = (id, fn) => { const s = H.screens[id], g = s.c.getContext('2d'); g.textAlign = 'left'; g.fillStyle = '#0f1416'; g.fillRect(0, 0, s.W, s.Hh); fn(g, s.W, s.Hh); s.tex.needsUpdate = true; };

/* art: generated abstract canvases on walls */
const noise = (g, w, h, n, alpha) => { for (let i = 0; i < n; i++){ g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * alpha})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 1 + Math.random() * 2); } };
const brush = (g, x0, y0, x1, y1, c, w, segs = 24) => { g.strokeStyle = c; g.lineCap = 'round'; for (let k = 0; k < 5; k++){ g.lineWidth = w * (0.5 + Math.random() * .8); g.globalAlpha = .35 + Math.random() * .4; g.beginPath(); for (let i = 0; i <= segs; i++){ const t = i / segs, x = x0 + (x1 - x0) * t + (Math.random() - .5) * w * .6, y = y0 + (y1 - y0) * t + (Math.random() - .5) * w * .6; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } g.globalAlpha = 1; };
const ART = [
  g => { // colour field (Rothko-like) in brand tones
    const grd = g.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, '#d9601a'); grd.addColorStop(.5, '#c9560f'); grd.addColorStop(1, '#8a3a0c'); g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#17363c'; g.globalAlpha = .92; g.fillRect(40, 60, 432, 190); g.fillStyle = '#ece3da'; g.globalAlpha = .88; g.fillRect(40, 290, 432, 160); g.globalAlpha = 1;
    for (let i = 0; i < 60; i++) brush(g, 40 + Math.random() * 432, 60 + Math.random() * 390, 40 + Math.random() * 432, 60 + Math.random() * 390, Math.random() < .5 ? 'rgba(23,54,60,.25)' : 'rgba(236,227,218,.18)', 10, 6);
    noise(g, 512, 512, 9000, .12); },
  g => { // bold brush abstraction
    g.fillStyle = '#f6efe7'; g.fillRect(0, 0, 512, 512);
    const cs = ['#17363c', '#c9560f', '#f37021', '#3f7f8c', '#1c1f22'];
    for (let i = 0; i < 14; i++) brush(g, Math.random() * 512, Math.random() * 512, Math.random() * 512, Math.random() * 512, cs[i % cs.length], 26 + Math.random() * 40);
    noise(g, 512, 512, 6000, .1); },
  g => { // minimal arcs
    g.fillStyle = '#17363c'; g.fillRect(0, 0, 512, 512); g.lineCap = 'round';
    for (let i = 0; i < 7; i++){ g.strokeStyle = i % 2 ? '#f37021' : '#ece3da'; g.lineWidth = 14; g.beginPath(); g.arc(256, 300, 40 + i * 30, Math.PI * (1.05 + i * .04), Math.PI * (1.95 - i * .03)); g.stroke(); }
    noise(g, 512, 512, 5000, .08); },
  g => { // spade poster
    g.fillStyle = '#fbf6f2'; g.fillRect(0, 0, 512, 512); g.fillStyle = '#17363c'; g.font = '700 400px Georgia,serif'; g.textAlign = 'center'; g.fillText('♠', 256, 400);
    g.fillStyle = '#c9560f'; g.fillRect(0, 452, 512, 60); g.fillStyle = '#fbf6f2'; g.font = '700 34px "Noto Serif TC",Georgia,serif'; g.fillText('A . C . E .', 256, 495); },
  g => { // confetti collage
    g.fillStyle = '#ece3da'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 70; i++){ g.save(); g.translate(Math.random() * 512, Math.random() * 512); g.rotate(Math.random() * Math.PI); g.fillStyle = pick(['#c9560f', '#17363c', '#3f7f8c', '#f37021', '#e9c9a8', '#fbf6f2']); g.globalAlpha = .85; g.fillRect(-30 - Math.random() * 60, -8 - Math.random() * 16, 60 + Math.random() * 120, 16 + Math.random() * 32); g.restore(); }
    g.globalAlpha = 1; noise(g, 512, 512, 7000, .1); },
  g => { // city at dusk, painterly
    const grd = g.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, '#17363c'); grd.addColorStop(.6, '#3f7f8c'); grd.addColorStop(1, '#f37021'); g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#fbf6f2'; g.beginPath(); g.arc(380, 150, 60, 0, Math.PI * 2); g.fill();
    for (let x = 0; x < 512; x += 28){ const h = 120 + Math.random() * 220; g.fillStyle = '#121a1c'; g.fillRect(x, 512 - h, 26, h); for (let y = 512 - h + 10; y < 500; y += 18) if (Math.random() < .5){ g.fillStyle = '#ffd37a'; g.fillRect(x + 6, y, 6, 8); } }
    noise(g, 512, 512, 6000, .1); },
  g => { // black and white photo-like portrait silhouette
    g.fillStyle = '#e8e4de'; g.fillRect(0, 0, 512, 512); g.fillStyle = '#2a2d31'; g.beginPath(); g.arc(256, 190, 90, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(256, 420, 160, 130, 0, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 400; i++) g.fillRect(Math.random() * 512, Math.random() * 512, 3, 60); noise(g, 512, 512, 12000, .18); },
];
function art(x, y, z, w, h, rotY, i){
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; scene.add(g);
  mesh(box(w + .16, h + .16, .07), mat(i % 3 === 1 ? 0x6b4a2e : 0x1c1f22, {roughness:.5}), g); mesh(box(w + .06, h + .06, .075), mat(0xfbf6f2), g, 0, 0, .004);
  const t = canvasTex(512, 512, ART[i % ART.length]); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1, 1);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map:t, roughness:.9})); p.position.z = .045; g.add(p);
}
/* neon sign: A.C.E. in orange on the brick */
{
  const c = canvasTex(1024, 256, g => { g.clearRect(0, 0, 1024, 256); g.fillStyle = '#f37021'; g.font = '700 150px "Noto Serif TC",Georgia,serif'; g.textBaseline = 'middle'; g.fillText('A.C.E.', 40, 118); g.font = '500 44px "Noto Sans TC",sans-serif'; g.fillStyle = '#fbf6f2'; g.fillText('讓 AI 成為每個品牌的王牌', 540, 126); });
  c.wrapS = c.wrapT = THREE.ClampToEdgeWrapping; c.repeat.set(1, 1);
  const m = new THREE.MeshStandardMaterial({map:c, transparent:true, emissive:0xffffff, emissiveMap:c, emissiveIntensity:.9, roughness:.4});
  const s = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), m); s.position.set(-1.6, 3.0, -FD / 2 + .12); scene.add(s); H.signage = m;
}

/* furniture (procedural fallback; assets.js swaps these for GLB models) */
const proc = H.procGroup = new THREE.Group(); proc.name = 'proc'; scene.add(proc);
function plant(x, z, s = 1, kind = 0){
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); proc.add(g);
  mesh(cyl(.3, .22, .5, 20), mat(kind ? 0xc9560f : 0xf3ece4), g, 0, .25, 0);
  const leaf = mat(kind ? 0x3a7d44 : 0x2f6b3a, {flatShading:true});
  if (kind === 2){ for (let i = 0; i < 9; i++){ const a = i / 9 * Math.PI * 2; const l = mesh(box(.08, 1.2, .3), leaf, g, Math.cos(a) * .18, 1.0, Math.sin(a) * .18); l.rotation.set(Math.sin(a) * .5, -a, Math.cos(a) * .5); } }
  else [[0,.95,0,.42],[.22,.78,.12,.32],[-.2,.8,-.1,.32],[.05,1.25,-.05,.3],[-.1,.7,.22,.26]].forEach(([a,b,c,r]) => mesh(new THREE.IcosahedronGeometry(r, 0), leaf, g, a, b, c));
  block(x - .35 * s, z - .35 * s, x + .35 * s, z + .35 * s, .1);
}
function chair(x, z, rotY = 0, color = 0x17363c){
  H.chairSpots.push({x, z, ry:rotY, color});
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; proc.add(g);
  mesh(cyl(.05, .05, .42, 8), mat(0x6b7280), g, 0, .22, 0); mesh(cyl(.28, .28, .03, 12), mat(0x6b7280), g, 0, .03, 0);
  mesh(box(.6, .1, .56), mat(color), g, 0, .48, 0); mesh(box(.6, .62, .09), mat(color), g, 0, .82, -.27);
}
const deskM = mat(0xe8d6bd, {roughness:.55}), legM = mat(0x1c1f22), lapM = mat(0xcdd1d6, {metalness:.4, roughness:.35}), lidM = mat(0xb9bec7, {metalness:.4, roughness:.35});
const glowM = new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xffffff, emissiveIntensity:.5});
function desk(x, z, dept, dual){
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  mesh(box(2.0, .07, 1.0), deskM, g, 0, .74, 0);
  for (const s of [-1, 1]){ mesh(box(.05, .72, .05), legM, g, .92 * s, .36, .42); mesh(box(.05, .72, .05), legM, g, .92 * s, .36, -.42); }
  if (dual){ for (const s of [-.5, .5]){ mesh(box(.9, .5, .04), mat(0x111417), g, s, 1.12, .2).rotation.y = -s * .25; mesh(box(.06, .3, .06), mat(0x6b7280), g, s, .9, .25); } }
  else { mesh(box(.62, .03, .42), lapM, g, 0, .8, -.05); const lid = mesh(box(.62, .42, .025), lidM, g, 0, 1.0, .17); lid.rotation.x = -.18; mesh(new THREE.CircleGeometry(.05, 16), glowM, lid, 0, 0, .014); }
  mesh(cyl(.06, .05, .13, 14), mat(pick([0xffffff, 0x17363c, 0xc9560f])), g, .75, .84, -.15);
  mesh(new THREE.SphereGeometry(.07, 10, 8), H.lampM || mat(0xfff3d6), g, -.76, 1.05, .3); mesh(cyl(.015, .015, .3, 6), legM, g, -.76, .9, .3);
  if (Math.random() < .6) mesh(box(.22, .02, .3), mat(0xf3ece4), g, -.5, .78, -.2);
  chair(x, z - 1.05);
  block(x - .95, z - .5, x + .95, z + .5, .2);
  return {x, z:z - .95, face:0};
}
H.desks = {sales:[], creative:[], production:[], growth:[]};
H.desks.sales.push(desk(-12.4, 4.2, 'sales'), desk(-9.2, 4.2, 'sales'));
H.desks.creative.push(desk(-12.4, -6.4, 'creative'), desk(-9.2, -6.4, 'creative'));
H.desks.production.push(desk(-3.2, -6.6, 'production', true), desk(0.2, -6.6, 'production', true), desk(3.6, -6.6, 'production', true));
H.desks.growth.push(desk(12.4, 4.4, 'growth', true));
/* creative mood wall: pinned cards */
for (let i = 0; i < 8; i++) mesh(box(.02, .35, .28), mat(pick([0xffffff, 0xfbf6f2, 0xf37021, 0xece3da])), scene, -FW / 2 + .12, 1.4 + (i % 2) * .5, -9.2 + Math.floor(i / 2) * .45).rotation.x = rand(-.08, .08);

/* Ace office (glass corner) */
mesh(box(4.8, .03, 4.8), mat(0xf6efe7), scene, 12.6, .01, -8.6);
H.neonDesk = desk(12.8, -8.9, 'exec', true);
plant(14.3, -10.3, .9, 2);
/* open meeting table (walnut) */
mesh(box(3.2, .08, 1.5), mat(0x6b4a2e, {roughness:.5}), scene, 12.0, .76, -2.2);
for (const x of [10.8, 13.2]) mesh(box(.12, .72, 1.2), legM, scene, x, .36, -2.2);
block(10.3, -3.0, 13.7, -1.4, .15);
H.meetChairs = [];
for (const x of [11.3, 12.4, 13.5]){ H.meetChairs.push({x, z:-3.5, face:0}, {x, z:-.9, face:Math.PI}); }
H.meetChairs.push({x:10.0, z:-2.2, face:Math.PI / 2}, {x:14.3, z:-2.2, face:-Math.PI / 2});
H.meetChairs.forEach(c => chair(c.x - Math.sin(c.face) * .1, c.z - Math.cos(c.face) * .1, c.face, 0xc9560f));
H.drawScreen('meet', g => { g.fillStyle = '#f37021'; g.font = font(700, 30, 1); g.fillText('會議桌', 30, 60); g.fillStyle = '#9aa1ad'; g.font = font(500, 22); g.fillText('目前沒有排定的會議', 30, 106); });

/* AI 數字人 capture stage (production) */
const STG = {x:7.0, z:-8.2};
mesh(box(3.2, .12, 2.6), mat(0x1c1f22), scene, STG.x, .06, STG.z);
mesh(box(.08, 2.9, 3.2), mat(0x2fb36b, {roughness:.9}), scene, STG.x + 1.7, 1.45, STG.z); // green screen
const ringM = new THREE.MeshStandardMaterial({color:0xfff3d6, emissive:0xffe9b0, emissiveIntensity:.5});
mesh(new THREE.TorusGeometry(.4, .05, 10, 40), ringM, scene, STG.x - 1.3, 1.7, STG.z - .3).rotation.y = Math.PI / 2 + .35;
mesh(cyl(.03, .03, 1.6, 8), legM, scene, STG.x - 1.3, .8, STG.z - .3);
const camRig = new THREE.Group(); camRig.position.set(STG.x - 1.4, 0, STG.z + .8); camRig.rotation.y = -Math.PI / 2 + .3; scene.add(camRig);
for (const [x, z] of [[-.25, .15], [.25, .15], [0, -.28]]) mesh(cyl(.02, .02, 1.3, 6), legM, camRig, x, .65, z).rotation.set(z * .5, 0, -x * .4);
mesh(box(.3, .22, .4), mat(0x111417), camRig, 0, 1.4, 0); mesh(cyl(.07, .09, .25, 14), mat(0x111417), camRig, 0, 1.4, .3).rotation.x = Math.PI / 2;
mesh(new THREE.SphereGeometry(.03, 8, 8), new THREE.MeshStandardMaterial({color:0xff2222, emissive:0xff0000, emissiveIntensity:1}), camRig, .1, 1.53, -.15);
block(STG.x - 1.7, STG.z - 1.4, STG.x + 1.8, STG.z + 1.4, .2);
H.stageSpot = {x:STG.x + .3, z:STG.z, face:-Math.PI / 2 + .3};
H.studioLive = on => { ringM.emissiveIntensity = on ? 2.4 : .5; };

/* chill zone: kitchen island with food, bar stools, lounge sofas, rug, record player */

const island = new THREE.Group(); island.position.set(2.0, 0, 1.6); proc.add(island);
mesh(box(4.6, .9, 1.1), mat(0x17363c, {roughness:.6}), island, 0, .45, 0); mesh(box(4.8, .07, 1.3), mat(0xf6f1ea, {roughness:.3}), island, 0, .94, 0);
mesh(box(.5, .2, .4), mat(0x9c6b3f), island, -1.8, 1.07, 0); mesh(box(.46, .05, .36), mat(0xe9c9a8), island, -1.8, 1.2, 0); // bread board
[[-.9, 0xe0453a], [-.7, 0xf1c232], [-1.1, 0x8bc34a]].forEach(([x, c]) => mesh(new THREE.SphereGeometry(.09, 10, 8), mat(c), island, x, 1.08, -.15)); // fruit
mesh(cyl(.33, .33, .04, 24), mat(0xffffff), island, -.9, 1.0, -.1); // fruit bowl
mesh(cyl(.3, .3, .05, 24), mat(0xe8b878), island, .2, 1.0, .1); mesh(cyl(.28, .28, .03, 24), mat(0xd94c3a), island, .2, 1.04, .1); for (let i = 0; i < 6; i++) mesh(new THREE.SphereGeometry(.03, 6, 6), mat(0xfff1c2), island, .2 + Math.cos(i) * .16, 1.07, .1 + Math.sin(i) * .16); // pizza
for (let i = 0; i < 4; i++) mesh(new THREE.TorusGeometry(.08, .035, 8, 16), mat(pick([0xf2a3c7, 0x7a4b2a, 0xf7e2a5])), island, 1.0 + i * .22, 1.0, -.2).rotation.x = Math.PI / 2; // donuts
mesh(box(.42, .5, .4), mat(0x111417), island, 1.9, 1.2, -.2); mesh(cyl(.05, .05, .08, 10), mat(0xffffff), island, 1.9, 1.0, .05); // espresso machine
for (const x of [1.4, 2.0, 2.6, 3.2]) for (const z of [.9, 2.3]) mesh(cyl(.06, .06, .14, 12), mat(x % 1 ? 0xffffff : 0x17363c), island, x - 2.0, 1.04, z - 1.6);
for (const x of [.6, 1.7, 2.8, 3.9]){ mesh(cyl(.26, .26, .08, 18), mat(0xc9560f), proc, x - .3, .78, 2.9); mesh(cyl(.03, .03, .74, 8), legM, proc, x - .3, .37, 2.9); mesh(cyl(.2, .2, .03, 18), legM, proc, x - .3, .02, 2.9); }
block(-.5, .9, 4.5, 3.2, .2);
plant(8.6, 1.2, 1.1, 2); plant(-5.6, 9.8, 1.0, 0); plant(-5.8, -10.0, .9, 1); plant(9.6, -10.2, 1.0, 2); plant(-14.2, 10.2, 1.1, 0); plant(14.4, 10.3, 1.0, 1); plant(4.6, -1.4, .8, 0);
/* client lounge in sales zone + reception at the entrance */
mesh(cyl(.5, .5, .05, 28), mat(0xf6f1ea), proc, -8.0, .44, 8.6); mesh(cyl(.06, .06, .42, 10), legM, proc, -8.0, .21, 8.6);
for (const [x, z, r] of [[-9.3, 8.6, Math.PI / 2], [-6.7, 8.6, -Math.PI / 2]]){ const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; proc.add(g); mesh(box(.8, .4, .8), mat(0xc9a27a), g, 0, .3, 0); mesh(box(.8, .5, .2), mat(0xc9a27a), g, 0, .7, -.3); }
block(-9.8, 8.1, -6.2, 9.1, .1);
const rc = new THREE.Group(); rc.position.set(-3.6, 0, 9.8); scene.add(rc);
mesh(box(2.6, 1.0, .7), mat(0x17363c, {roughness:.6}), rc, 0, .5, 0); mesh(box(2.7, .06, .8), mat(0xf6f1ea), rc, 0, 1.03, 0);
{ const c = canvasTex(256, 96, g => { g.clearRect(0, 0, 256, 96); g.fillStyle = '#f37021'; g.font = '700 54px Georgia,serif'; g.textBaseline = 'middle'; g.fillText('A.C.E.', 20, 48); g.fillStyle = '#fbf6f2'; g.font = '500 22px "Noto Sans TC",sans-serif'; g.fillText('LUXKEY', 170, 50); }); c.wrapS = c.wrapT = THREE.ClampToEdgeWrapping; c.repeat.set(1, 1); const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .8), new THREE.MeshStandardMaterial({map:c, transparent:true, emissive:0xffffff, emissiveMap:c, emissiveIntensity:.6})); p.position.set(0, .55, .36); rc.add(p); }
mesh(cyl(.16, .12, .3, 14), mat(0xffffff), rc, 1.0, 1.2, -.1); mesh(new THREE.SphereGeometry(.12, 10, 8), mat(0x3a7d44, {flatShading:true}), rc, 1.0, 1.45, -.1);
block(-5.0, 9.4, -2.2, 10.3, .2);

/* gathering spots */
H.ATRIUM = {x:0, z:-1.5};
H.allHands = [];
for (let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; H.allHands.push({x:H.ATRIUM.x + Math.cos(a) * 2.8, z:H.ATRIUM.z + Math.sin(a) * 1.4, face:Math.atan2(-Math.cos(a), -Math.sin(a))}); }
H.breakSpots = [{x:.3, z:3.6, face:0}, {x:1.4, z:3.6, face:0}, {x:2.5, z:3.6, face:0}, {x:3.6, z:3.6, face:0}, {x:7, z:5.8, face:-Math.PI / 2, sit:true}, {x:7, z:8.3, face:-Math.PI / 2, sit:true}, {x:-1, z:6.5, face:Math.PI / 2, sit:true}].map(s => Object.assign(s, {taken:null}));
H.clientSpots = [{x:-8.0, z:7.5, face:Math.PI}];

H.updateWorld = (dt, t) => {};
})();
