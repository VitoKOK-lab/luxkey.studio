/* 島上生活：動物、居民、UFO 公車載牛、員工下班回家／沒案子去娛樂島 */
(() => {
const H = HQ, S = H.state, {scene} = H, PI = Math.PI, K = H.SKY, {flat} = K, ISL = H.ISL;
const R = ISL.res, F = ISL.fun, FA = ISL.farm, PA = ISL.pasture;
const V3 = THREE.Vector3, box = (w, h, d) => new THREE.BoxGeometry(w, h, d), {rand, pick, chance} = H;
const mk = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
const local = (I, p) => ({x:p.x - I.c[0], z:p.z - I.c[2]});
const pace = () => S.speed > 0 ? Math.min(2.2, Math.max(1, Math.sqrt(S.speed))) : 0;
/* walk on an island: around the plaza ring so nobody cuts through the fountain */
const RING = {res:5, fun:3, farm:3, pasture:3};
function isleRoute(I, from, to){ const a0 = Math.atan2(from.z, from.x / 1.15), a1 = Math.atan2(to.z, to.x / 1.15); return [...H.ISL_ringPts(I, a0, a1, RING[I.key]), I.W(to.x, to.z)]; }
const TENNIS_IN = s => [F.W(5.6, 0), F.W(5.6, 3.9 * s), F.W(8.5, 3.9 * s)];

/* ---------- animals ---------- */
function spotTex(){ const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f7f4ee'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#1d1a18'; for (let i = 0; i < 7; i++){ g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 10 + Math.random() * 16, 8 + Math.random() * 12, Math.random() * 3, 0, PI * 2); g.fill(); } const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }
const pinkM = flat('#f2a7a0'), blackM = flat('#24201d'), hornM = flat('#efe6d2');
function legs(g, m, w, l, h, x, z){ const out = []; for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){ const p = new THREE.Group(); p.position.set(x * sx, h, z * sz); g.add(p); mk(box(w, h, w), m, p, 0, -h / 2, 0); out.push(p); } return out; }
const BUILD = {
  cow(){ const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({map:spotTex(), roughness:.9}); mk(box(.72, .72, 1.5), m, g, 0, .95, 0); const hd = new THREE.Group(); hd.position.set(0, 1.25, .85); g.add(hd); mk(box(.48, .5, .52), m, hd); mk(box(.42, .24, .14), pinkM, hd, 0, -.12, .3); for (const s of [-1, 1]){ mk(new THREE.ConeGeometry(.05, .2, 5), hornM, hd, .18 * s, .32, 0); mk(box(.2, .08, .1), m, hd, .32 * s, .12, -.05); } mk(box(.26, .12, .26), pinkM, g, 0, .56, -.25); mk(box(.06, .5, .06), m, g, 0, .9, -.78).rotation.x = .3; return {g, head:hd, legs:legs(g, m, .17, 0, .6, .24, .55), spd:.8}; },
  sheep(){ const g = new THREE.Group(), w = flat('#f4f1ea'); const b = mk(new THREE.DodecahedronGeometry(.5, 0), w, g, 0, .78, 0); b.scale.set(.95, .85, 1.25); const hd = new THREE.Group(); hd.position.set(0, .92, .6); g.add(hd); mk(box(.3, .32, .36), blackM, hd); mk(new THREE.DodecahedronGeometry(.17, 0), w, hd, 0, .18, -.02); for (const s of [-1, 1]) mk(box(.16, .06, .08), blackM, hd, .2 * s, .05, -.05); return {g, head:hd, legs:legs(g, blackM, .1, 0, .45, .2, .32), spd:.7}; },
  pig(){ const g = new THREE.Group(), m = flat('#f0a3a8'); mk(box(.6, .52, 1), m, g, 0, .56, 0); const hd = new THREE.Group(); hd.position.set(0, .66, .58); g.add(hd); mk(box(.44, .4, .32), m, hd); mk(new THREE.CylinderGeometry(.12, .12, .08, 10), flat('#e48892'), hd, 0, -.05, .2).rotation.x = PI / 2; for (const s of [-1, 1]) mk(box(.12, .12, .04), m, hd, .16 * s, .24, 0).rotation.z = .4 * s; return {g, head:hd, legs:legs(g, m, .12, 0, .32, .18, .32), spd:.6}; },
  chicken(){ const g = new THREE.Group(), w = flat('#fbfaf6'); mk(new THREE.SphereGeometry(.2, 8, 6), w, g, 0, .32, 0).scale.set(1, .9, 1.25); const hd = new THREE.Group(); hd.position.set(0, .5, .16); g.add(hd); mk(new THREE.SphereGeometry(.1, 8, 6), w, hd); mk(box(.03, .08, .1), flat('#e11d2a'), hd, 0, .1, 0); mk(new THREE.ConeGeometry(.035, .09, 5), flat('#f0a020'), hd, 0, 0, .11).rotation.x = PI / 2; return {g, head:hd, legs:legs(g, flat('#f0a020'), .03, 0, .16, .07, 0).slice(0, 2), spd:.9, peck:true}; },
  dog(){ const g = new THREE.Group(), m = flat('#b07a45'); mk(box(.34, .32, .72), m, g, 0, .5, 0); const hd = new THREE.Group(); hd.position.set(0, .72, .42); g.add(hd); mk(box(.3, .28, .3), m, hd); mk(box(.16, .12, .16), flat('#8a5a30'), hd, 0, -.06, .2); mk(box(.06, .06, .04), blackM, hd, 0, -.02, .29); for (const s of [-1, 1]) mk(box(.08, .16, .1), flat('#6b4424'), hd, .15 * s, .1, -.04); const tail = mk(box(.06, .06, .3), m, g, 0, .62, -.44); tail.rotation.x = -.6; return {g, head:hd, legs:legs(g, m, .09, 0, .34, .12, .26), spd:1.6, tail}; },
  cat(){ const g = new THREE.Group(), m = flat('#e08a3c'); mk(box(.24, .24, .55), m, g, 0, .36, 0); const hd = new THREE.Group(); hd.position.set(0, .52, .32); g.add(hd); mk(box(.24, .22, .22), m, hd); for (const s of [-1, 1]) mk(new THREE.ConeGeometry(.05, .1, 4), m, hd, .08 * s, .15, 0); const tail = mk(box(.05, .4, .05), m, g, 0, .58, -.28); tail.rotation.x = -.35; return {g, head:hd, legs:legs(g, m, .07, 0, .24, .08, .2), spd:1, tail}; },
  rabbit(){ const g = new THREE.Group(), w = flat('#f4f1ea'); mk(new THREE.SphereGeometry(.2, 8, 6), w, g, 0, .24, 0).scale.set(1, .9, 1.3); const hd = new THREE.Group(); hd.position.set(0, .4, .2); g.add(hd); mk(new THREE.SphereGeometry(.13, 8, 6), w, hd); for (const s of [-1, 1]) mk(box(.05, .26, .03), w, hd, .05 * s, .2, -.03); mk(new THREE.SphereGeometry(.03, 6, 4), pinkM, hd, 0, -.01, .13); return {g, head:hd, legs:[], spd:1.1, hop:true}; },
};
const MAIN = {key:'main', y:-.06, W:(x, z) => new V3(x, -.06, z)};
FA.zone = FA.zone || {x0:-7.5, x1:7.5, z0:-.6, z1:6.4}; PA.zone = PA.zone || {x0:-6, x1:6, z0:.6, z1:5.2};
const ZONES = {
  farm:FA.zone, pasture:PA.zone, lawnF:{x0:-9.5, x1:6.5, z0:11.8, z1:13.2}, lawnR:{x0:15.7, x1:17.5, z0:-8.5, z1:8.5},
  resYard:{x0:-3, x1:3, z0:-3.5, z1:-2.2}, funYard:{x0:-3.5, x1:-1, z0:-3, z1:3},
};
const animals = [];
function animal(kind, I, zone){
  const A = Object.assign(BUILD[kind](), {kind, I, zone, wait:rand(0, 4), tgt:null, busy:false, ph:Math.random() * 6});
  const z = ZONES[zone]; A.g.position.copy(I.W(rand(z.x0, z.x1), rand(z.z0, z.z1))); A.g.rotation.y = Math.random() * PI * 2; scene.add(A.g); animals.push(A); return A;
}
for (let i = 0; i < 3; i++) animal('cow', FA, 'farm'); for (let i = 0; i < 2; i++) animal('cow', PA, 'pasture');
for (let i = 0; i < 2; i++){ animal('sheep', FA, 'farm'); animal('sheep', PA, 'pasture'); }
for (let i = 0; i < 3; i++) animal('chicken', FA, 'farm'); animal('pig', FA, 'farm');
animal('dog', MAIN, 'lawnF'); animal('rabbit', MAIN, 'lawnF'); animal('cat', MAIN, 'lawnR'); animal('chicken', MAIN, 'lawnR'); animal('chicken', MAIN, 'lawnR');
const pup = animal('dog', R, 'resYard');
function animalTick(A, dt, t){
  const g = A.g; if (A.busy) return;
  let moving = false;
  if (A.follow){ /* 陳伯的狗：跟在主人後面 */
    const o = A.follow.g.position, want = new V3(o.x - Math.sin(A.follow.g.rotation.y) * 1.1 + .5, o.y, o.z - Math.cos(A.follow.g.rotation.y) * 1.1);
    if (!A.follow.g.visible) want.copy(A.follow.door).add(new V3(.6, 0, .4));
    const d = Math.hypot(want.x - g.position.x, want.z - g.position.z); if (d > .35) A.tgt = want; else A.tgt = null, A.wait = .5;
  } else if (!A.tgt && (A.wait -= dt) <= 0){ const z = ZONES[A.zone]; A.tgt = A.I.W(rand(z.x0, z.x1), rand(z.z0, z.z1)); }
  if (A.tgt && dt > 0){
    const dx = A.tgt.x - g.position.x, dz = A.tgt.z - g.position.z, d = Math.hypot(dx, dz), step = dt * A.spd * (A.follow && d > 2 ? 1.6 : 1);
    if (d <= step){ g.position.x = A.tgt.x; g.position.z = A.tgt.z; A.tgt = null; A.wait = rand(1.5, 6); }
    else { g.position.x += dx / d * step; g.position.z += dz / d * step; let da = Math.atan2(dx, dz) - g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); g.rotation.y += da * Math.min(1, dt * 5); moving = true; }
  }
  const ph = t * (A.hop ? 9 : 8) + A.ph;
  g.position.y = A.I.y + (A.hop && moving ? Math.abs(Math.sin(ph)) * .22 : 0);
  A.legs.forEach((l, j) => l.rotation.x = moving ? Math.sin(ph + (j === 1 || j === 2 ? PI : 0)) * .5 : 0);
  if (A.head) A.head.rotation.x = !moving && (A.peck ? Math.sin(t * 7 + A.ph) > .3 : A.kind === 'cow' || A.kind === 'sheep' ? Math.sin(t * .5 + A.ph) > .2 : false) ? .55 : 0;
  if (A.tail) A.tail.rotation.z = Math.sin(t * (A.kind === 'dog' ? 14 : 2) + A.ph) * .5;
}

