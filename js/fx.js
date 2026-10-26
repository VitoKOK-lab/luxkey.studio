/* A.C.E. 擬真層：環境反射、接觸陰影、天花板燈、桌機螢幕、音效、導覽 */
(() => {
const H = HQ, {scene, renderer, mat, mesh, box} = H;

/* tone mapping + environment map (PMREM of a small lit room) */
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .76;
renderer.physicallyCorrectLights = false;
(() => {
  const room = new THREE.Scene(); room.background = new THREE.Color(0x5c6572);
  const em = (c, i) => new THREE.MeshBasicMaterial({color:c});
  const panel = (w, h, x, y, z, ry = 0, c = 0xffffff) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), em(c)); m.position.set(x, y, z); m.rotation.y = ry; room.add(m); return m; };
  panel(40, 40, 0, 20, 0, 0, 0x9aa2ad).rotation.x = Math.PI / 2;           // bright ceiling
  panel(40, 40, 0, -1, 0, 0, 0x4a4238).rotation.x = -Math.PI / 2;          // warm floor
  for (let i = -12; i <= 12; i += 8) panel(5, 1.2, i, 9, 0, 0, 0xffffff).rotation.x = Math.PI / 2; // light strips
  panel(40, 14, 0, 6, -20, 0, 0x6f7886); panel(40, 14, 0, 6, 20, Math.PI, 0x6f7886);
  panel(40, 14, -20, 6, 0, Math.PI / 2, 0x8a98a8); panel(40, 14, 20, 6, 0, -Math.PI / 2, 0x687080);
  const pm = new THREE.PMREMGenerator(renderer); pm.compileEquirectangularShader();
  scene.environment = pm.fromScene(room, .04).texture; pm.dispose();
})();
// give key materials a bit of envMap response
scene.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial && o.material.envMapIntensity === undefined) o.material.envMapIntensity = .35; });

/* contact shadows: soft radial blob under every character */
const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 8, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.42)'); r.addColorStop(.6, 'rgba(0,0,0,.14)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const blobM = new THREE.MeshBasicMaterial({map:blobTex, transparent:true, depthWrite:false});
const blobGeo = new THREE.PlaneGeometry(1.5, 1.5);
for (const a of [...H.agents, H.neon]){ const b = new THREE.Mesh(blobGeo, blobM); b.rotation.x = -Math.PI / 2; b.position.y = .02; b.renderOrder = 1; a.c.g.add(b); a.blob = b; }

/* ceiling: beams, pendant lamps (on at night), spotlights over studio and atrium */
const FW = 40, FD = 28;
const lampGlow = new THREE.MeshStandardMaterial({color:0xfff2d8, emissive:0xffe2a8, emissiveIntensity:0});
const cordM = mat(0x2a2f3a);
const pendants = [];
for (const x of [-11, -4, 3, 10]) for (const z of [-8, -2, 4, 9]){
  if (x === 10 && z < 0) continue;
  const bulb = mesh(new THREE.SphereGeometry(.06, 10, 8), lampGlow, scene, x, 3.55, z); bulb.castShadow = false; pendants.push(bulb);
}
const pt = new THREE.PointLight(0xffd9a0, 0, 26, 1.6); pt.position.set(0, 3.6, 0); scene.add(pt);
const pt2 = new THREE.PointLight(0xffd9a0, 0, 20, 1.6); pt2.position.set(-10, 3.6, 0); scene.add(pt2);
const pt3 = new THREE.PointLight(0xffd9a0, 0, 20, 1.6); pt3.position.set(11, 3.6, 2); scene.add(pt3);
const studioSpot = new THREE.SpotLight(0xffffff, 0, 14, .45, .6, 1.2); studioSpot.position.set(5.6, 5, -9.4); studioSpot.target.position.set(7.2, 0, -8.2); scene.add(studioSpot, studioSpot.target);
const atriumSpot = new THREE.SpotLight(0xffb27a, .45, 12, .55, .7, 1.2); atriumSpot.position.set(H.ATRIUM.x, 5.5, H.ATRIUM.z); atriumSpot.target.position.set(H.ATRIUM.x, 0, H.ATRIUM.z); scene.add(atriumSpot, atriumSpot.target);
const baseDay = H.setDaylight;
H.setDaylight = min => {
  baseDay(min); const n = 1 - H.daylight;
  lampGlow.emissiveIntensity = n * 2; pt.intensity = n * 1.6; pt2.intensity = n * 1.3; pt3.intensity = n * 1.3; H.signage.emissiveIntensity = .4 + n * .8;
  renderer.toneMappingExposure = .68 + H.daylight * .08;
};
H.on('live', on => { studioSpot.intensity = on ? 1.6 : 0; });

