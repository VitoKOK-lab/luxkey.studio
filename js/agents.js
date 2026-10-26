/* 飛輪 HQ — characters, movement, poses, speech bubbles */
(() => {
const H = HQ, {mat, mesh, box, scene} = H;
const G = {
  leg:new THREE.CapsuleGeometry(.1, .32, 4, 8), torso:new THREE.CapsuleGeometry(.33, .3, 6, 16), arm:new THREE.CapsuleGeometry(.09, .28, 4, 8),
  hand:new THREE.SphereGeometry(.1, 12, 10), head:new THREE.SphereGeometry(.44, 28, 20), eye:new THREE.SphereGeometry(.075, 14, 10),
  hl:new THREE.SphereGeometry(.024, 8, 8), cheek:new THREE.SphereGeometry(.06, 12, 8), ear:new THREE.SphereGeometry(.08, 12, 10),
  smile:new THREE.TorusGeometry(.06, .014, 6, 16, Math.PI), cap:new THREE.SphereGeometry(.47, 28, 14, 0, Math.PI * 2, 0, Math.PI * .5),
  bob:new THREE.SphereGeometry(.5, 28, 14, 0, Math.PI * 2, 0, Math.PI * .72), spike:new THREE.ConeGeometry(.12, .34, 6),
  curl:new THREE.SphereGeometry(.15, 10, 8), bun:new THREE.SphereGeometry(.19, 14, 10), brim:box(.5, .04, .32),
  band:new THREE.TorusGeometry(.5, .045, 8, 24, Math.PI), earcup:new THREE.CylinderGeometry(.14, .14, .12, 16),
  mug:new THREE.CylinderGeometry(.08, .065, .16, 12), crate:box(.5, .4, .45),
};
const eyeM = mat(0x111111, {roughness:.25}), hlM = new THREE.MeshBasicMaterial({color:0xffffff});
const cheekM = mat(0xf28b8b, {transparent:true, opacity:.55}), mouthM = mat(0x5a2a1a), pantsM = mat(0x2b3240), phoneM = mat(0x1f2430);

function makeChar(o){
  const g = new THREE.Group(), skin = mat(o.skin), shirt = mat(o.shirt), hair = mat(o.hair, {roughness:.9});
  const legs = [], arms = [];
  for (const s of [-1, 1]){ const p = new THREE.Group(); p.position.set(.15 * s, .66, 0); g.add(p); mesh(G.leg, pantsM, p, 0, -.25, 0); legs.push(p); }
  mesh(G.torso, shirt, g, 0, 1.0, 0);
  for (const s of [-1, 1]){ const p = new THREE.Group(); p.position.set(.4 * s, 1.2, 0); g.add(p); mesh(G.arm, shirt, p, 0, -.2, 0); mesh(G.hand, skin, p, 0, -.42, 0); arms.push(p); }
  const hold = new THREE.Group(); hold.position.set(0, 1.0, .5); g.add(hold);
  const head = new THREE.Group(); head.position.y = 1.7; g.add(head);
  mesh(G.head, skin, head).scale.set(1.05, .96, 1);
  for (const s of [-1, 1]){
    mesh(G.eye, eyeM, head, .15 * s, 0, .4).scale.z = .55;
    mesh(G.hl, hlM, head, .15 * s + .025, .03, .44);
    const ch = mesh(G.cheek, cheekM, head, .26 * s, -.11, .35); ch.scale.z = .3; ch.castShadow = false;
    mesh(G.ear, skin, head, .45 * s, 0, 0);
  }
  const mouth = mesh(G.smile, mouthM, head, 0, -.14, .41); mouth.rotation.z = Math.PI;
  const eyes = []; head.children.forEach(ch => { if (ch.geometry === G.eye) eyes.push(ch); });
  for (const s of [-1, 1]){ const b = mesh(box(.12, .022, .02), hair, head, .15 * s, .13, .42); b.rotation.z = s * .12; }
  const cap = (r = -.28, m = hair) => { mesh(G.cap, m, head, 0, .03, 0).rotation.x = r; };
  if (o.style === 'spiky'){ cap(); for (let i = 0; i < 9; i++){ const a = i / 9 * Math.PI * 2; mesh(G.spike, hair, head, Math.cos(a) * .24, .38, Math.sin(a) * .24 - .05).rotation.set(Math.sin(a) * .7, 0, -Math.cos(a) * .7); } }
  if (o.style === 'bob'){ cap(-.35); mesh(G.bob, hair, head, 0, -.02, -.07).rotation.x = -.95; }
  if (o.style === 'cap'){ cap(-.22, mat(o.capColor)); mesh(G.brim, mat(o.capColor), head, 0, .2, .42).rotation.x = .15; }
  if (o.style === 'bun'){ cap(-.3); mesh(G.bun, hair, head, 0, .5, -.15); }
  if (o.style === 'curly'){ cap(-.25); for (let i = 0; i < 18; i++){ const a = i / 18 * Math.PI * 4.6, t = .15 + (i / 18) * .75, r = .42 * Math.sin(t * 1.6 + .3); mesh(G.curl, hair, head, Math.cos(a) * r, .2 + Math.cos(t * 1.6) * .25, Math.sin(a) * r - .06); } }
  if (o.phones){ mesh(G.band, phoneM, head, 0, .03, 0); for (const s of [-1, 1]) mesh(G.earcup, phoneM, head, .48 * s, 0, 0).rotation.z = Math.PI / 2; }
  const ring = new THREE.Mesh(new THREE.RingGeometry(.55, .68, 40), new THREE.MeshBasicMaterial({color:0xc9560f, transparent:true, opacity:.9, side:THREE.DoubleSide, depthWrite:false}));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .03; ring.visible = false; g.add(ring);
  return {g, head, arms, legs, hold, mouth, eyes, ring};
}

/* status vocabulary */
H.ST = {
  working:['工作中', 'var(--good)'], call:['回覆客人', 'var(--call)'], idle:['待命', 'var(--idle)'], meeting:['開會中', 'var(--meet)'],
  deal:['成交！', 'var(--accent)'], walking:['移動中', 'var(--idle)'], home:['在家休息', '#94a3b8'], out:['外出放風', '#14b8a6'], commute:['通勤中', '#94a3b8'], break:['休息中', '#f59e0b'], live:['錄製中', 'var(--accent)'], assist:['支援', 'var(--call)'], ai:['AI 產出中', 'var(--meet)'],
};
const WORK = {sales:'回 LINE', creative:'寫腳本', production:'AI 製作中', growth:'交片上架'};
H.statusLabel = a => a.status === 'working' ? WORK[a.dept] : H.ST[a.status][0];
H.dur = ms => Math.max(450, ms / Math.max(1, Math.min(H.state.speed || 1, 6)));
H.metricText = a => a.dept === 'sales' ? a.stats.orders + ' 單' : a.dept === 'creative' ? (a.data ? a.stats.insights + ' 洞察' : a.stats.approved + ' 腳本') : a.dept === 'production' ? a.stats.videos + ' 支' : a.stats.delivered + ' 交付';

/* build agents */
const overlay = H.$('#overlay');
function domFor(a, label){
  const tag = document.createElement('div'); tag.className = 'tag'; tag.style.setProperty('--dc', a.isNeon ? 'var(--accent)' : H.DEPTS[a.dept].color);
  tag.innerHTML = '<i class="dot"></i><b></b><span class="num"></span>'; tag.querySelector('b').textContent = a.name;
  if (label) tag.querySelector('span').textContent = label;
  const bub = document.createElement('div'); bub.className = 'bubble'; bub.innerHTML = '<em></em><p></p>';
  overlay.append(bub, tag); a.tag = tag; a.bub = bub;
}
H.agents = []; H.pickables = [];
const used = {sales:0, creative:0, production:0, growth:0};
H.ROSTER.forEach((d, i) => {
  const c = makeChar(d.look);
  const home = H.desks[d.dept][used[d.dept]++];
  c.g.position.set(home.x, 0, home.z); c.g.rotation.y = home.face; scene.add(c.g);
  const a = Object.assign({}, d, {stats:Object.assign({}, d.stats), i, c, home, status:'working', statusUntil:0, path:[], dest:null, onArrive:null,
    rotGoal:home.face, pose:'sit', activity:'desk', lastSay:0, phase:Math.random() * 6, quote:'', last:'上線待命', tasks:[], assist:false, carry:null, cup:null, blinkAt:performance.now() + Math.random() * 4000, talkUntil:0});
  a.tasks = [0, 1].map(() => ({text:H.fillTask(a.dept), until:H.state.simMin + H.rand(20, 90), auto:true}));
  c.g.traverse(o => { if (o.isMesh){ H.pickables.push(o); o.userData.agent = i; } });
  domFor(a); a.tag.addEventListener('click', () => H.openCard(i));
  H.agents.push(a);
});
H.agentsBy = dept => H.agents.filter(a => a.dept === dept);
H.findAgent = n => H.agents.find(a => a.name.toLowerCase() === String(n || '').trim().toLowerCase());

/* Neon: AI head of the company */
const ng = new THREE.Group(), nHead = new THREE.Group();
const nEye = new THREE.MeshStandardMaterial({color:0xffa060, emissive:0xf37021, emissiveIntensity:1.2});
mesh(new THREE.CapsuleGeometry(.34, .32, 6, 16), mat(0x17363c, {roughness:.35}), ng, 0, 1.0, 0);
nHead.position.y = 1.72; ng.add(nHead);
mesh(new THREE.SphereGeometry(.46, 32, 24), mat(0xffffff, {roughness:.3}), nHead);
mesh(new THREE.SphereGeometry(.4, 32, 24, -Math.PI * .38, Math.PI * .76, Math.PI * .3, Math.PI * .38), mat(0x111318, {roughness:.2, side:THREE.DoubleSide}), nHead, 0, 0, .07);
for (const s of [-1, 1]) mesh(new THREE.CapsuleGeometry(.04, .09, 4, 8), nEye, nHead, .13 * s, .03, .45);
mesh(new THREE.CylinderGeometry(.02, .02, .25, 8), mat(0xd1d5db), nHead, 0, .55, 0);
mesh(new THREE.SphereGeometry(.07, 16, 12), nEye, nHead, 0, .7, 0);
mesh(new THREE.TorusGeometry(.36, .04, 8, 32), new THREE.MeshStandardMaterial({color:0xf37021, emissive:0xf37021, emissiveIntensity:.8}), ng, 0, 1.25, 0).rotation.x = Math.PI / 2;
{ const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#f37021'; g.font = '700 50px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♠', 32, 36); const t = new THREE.CanvasTexture(c); const p = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({map:t, transparent:true})); p.position.set(0, 1.05, .35); ng.add(p); }
const nHome = {x:H.neonDesk.x, z:H.neonDesk.z, face:0};
ng.position.set(nHome.x, 0, nHome.z); scene.add(ng);
H.neon = {isNeon:true, name:H.BRAND.ai, dept:'exec', c:{g:ng, head:nHead}, home:nHome, path:[], rotGoal:0, status:'working', lastSay:0, eye:nEye};
domFor(H.neon, H.BRAND.aiTitle); H.neon.tag.classList.add('neon');
H.neon.tag.addEventListener('click', () => H.openChat());
ng.traverse(o => { if (o.isMesh){ H.pickables.push(o); o.userData.agent = 'neon'; } });

/* actions */
H.goTo = (a, spot, cb) => {
  const p = a.c.g.position;
  if (!a.isNeon) a.gy = 0; // this planner only handles the office floor
  a.path = H.findPath(p.x, p.z, spot.x, spot.z); a.dest = spot; a.onArrive = cb || null;
  if (!a.isNeon){ a.pose = 'stand'; a.status = 'walking'; a.statusUntil = 0; }
};
H.goHome = (a, cb) => H.goTo(a, a.home, () => { a.pose = 'sit'; a.activity = 'desk'; H.setStatus(a, a.assist ? 'assist' : 'working'); cb && cb(); });
H.baseStatus = a => ({desk:a.assist ? 'assist' : 'working', break:'break', meeting:'meeting', live:'live', home:'home', out:'out', commute:'commute'})[a.activity] || 'working';
H.setStatus = (a, s, ms) => { if (H.silent) return; a.status = s; a.statusUntil = ms ? performance.now() + H.dur(ms) : 0; if (H.selected === a.i) H.renderCard && H.renderCard(); };
H.say = (a, text, title = '', ms = 4500, force = false) => {
  if (H.silent) return;
  const now = performance.now();
  if (!force && now - a.lastSay < 2200) return;
  a.lastSay = now;
  const b = a.bub; b.querySelector('em').textContent = title; b.querySelector('em').hidden = !title;
  b.querySelector('p').textContent = text; b.classList.add('show');
  a.talkUntil = now + Math.min(ms, 2600);
  clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), ms);
};
H.setHighlight = (a, on, sel) => { if (!a || !a.c.ring) return; a.c.ring.visible = !!on; a.c.ring.material.color.setHex(sel ? 0xc9560f : 0x17363c); a.c.ring.material.opacity = sel ? .95 : .5; };
H.setCup = (a, on) => { if (on && !a.cup){ a.cup = mesh(G.mug, mat(H.pick([0xffffff, 0xff5a1f, 0x1f2430])), a.c.hold, .28, .05, -.15); } if (!on && a.cup){ a.c.hold.remove(a.cup); a.cup = null; } };
H.setCarry = (a, on) => { if (on && !a.carry){ a.carry = mesh(G.crate, mat(0xc89b63), a.c.hold, 0, .05, 0); } if (!on && a.carry){ a.c.hold.remove(a.carry); a.carry = null; } };

/* per-frame update */
H.updateAgents = (dt, t, now) => {
  const S = H.state, moving = S.speed > 0, spd = 3.1 * Math.min(2.2, Math.max(1, Math.sqrt(S.speed || 1)));
  for (const a of [...H.agents, H.neon]){
    const g = a.c.g;
    if (!a.isNeon && a.statusUntil && now > a.statusUntil){ a.statusUntil = 0; a.status = H.baseStatus(a); if (H.selected === a.i) H.renderCard(); }
    let walking = false;
    if (a.path.length && moving){
      walking = true;
      const p = a.path[0], dx = p.x - g.position.x, dz = p.z - g.position.z, d = Math.hypot(dx, dz), step = dt * spd;
      const ty = p.y === undefined ? 0 : p.y; /* ground height: bridges and other islands */
      if (d <= step){ g.position.x = p.x; g.position.z = p.z; a.gy = ty; a.path.shift(); }
      else { a.gy = (a.gy || 0) + (ty - (a.gy || 0)) * step / d; g.position.x += dx / d * step; g.position.z += dz / d * step; a.rotGoal = Math.atan2(dx, dz); }
      if (!a.path.length){ walking = false; if (a.dest && a.dest.face !== undefined) a.rotGoal = a.dest.face; const cb = a.onArrive; a.onArrive = null; cb && cb(); }
    }
    let da = a.rotGoal - g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); g.rotation.y += da * Math.min(1, dt * 10);
    const ph = t * 10 + (a.phase || 0);
    if (a.isNeon){
      g.position.y = (H.reduced ? 0 : Math.sin(t * 1.5) * .06) + (a.path.length ? .15 : 0);
      a.c.head.rotation.y = a.path.length ? 0 : Math.sin(t * .4) * .5;
      a.eye.emissiveIntensity = 1 + Math.sin(t * 3) * .4;
      continue;
    }
    const {head, arms, legs} = a.c;
    const sitting = a.pose === 'sit' && !a.path.length;
    if (a.rig){ H.updateRig(a, dt, t, walking, sitting); if (a.c.ring.visible) a.c.ring.rotation.z = t * .8; continue; }
    g.position.y = (a.gy || 0) + (walking ? Math.abs(Math.sin(ph)) * .07 - .13 : sitting ? (a.status === 'deal' && !H.reduced ? Math.abs(Math.sin(t * 9)) * .25 : 0) : -.13);
    legs.forEach((l, j) => l.rotation.x = walking ? Math.sin(ph + j * Math.PI) * .6 : sitting ? -1.45 : 0);
    if (a.carry){ arms.forEach(r => r.rotation.set(-1.35, 0, 0)); }
    else if (walking){ arms.forEach((r, j) => r.rotation.set(Math.sin(ph + j * Math.PI + Math.PI) * .5, 0, 0)); }
    else if (a.status === 'deal'){ arms.forEach((r, j) => r.rotation.set(-2.9, 0, j ? .25 : -.25)); }
    else if (a.status === 'call' && sitting){ arms[0].rotation.set(-1.1, 0, 0); arms[1].rotation.set(-2.5, 0, -.55); }
    else if (a.status === 'live'){ const w = Math.sin(t * 2.2 + a.phase) * .3; arms[0].rotation.set(-1.6 + w, 0, .3); arms[1].rotation.set(-2.6, 0, -.5); }
    else if (a.cup){ arms[0].rotation.set(Math.sin(t * .8 + a.phase) * .05, 0, 0); arms[1].rotation.set(-1.25 + (Math.sin(t * .5 + a.phase) > .85 ? -.6 : 0), 0, 0); }
    else if (a.status === 'meeting'){ arms.forEach(r => r.rotation.set(sitting ? -.9 : 0, 0, 0)); }
    else if (sitting){ arms.forEach((r, j) => r.rotation.set(-1.15 + (H.reduced || !['working', 'assist', 'ai'].includes(a.status) ? 0 : Math.sin(t * 14 + a.phase + j * 2) * .07), 0, 0)); }
    else arms.forEach((r, j) => r.rotation.set(Math.sin(t * 1.2 + a.phase + j) * .04, 0, 0));
    const np = H.neon.c.g.position, ddx = np.x - g.position.x, ddz = np.z - g.position.z, nd = Math.hypot(ddx, ddz);
    if (nd < 3.2 && H.neon.path.length === 0 && !walking){ let ang = Math.atan2(ddx, ddz) - g.rotation.y; ang = Math.atan2(Math.sin(ang), Math.cos(ang)); head.rotation.y += (H.clamp(ang, -.9, .9) - head.rotation.y) * Math.min(1, dt * 6); }
    else head.rotation.y = H.reduced ? 0 : Math.sin(t * .6 + a.phase) * .18;
    head.rotation.x = sitting && a.status === 'working' && !H.reduced ? .1 + Math.sin(t * 1.3 + a.phase) * .04 : 0;
    if (now > a.blinkAt){ a.c.eyes.forEach(e => e.scale.y = .12); if (now > a.blinkAt + 110){ a.c.eyes.forEach(e => e.scale.y = 1); a.blinkAt = now + 2200 + Math.random() * 4200; } }
    const talking = now < a.talkUntil; a.c.mouth.scale.set(talking ? 1 + Math.sin(t * 22) * .35 : 1, talking ? 1.4 + Math.sin(t * 22) * .6 : 1, 1);
    if (a.c.ring.visible) a.c.ring.rotation.z = t * .8;
  }
};
})();