/* ---------- residents ---------- */
const npcs = [];
H.extraTags = H.extraTags || [];
function npc(name, model, I, at, role){
  const n = {name, I, role, g:new THREE.Group(), path:[], onArrive:null, sit:false, swingUntil:0, wait:rand(1, 5), rig:null, spd:2.1, door:at.clone()};
  n.g.position.copy(at); scene.add(n.g); npcs.push(n);
  H.loadChar(model).then(gltf => {
    const root = gltf.scene; root.scale.setScalar(2.3);
    root.traverse(o => { if (o.isMesh){ o.castShadow = o.receiveShadow = true; o.frustumCulled = false; o.material = o.material.clone(); o.material.roughness = .8; o.material.envMapIntensity = .25; } });
    n.g.add(root); const mixer = new THREE.AnimationMixer(root), clips = {}; gltf.animations.forEach(c => { clips[c.name] = mixer.clipAction(H.groundCharClip(c)); });
    n.rig = {root, mixer, clips, cur:null}; clip(n, 'idle');
  }).catch(e => console.warn('resident failed', name, e));
  const el = document.createElement('div'); el.className = 'tag npc'; el.style.setProperty('--dc', '#94a3b8');
  el.innerHTML = '<i class="dot" style="background:#94a3b8"></i><b></b><span></span>'; el.querySelector('b').textContent = name; el.querySelector('span').textContent = role;
  H.$('#overlay').append(el); H.extraTags.push({el, o:n.g, dy:2.35});
  return n;
}
function clip(n, name){ const r = n.rig; if (!r || !r.clips[name] || r.cur === name) return; const next = r.clips[name].reset().setEffectiveWeight(1).setEffectiveTimeScale(name === 'walk' ? 1.1 : 1); next.play(); if (r.cur) r.clips[r.cur].crossFadeTo(next, .25, false); r.cur = name; }
const walkIsle = (n, to, face, cb) => { n.sit = false; n.g.visible = true; n.path = isleRoute(n.I, local(n.I, n.g.position), to); n.face = face; n.onArrive = cb; };
function npcTick(n, dt, now){
  if (n.path.length && dt > 0){
    const p = n.path[0], g = n.g, dx = p.x - g.position.x, dz = p.z - g.position.z, d = Math.hypot(dx, dz), step = dt * n.spd;
    if (d <= step){ g.position.set(p.x, p.y, p.z); n.path.shift(); if (!n.path.length){ if (n.face !== undefined) n.rotGoal = n.face; const cb = n.onArrive; n.onArrive = null; cb && cb(); } }
    else { g.position.y += (p.y - g.position.y) * step / d; g.position.x += dx / d * step; g.position.z += dz / d * step; n.rotGoal = Math.atan2(dx, dz); }
  } else if (!n.path.length && (n.wait -= dt) <= 0 && n.brain) n.brain(n);
  if (n.rotGoal !== undefined){ let da = n.rotGoal - n.g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); n.g.rotation.y += da * Math.min(1, dt * 8); }
  if (!n.rig) return;
  clip(n, n.path.length && dt > 0 ? 'walk' : n.swingUntil > now ? 'interact-right' : n.sit ? 'sit' : 'idle');
  n.rig.mixer.update(dt || 0);
  H.groundCharacter(n.rig.root, n.sit);
}
const freeBench = I => I.benches.filter(b => !b.taken);
function sitBench(n, I, then){ const b = pick(freeBench(I)); if (!b) return then(n); b.taken = n; walkIsle(n, local(I, b.p), b.face, () => { n.sit = true; n.wait = rand(10, 22); n.brain = m => { b.taken = null; m.sit = false; m.brain = then; then(m); }; }); }
const doorIn = (n, door, secs) => walkIsle(n, local(n.I, door), undefined, () => { n.g.visible = false; n.wait = secs; });
/* 住宅島：王阿姨、陳伯（帶狗散步） */
const auntie = npc('王阿姨', 'character-female-e', R, R.houses['王阿姨'].door, '鄰居');
const uncle = npc('陳伯', 'character-male-e', R, R.houses['陳伯'].door, '鄰居');
pup.follow = uncle;
const resBrain = n => {
  const r = Math.random(), other = pick(Object.values(R.houses).filter(h => h.door !== n.door));
  if (r < .35) sitBench(n, R, resBrain);
  else if (r < .55) walkIsle(n, {x:rand(-2.4, 2.4), z:rand(-2.6, -2)}, PI, () => { n.wait = rand(4, 9); });
  else if (r < .75) walkIsle(n, local(R, other.door), undefined, () => { n.wait = rand(3, 6); });
  else doorIn(n, n.door, rand(10, 20));
};
auntie.brain = uncle.brain = resBrain;
/* 娛樂島：阿傑教練守網球場，小美逛 7-11／電影院／健身房 */
const coach = npc('阿傑', 'character-male-f', F, F.court.A.p, '網球教練');
coach.g.rotation.y = coach.rotGoal = 0; coach.brain = n => { n.wait = rand(4, 8); if (!F.court.B.ready) n.swingUntil = performance.now() + 700; };
const mei = npc('小美', 'character-female-f', F, F.venues['711'].door, '居民');
const meiBrain = n => {
  const r = Math.random(), v = F.venues;
  if (r < .3) sitBench(n, F, meiBrain);
  else if (r < .5) doorIn(n, v['711'].door, rand(5, 9));
  else if (r < .7) doorIn(n, v.cinema.door, rand(14, 24));
  else if (r < .85) doorIn(n, v.gym.door, rand(10, 18));
  else walkIsle(n, {x:rand(-2, 2), z:rand(3.2, 4)}, 0, () => { n.wait = rand(3, 6); });
};
mei.brain = meiBrain;