/* per-department laptop screens: small canvas textures updated every few seconds */
const scrM = {};
function deskScreen(dept){
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  scrM[dept] = {c, t, m:new THREE.MeshBasicMaterial({map:t, toneMapped:false})};
}
H.DEPT_IDS.forEach(deskScreen); deskScreen('exec');
const F = (w, px) => `${w} ${px}px "Helvetica Neue",Helvetica,"Noto Sans TC",sans-serif`;
function drawDeskScreens(){
  const k = H.kpi();
  const paint = (dept, fn) => { const s = scrM[dept], g = s.c.getContext('2d'); g.fillStyle = '#fbf6f2'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#17363c'; g.fillRect(0, 0, 256, 22); g.fillStyle = '#f37021'; g.font = F(700, 11); g.fillText('A.C.E. · ' + (H.DEPTS[dept] ? H.DEPTS[dept].en : 'ACE'), 8, 15); fn(g); s.t.needsUpdate = true; };
  paint('sales', g => { g.fillStyle = '#17363c'; g.font = F(700, 13); g.fillText('LINE 官方帳號', 10, 44); const lines = [['客', '剪片一支多少？'], ['我', 'NT$300／支，10 支起'], ['客', '要先看樣片'], ['我', '牛排那支傳給你']]; lines.forEach(([w, t], i) => { const me = w === '我'; g.fillStyle = me ? '#06c755' : '#e5e7eb'; const tw = g.measureText(t).width + 16; g.fillRect(me ? 246 - tw : 10, 54 + i * 24, tw, 18); g.fillStyle = me ? '#fff' : '#17363c'; g.font = F(500, 11); g.fillText(t, (me ? 246 - tw : 10) + 8, 67 + i * 24); }); });
  paint('creative', g => { g.fillStyle = '#17363c'; g.font = F(700, 13); g.fillText('腳本板 · 生成前確認', 10, 44); H.TOPICS.slice(0, 4).forEach((t, i) => { g.fillStyle = i ? '#fff' : '#fff3ec'; g.fillRect(10, 56 + i * 24, 236, 20); g.fillStyle = i ? '#46555a' : '#c9560f'; g.font = F(500, 11); g.fillText((i ? '○ ' : '● ') + t, 16, 70 + i * 24); }); });
  paint('production', g => { g.fillStyle = '#17363c'; g.font = F(700, 13); g.fillText('剪輯時間軸 · 9:16', 10, 44); for (let i = 0; i < 6; i++){ g.fillStyle = ['#f37021', '#17363c', '#3f7f8c'][i % 3]; g.fillRect(10 + i * 40, 58 + (i % 2) * 18, 36, 14); } g.fillStyle = '#6c777b'; g.font = F(500, 11); g.fillText(`今日出片 ${k.videos} 支 · 在製 ${k.inProd} 件`, 10, 120); g.fillStyle = '#ece3da'; g.fillRect(10, 134, 236, 8); g.fillStyle = '#f37021'; g.fillRect(10, 134, 236 * ((H.state.simMin % 60) / 60), 8); });
  paint('growth', g => { const h = H.state.hist.views, n = h.length; g.fillStyle = '#17363c'; g.font = F(700, 13); g.fillText('成效儀表板', 10, 44); g.fillStyle = '#6c777b'; g.font = F(500, 11); g.fillText(`交付 ${k.delivered} 支 · 觀看 ${k.views.toLocaleString('en-US')}`, 10, 62); if (n > 1){ const mx = Math.max(...h) || 1; g.strokeStyle = '#3f7f8c'; g.lineWidth = 2; g.beginPath(); h.forEach((v, i) => { const x = 10 + i / (n - 1) * 236, y = 150 - v / mx * 70; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); } });
  paint('exec', g => { g.fillStyle = '#17363c'; g.font = F(700, 13); g.fillText('A.C.E. 總覽', 10, 44); g.fillStyle = '#6c777b'; g.font = F(500, 11); g.fillText(`今日入帳 ${H.money(k.today)} · 本月 ${k.pct}%`, 10, 62); H.DEPT_IDS.forEach((d, i) => { g.fillStyle = H.DEPTS[d].color; g.beginPath(); g.arc(40 + i * 56, 110, 16, 0, Math.PI * 2); g.fill(); if (i < 3){ g.strokeStyle = '#c9560f'; g.lineWidth = 2; g.beginPath(); g.moveTo(58 + i * 56, 110); g.lineTo(78 + i * 56, 110); g.stroke(); } }); });
}
// attach to laptop lids / monitors: find the glow circle meshes created by world.desk and replace with a screen plane
scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'CircleGeometry' && o.parent && o.parent.geometry && o.parent.geometry.type === 'BoxGeometry'){ o.visible = false; } });
H.desks && Object.keys(H.desks).forEach(dept => H.desks[dept].forEach(d => {
  const lid = scene.children.find(ch => ch.isGroup && Math.abs(ch.position.x - d.x) < .01 && Math.abs(ch.position.z - (d.z + .95)) < .01);
  if (!lid) return;
  const sm = scrM[dept].m;
  const mons = lid.children.filter(ch => ch.geometry && ch.geometry.parameters && Math.abs(ch.geometry.parameters.width - .9) < .01);
  if (mons.length){ mons.forEach(mon => { const p = new THREE.Mesh(new THREE.PlaneGeometry(.84, .44), sm); p.position.set(0, 0, -.021); p.rotation.y = Math.PI; mon.add(p); }); }
  else { const lidMesh = lid.children.find(ch => ch.geometry && ch.geometry.parameters && Math.abs(ch.geometry.parameters.height - .42) < .01 && Math.abs(ch.geometry.parameters.width - .62) < .01); if (lidMesh){ const p = new THREE.Mesh(new THREE.PlaneGeometry(.56, .36), sm); p.position.set(0, 0, -.014); p.rotation.y = Math.PI; lidMesh.add(p); } }
}));
{ const lid = scene.children.find(ch => ch.isGroup && Math.abs(ch.position.x - H.neonDesk.x) < .01 && Math.abs(ch.position.z - (H.neonDesk.z + .95)) < .01); const mon = lid && lid.children.find(ch => ch.geometry && ch.geometry.parameters && Math.abs(ch.geometry.parameters.width - .9) < .01); if (mon){ const p = new THREE.Mesh(new THREE.PlaneGeometry(.84, .44), scrM.exec.m); p.position.set(0, 0, -.021); p.rotation.y = Math.PI; mon.add(p); } }
drawDeskScreens(); setInterval(drawDeskScreens, 2500);

/* ambient dust motes in the sunlit atrium (cheap points) */
const dustGeo = new THREE.BufferGeometry(), N = 260, pos = new Float32Array(N * 3);
for (let i = 0; i < N; i++){ pos[i * 3] = H.rand(-14, 10); pos[i * 3 + 1] = H.rand(.3, 3.2); pos[i * 3 + 2] = H.rand(-8, 9); }
dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({color:0xfff4d6, size:.045, transparent:true, opacity:.55, depthWrite:false})); scene.add(dust);

/* sound: tiny synthesized cues (muted until the viewer turns them on) */
let ac = null; H.sound = {on:false};
try { H.sound.on = localStorage.getItem('lux-sound') === '1'; } catch (_){}
function tone(f, d = .12, type = 'sine', g = .05, when = 0){
  if (!H.sound.on) return;
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); const o = ac.createOscillator(), v = ac.createGain(); o.type = type; o.frequency.value = f; v.gain.setValueAtTime(0, ac.currentTime + when); v.gain.linearRampToValueAtTime(g, ac.currentTime + when + .01); v.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + when + d); o.connect(v).connect(ac.destination); o.start(ac.currentTime + when); o.stop(ac.currentTime + when + d + .02); } catch (_){}
}
H.sfx = {deal:() => { tone(880, .14, 'sine', .05); tone(1320, .22, 'sine', .05, .1); }, click:() => tone(520, .05, 'triangle', .03), ping:() => tone(1040, .1, 'sine', .035), done:() => { tone(660, .1, 'triangle', .04); tone(990, .16, 'triangle', .04, .08); }, alert:() => { tone(330, .18, 'square', .03); tone(330, .18, 'square', .03, .22); }};
H.on('deal', () => H.sfx.deal()); H.on('incident', () => { if (H.state.incident && !H.state.incident.approved && !H.state.incident.ignored) H.sfx.alert(); });
H.setSound = on => { H.sound.on = on; try { localStorage.setItem('lux-sound', on ? '1' : '0'); } catch (_){} H.$('#b-sound').classList.toggle('on', on); H.$('#b-sound').title = on ? '關閉音效' : '開啟音效'; if (on) H.sfx.ping(); };
H.$('#b-sound').onclick = () => H.setSound(!H.sound.on);
H.setSound(H.sound.on);