/* ---------- tennis rally ---------- */
const sparring = npc('小夏', 'character-female-f', F, F.court.B.p, '固定陪打');
sparring.g.rotation.y=sparring.rotGoal=PI;sparring.c={g:sparring.g};
const rally = {t:0, dir:1, hits:0};
H.tennis={coach,sparring,rally,ball:F.ball};
function tennisTick(dt){
  const b = F.court.B, partner = b.ready && b.who || sparring, ball = F.ball;
  sparring.g.visible = partner === sparring;
  if (!partner || coach.path.length || !coach.rig || dt <= 0){ ball.visible = false; return; }
  const pa = coach.g.position, pb = partner.c.g.position, [from, to] = rally.dir > 0 ? [pa, pb] : [pb, pa];
  rally.t += dt / 1.15; const k = Math.min(1, rally.t);
  ball.visible = true; ball.position.set(from.x + (to.x - from.x) * k + .3, from.y + 1.1 + Math.sin(PI * k) * 2.3, from.z + (to.z - from.z) * k);
  if (k >= 1){ rally.t = 0; rally.dir *= -1; rally.hits++; const now = performance.now(); if (rally.dir < 0) partner.swingUntil = now + 520; else coach.swingUntil = now + 520; }
}

/* ---------- UFO 公車：牧場島 ⇄ 草原島 載牛，偶爾來辦公室 ---------- */
const ufo = new THREE.Group(); H.ufo = ufo;
{
  const hull = new THREE.Mesh(new THREE.SphereGeometry(2.2, 32, 14), new THREE.MeshStandardMaterial({color:0xcfd8de, metalness:.85, roughness:.22, envMapIntensity:1.2})); hull.scale.y = .26; ufo.add(hull);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.15, .09, 8, 40), flat('#17363c', {flatShading:false, metalness:.6, roughness:.3})); rim.rotation.x = PI / 2; ufo.add(rim);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, PI * 2, 0, PI / 2), new THREE.MeshStandardMaterial({color:0x8ff3ff, emissive:0x3fd9ff, emissiveIntensity:.6, transparent:true, opacity:.75, roughness:.05})); dome.position.y = .3; ufo.add(dome);
  const alien = new THREE.Mesh(new THREE.SphereGeometry(.32, 12, 8), flat('#7ddc6a', {flatShading:false})); alien.position.y = .62; ufo.add(alien);
  for (const s of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({color:0x111111})); eye.position.set(s * .12, .68, .27); ufo.add(eye); }
  const under = new THREE.Mesh(new THREE.CircleGeometry(.9, 24), new THREE.MeshBasicMaterial({color:0x9ffcff, toneMapped:false})); under.rotation.x = PI / 2; under.position.y = -.5; ufo.add(under);
  ufo.lights = [];
  for (let i = 0; i < 12; i++){ const a = i / 12 * PI * 2, l = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), new THREE.MeshBasicMaterial({color:0xffffff, toneMapped:false})); l.position.set(Math.cos(a) * 1.85, .05, Math.sin(a) * 1.85); ufo.add(l); ufo.lights.push(l); }
  ufo.traverse(o => { if (o.isMesh) o.castShadow = true; });
}
const beam = new THREE.Mesh(new THREE.CylinderGeometry(.8, 2.6, 1, 32, 1, true), new THREE.MeshBasicMaterial({color:0x9ff7ff, transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending, toneMapped:false}));
const ufoLight = new THREE.PointLight(0x8ff3ff, 0, 14, 2);
scene.add(ufo, beam, ufoLight);
const U = {mode:'cruise', t:0, until:12, from:new V3(), to:new V3(), clock:0, ground:0, cow:null, src:null, dst:null, drop:null, cowFrom:0};
const SPOTS = [[2, 5.2], [-8, 8.6], [-6, -4], [6, -4], [12.4, -6]];
const cruise = (c, out) => out.set(Math.cos(c * .16) * 42, 13 + Math.sin(c * .6) * 2.5, Math.sin(c * .12) * 36);
cruise(0, ufo.position);
const cowsOn = I => animals.filter(A => A.kind === 'cow' && A.I === I && !A.busy);
function startFlight(to, mode){ U.from.copy(ufo.position); U.to.copy(to); U.mode = mode; U.t = 0; U.dur = H.clamp(U.from.distanceTo(to) / 9, 2.5, 7); }
function nextJob(){
  const a = cowsOn(FA), b = cowsOn(PA);
  if (chance(.22) || !(a.length + b.length)){ const [x, z] = pick(SPOTS); U.ground = 0; U.job = 'visit'; startFlight(new V3(x, 7.2, z), 'fly'); return; }
  U.src = a.length > b.length || (a.length === b.length && chance(.5)) ? FA : PA; U.dst = U.src === FA ? PA : FA;
  U.cow = pick(cowsOn(U.src)); U.cow.busy = true; U.cow.tgt = null; U.job = 'pick'; U.ground = U.src.y;
  const p = U.cow.g.position; startFlight(new V3(p.x, U.src.y + 7.5, p.z), 'fly');
}
const ease = k => k * k * (3 - 2 * k);
function ufoTick(dt, t){
  const u = U; u.t += dt; u.clock += dt;
  const want = new V3(), cow = u.cow;
  let on = 0;
  if (u.mode === 'cruise'){
    cruise(u.clock, want); ufo.position.lerp(want, Math.min(1, dt * 1.5));
    if (u.t > u.until) nextJob();
  } else if (u.mode === 'fly'){ /* arc to the stop like a bus pulling in */
    const k = Math.min(1, u.t / u.dur); ufo.position.lerpVectors(u.from, u.to, ease(k)); ufo.position.y += Math.sin(k * PI) * 5;
    if (k >= 1){ u.t = 0; u.mode = u.job === 'visit' ? 'beam' : u.job === 'pick' ? 'lift' : 'lower'; if (u.job === 'visit') visit(); if (u.job === 'drop') u.cowFrom = ufo.position.y - .7; }
  } else if (u.mode === 'beam'){
    ufo.position.set(u.to.x + Math.sin(t * 1.3) * .25, u.to.y + Math.sin(t * 2) * .15, u.to.z + Math.cos(t * 1.1) * .25);
    on = Math.min(1, u.t * 1.5, (7 - u.t) * 1.5); if (u.t > 7) leave();
  } else if (u.mode === 'lift'){
    ufo.position.set(u.to.x, u.to.y + Math.sin(t * 2) * .1, u.to.z);
    on = Math.min(1, u.t * 2); const k = H.clamp((u.t - .6) / 3, 0, 1), e = ease(k), g = cow.g;
    g.position.set(g.position.x + (u.to.x - g.position.x) * Math.min(1, dt * 2), u.src.y + (u.to.y - .7 - u.src.y) * e, g.position.z + (u.to.z - g.position.z) * Math.min(1, dt * 2));
    g.rotation.y += dt * 2.2 * (k > 0 ? 1 : 0); g.rotation.z = Math.sin(t * 3) * .2 * k; cow.legs.forEach((l, j) => l.rotation.x = Math.sin(t * 9 + j) * .6 * k); g.scale.setScalar(1 - Math.max(0, k - .85) * 4);
    if (k >= 1){ g.visible = false; g.scale.setScalar(1); g.rotation.z = 0; const z = u.dst.zone; u.drop = u.dst.W(rand(z.x0, z.x1), rand(z.z0, z.z1)); u.job = 'drop'; u.ground = u.dst.y; startFlight(new V3(u.drop.x, u.dst.y + 7.5, u.drop.z), 'fly'); if (chance(.34)) H.log(`🛸 UFO 公車載走一頭牛：${u.src.name} → ${u.dst.name}`, null); }
  } else if (u.mode === 'lower'){
    ufo.position.set(u.to.x, u.to.y + Math.sin(t * 2) * .1, u.to.z);
    on = Math.min(1, u.t * 2, Math.max(0, 4.6 - u.t) * 2); const k = H.clamp((u.t - .5) / 3, 0, 1), e = ease(k), g = cow.g;
    g.visible = true; g.scale.setScalar(Math.min(1, .2 + k * 4)); g.position.set(u.drop.x, u.cowFrom + (u.dst.y - u.cowFrom) * e, u.drop.z); g.rotation.y += dt * 2 * (1 - k); cow.legs.forEach((l, j) => l.rotation.x = Math.sin(t * 9 + j) * .6 * (1 - k));
    if (u.t > 4.6){ cow.I = u.dst; cow.zone = u.dst.key; cow.busy = false; cow.wait = 2; g.scale.setScalar(1); u.cow = null; leave(); }
  } else { /* leave */
    const k = Math.min(1, u.t / 2.5); cruise(u.clock, want); ufo.position.lerpVectors(u.from, want, k * k); ufo.position.y += Math.sin(k * PI) * 6;
    if (k >= 1){ u.mode = 'cruise'; u.t = 0; u.until = 10 + Math.random() * 14; }
  }
  ufo.rotation.y += dt * (on ? 2.4 : 1.2);
  ufo.rotation.z = Math.sin(t * 1.7) * .08; ufo.rotation.x = Math.cos(t * 1.3) * .06;
  ufo.lights.forEach((l, i) => l.material.color.setHSL(((t * .35 + i / 12) % 1), 1, (Math.sin(t * 6 + i) > 0 ? .62 : .45)));
  beam.material.opacity = on * (.18 + Math.sin(t * 9) * .04); beam.visible = on > .01;
  const h = Math.max(.1, ufo.position.y - .4 - u.ground); beam.scale.set(1, h, 1); beam.position.set(ufo.position.x, u.ground + h / 2, ufo.position.z);
  ufoLight.position.set(ufo.position.x, ufo.position.y - 1, ufo.position.z); ufoLight.intensity = on * 2.2;
}
function leave(){ U.mode = 'leave'; U.t = 0; U.from.copy(ufo.position); }
H.callUfo = () => { if (U.mode === 'cruise') U.t = U.until + 1; };
H.ufoState = () => ({mode:U.mode, job:U.job, src:U.src && U.src.key, pos:ufo.position.toArray().map(v => +v.toFixed(1))});
const UFO_LINES = ['UFO？！外星品牌也要拍短影音？', '嗨～要不要 10 支起跳？', '快拍下來，這支會爆！', '他們在掃描我們的腳本…'];
function visit(){
  const near = H.agents.filter(a => !a.offMain).sort((a, b) => a.c.g.position.distanceTo(U.to) - b.c.g.position.distanceTo(U.to))[0];
  if (near) H.say(near, pick(UFO_LINES), '', 4200, true);
  H.log('🛸 UFO 造訪天空島，外星客戶在 A.C.E. 上空盤旋', 'growth');
}

/* ---------- 員工通勤：下班回住宅島，沒案子去娛樂島 ---------- */
const goTo0 = H.goTo;
const onFloor = p => Math.abs(p.x) <= 15 && Math.abs(p.z) <= 11;
function clearLife(a){
  const L = a.life; if (!L) return;
  if (L.kind === 'home') R.houses[a.name].home = false;
  if (L.bench) L.bench.taken = null;
  if (F.court.B.who === a){ F.court.B.who = null; F.court.B.ready = false; }
  a.life = null; a.swingUntil = 0; a.pose = 'stand'; H.setCup(a, false);
}
/* anything that calls an employee back (meeting, live, goHome) walks them back over the bridge first */
H.goTo = (a, spot, cb) => {
  if (a.isNeon || !a.offMain) return goTo0(a, spot, cb);
  const p = a.c.g.position, r = a.route;
  a.c.g.visible = true; clearLife(a);
  if (onFloor(p)) { a.offMain = false; a.route = null; a.gy = 0; return goTo0(a, spot, cb); }
  const I = r.island, bridge = [{x:I.exit.x, y:0, z:I.exit.z}, ...I.bridge];
  // Project onto a bridge segment, never jump to the nearest discrete waypoint.
  let nearest, distance = Infinity;
  for (let i = 0; i < bridge.length - 1; i++) {
    const a = bridge[i], b = bridge[i+1], dx = b.x-a.x, dz = b.z-a.z;
    const t = H.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz), 0, 1);
    const q = {x:a.x+dx*t, y:a.y+(b.y-a.y)*t, z:a.z+dz*t};
    const d = Math.hypot(p.x-q.x,p.z-q.z);
    if (d < distance) { distance = d; nearest = {q,i}; }
  }
  const back = distance < .8
    ? [nearest.q, ...bridge.slice(0, nearest.i+1).reverse()]
    : [...isleRoute(I, local(I,p), local(I,bridge[bridge.length-1])), ...bridge.slice().reverse()];
  a.path = [...back, ...H.findPath(I.exit.x, I.exit.z, spot.x, spot.z)];
  // Keep offMain and the island reference while returning: a second task may interrupt us.
  a.dest = spot; a.onArrive = () => { a.offMain = false; a.route = null; a.gy = 0; cb && cb(); };
  a.pose = 'stand'; a.status = 'walking'; a.statusUntil = 0;
};
const VENUE_TXT = {'711':'去 7-11 買咖啡', gym:'去健身房', cinema:'去看電影', tennis:'去娛樂島打網球'};
function goOff(a, kind, venue, instant){
  const I = kind === 'home' ? R : F, B = local(I, I.bridge[I.bridge.length - 1]);
  if (venue === 'tennis' && F.court.B.who) venue = '711';
  const L = a.life = {kind, venue, until:S.simMin + rand(30, 70)};
  let isle, face;
  if (kind === 'home') isle = isleRoute(I, B, local(I, R.houses[a.name].door));
  else if (venue === 'tennis'){ isle = [...isleRoute(I, B, {x:3.45, z:0}), ...TENNIS_IN(1)]; face = PI; F.court.B.who = a; }
  else isle = isleRoute(I, B, local(I, F.venues[venue].door));
  const route = [...I.bridge, ...isle].map(q => ({x:q.x, y:q.y, z:q.z})); route.exit = I.exit; route.island = I;
  if (instant){ const q = route[route.length - 1]; a.c.g.position.set(q.x, q.y, q.z); a.gy = q.y; a.path = []; }
  else { goTo0(a, I.exit); a.path.push(...route); }
  a.route = route; a.offMain = true; a.activity = 'commute'; a.dest = {face}; a.pose = 'stand';
  H.setStatus(a, 'commute');
  a.onArrive = () => arrive(a);
  if (instant) arrive(a);
  else if (!H.silent) H.log(kind === 'home' ? `${a.name} 下班，走吊橋回住宅島` : `${a.name} 沒案子，${VENUE_TXT[venue]}`, a.dept);
  return L;
}
function arrive(a){
  const L = a.life; if (a.activity !== 'commute' || !L) return;
  if (L.kind === 'home'){ a.activity = 'home'; a.c.g.visible = false; R.houses[a.name].home = true; H.setStatus(a, 'home'); return; }
  a.activity = 'out'; H.setStatus(a, 'out');
  if (L.venue === 'tennis'){ F.court.B.ready = true; a.rotGoal = PI; H.say(a, '阿傑教練，來一局！', '', 3200, true); return; }
  if (L.venue === 'gym') H.say(a, pick(['今天練腿 💪', '跑個 5 公里', '先熱身']), '', 2600, true);
  if (L.venue === 'cinema') H.say(a, '這部聽說很好看 🍿', '', 2600, true);
  L.inside = true; L.stageUntil = S.simMin + (L.venue === '711' ? rand(3, 6) : 1e9);
  setTimeout(() => { if (a.life === L && L.inside) a.c.g.visible = false; }, 600);
}
function out711(a, L){ /* 買完咖啡出來，找張長椅坐 */
  L.inside = false; a.c.g.visible = true; H.setCup(a, true);
  const b = freeBench(F)[0]; if (!b) return;
  b.taken = a; L.bench = b; a.path = isleRoute(F, local(F, a.c.g.position), local(F, b.p)).map(q => ({x:q.x, y:q.y, z:q.z})); a.dest = {face:b.face};
  a.onArrive = () => { if (a.life === L) a.pose = 'sit'; };
}
const hasWork = a => a.dept === 'sales' ? a.pending > 0 : a.dept === 'creative' ? !a.data && S.projects.some(p => p.stage === 'script' && !p.scriptBy)
  : a.dept === 'production' ? S.projects.some(p => p.stage === 'production') : S.projects.some(p => p.stage === 'qa');