/* guided tour: camera glides through the four stations with captions */
const STOPS = [
  {t:'客戶接洽', d:'Jo 與 Rin 接 LINE 詢問、報價、簽 10 支起的案子。客戶來訪就在旁邊的皮沙發談。', x:-10, z:5.5, r:15, th:.6},
  {t:'腳本策劃', d:'Mira 寫腳本、做生成前確認；Aria 的話題雷達盯全網熱門，成效回來也先到她手上。', x:-10.5, z:-5.5, r:14, th:.4},
  {t:'AI 製作', d:'Kai 剪片、Mina 做數字人、Leo 導狗血劇。雙螢幕渲染牆上看得到每案進度。', x:0.5, z:-5.5, r:16, th:-.2},
  {t:'數字人攝影棚', d:'綠幕、環燈、攝影機。Mina 每天 11:00 與 15:00 進棚，角色種子鎖定，同一批臉不會跑掉。', x:7, z:-7.5, r:10, th:-.7},
  {t:'Ace 王牌室', d:'AI 王牌製作人 Ace 的玻璃角落。他會巡樓、開站會、偵測事件並提方案。', x:12.6, z:-7.5, r:11, th:-.8},
  {t:'交付成長', d:'Owen 驗收、上架、投放，7 日後把成效回報給客戶與策劃，爆款直接變續約。', x:12.4, z:4.5, r:12, th:-.9},
  {t:'Chill Zone', d:'美式 loft：中島上有披薩、甜甜圈、水果和咖啡機，沙發、黑膠、滑板。全員站會就在這裡。', x:2, z:5.5, r:15, th:.2},
];
let tourI = -1, tourT = null;
H.tour = step => {
  if (step === 'stop'){ tourI = -1; clearTimeout(tourT); H.$('#tour').hidden = true; H.$('#b-tour').classList.remove('on'); H.resetView(); return; }
  tourI = (tourI + 1) % STOPS.length; const s = STOPS[tourI];
  H.closeCard(); H.showDrawer(null); H.focusOn(s.x, s.z, s.r); H.goal.theta = s.th; H.goal.phi = .95;
  H.$('#tour').hidden = false; H.$('#tour-t').textContent = `${tourI + 1} / ${STOPS.length} · ${s.t}`; H.$('#tour-d').textContent = s.d; H.$('#b-tour').classList.add('on');
  clearTimeout(tourT); tourT = setTimeout(() => { if (tourI >= 0) H.tour(); }, 9000);
};
H.$('#b-tour').onclick = () => tourI >= 0 ? H.tour('stop') : H.tour();
H.$('#tour-next').onclick = () => H.tour(); H.$('#tour-x').onclick = () => H.tour('stop');

H.updateFx = (dt, t) => {
  if (H.fans) for (const f of H.fans) f.rotation.y = t * 2.4;
  dust.rotation.y = t * .012; dust.position.y = Math.sin(t * .3) * .08;
  dust.material.opacity = .15 + H.daylight * .4;
  for (const a of [...H.agents, H.neon]) if (a.blob){ const y = a.c.g.position.y; a.blob.position.y = .02 - y; const s = 1 - Math.min(.6, Math.max(0, y) * 1.5); a.blob.scale.setScalar(s); }
};
})();