function recall(a, why){ a.activity = 'returning'; H.goHome(a); if (why) H.log(why, a.dept); }
H.lifeTick = h => {
  const work = h >= 510 && h < 1170;
  for (const a of H.agents){
    const manual = a.tasks.some(t => !t.auto);
    if (a.offMain){
      const L = a.life; if (!L || a.activity === 'commute') continue;
      if (manual){ recall(a, `${a.name} 收到指派，趕回公司`); continue; }
      if (L.kind === 'home'){ if (work && chance(h < 540 ? .12 : .3)) recall(a, chance(.4) ? `${a.name} 出門上班` : null); continue; }
      if (L.inside && S.simMin >= L.stageUntil && L.venue === '711') out711(a, L);
      if (S.simMin >= L.until || (work && hasWork(a) && chance(.25))) recall(a, hasWork(a) ? `${a.name} 收到新案子，趕回公司` : `${a.name} 放風結束，回公司`);
      continue;
    }
    if (a.activity !== 'desk' || a.path.length || S.meeting || manual) continue;
    if (!work){ if (chance(.04)) goOff(a, 'home'); }
    else if (!hasWork(a) && chance(.012)) goOff(a, 'out', pick(['711', '711', 'gym', 'cinema', 'tennis', 'tennis']));
  }
};
/* opening the page at night: most of the team is already home */
addEventListener('load', () => { const h = S.simMin % 1440; if (h < 510 || h >= 1170) H.agents.forEach(a => { if (a.activity === 'desk' && chance(.75)) goOff(a, 'home', null, true); }); });

/* ---------- per-frame ---------- */
const prev = H.updateWorld;
H.updateWorld = (dt, t) => {
  prev && prev(dt, t);
  const k = pace(), dw = dt * k, now = performance.now();
  for (const A of animals) animalTick(A, dw, t);
  for (const n of npcs) npcTick(n, dw, now);
  tennisTick(dw);
  ufoTick(dw, t);
  const showUfo=!!H.cam&&H.cam.radius>=150;ufo.visible=showUfo;beam.visible=beam.visible&&showUfo;ufoLight.intensity*=showUfo?1:0;
};
})();
