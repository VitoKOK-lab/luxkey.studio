/* A.C.E. HQ — camera, top bar, KPI, agent card, alerts, modals, render loop, boot */
(() => {
const H = HQ, S = H.state, $ = H.$, {camera, renderer, scene} = H;
const stage = $('#stage'); stage.appendChild(renderer.domElement);

/* camera orbit */
const narrow = () => innerWidth / innerHeight < 1;
const phone = () => innerWidth <= 760;
/* on phones the HUD sits top and bottom: frame the office inside the free band between them */
function freeBand(){
  const h = innerHeight; let top = 0, bot = h;
  if (!phone()) return {top, bot};
  for (const s of ['.top', '#kpis']){ const r = $(s).getBoundingClientRect(); if (r.height) top = Math.max(top, r.bottom); }
  for (const s of ['.actions', '.rail', '#card']){ const n = $(s); if (n.hidden) continue; const r = n.getBoundingClientRect(); if (r.height) bot = Math.min(bot, r.top); }
  return bot - top > 120 ? {top:top + 4, bot:bot - 4} : {top:0, bot:h};
}
const fitCam = new THREE.PerspectiveCamera(), FIT = [];
{ const w = H.FLOOR.w / 2, d = H.FLOOR.d / 2; for (const x of [-w, w]) for (const z of [-d, d]) FIT.push(new THREE.Vector3(x, 0, z)); FIT.push(new THREE.Vector3(-w, 3.4, -d), new THREE.Vector3(w, 3.4, -d), new THREE.Vector3(-w, 3.4, d));
  /* sky island: keep its grass rim and a slice of the rock underside in frame */
  for (const [x, z] of [[w + 3.4, 0], [-w - 3.4, 0], [0, d + 3.4], [0, -d - 3.4], [w + .9, d + 1.4], [w + .9, -d - 1.4], [-w - .9, d + 1.4], [-w - .9, -d - 1.4]]) FIT.push(new THREE.Vector3(x, -1, z)); FIT.push(new THREE.Vector3(0, -11, 0), new THREE.Vector3(15.6, 13.5, -3), new THREE.Vector3(-15.6, 13.5, -11)); }
/* smallest orbit radius that keeps the floor + back walls inside the free band (fill > 1 allows a slight side crop) */
function fitRadius(v, fill){
  const b = freeBand(), fh = b.bot - b.top, q = new THREE.Vector3();
  fitCam.fov = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * fh / innerHeight) * 180 / Math.PI;
  fitCam.aspect = innerWidth / fh; fitCam.updateProjectionMatrix();
  const place = r => { const sp = Math.sin(v.phi); fitCam.position.set(v.tx + r * sp * Math.sin(v.theta), v.ty + r * Math.cos(v.phi), v.tz + r * sp * Math.cos(v.theta)); fitCam.lookAt(v.tx, v.ty, v.tz); fitCam.updateMatrixWorld(); };
  const box = () => { let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (const p of FIT){ q.copy(p).project(fitCam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); } return {x0, x1, y0, y1}; };
  let r = 60;
  for (let pass = 0; pass < 5; pass++){
    let lo = 8, hi = 220;
    for (let i = 0; i < 20; i++){ r = (lo + hi) / 2; place(r); const b = box(); if (b.x0 >= -fill && b.x1 <= fill && b.y0 >= -.97 && b.y1 <= .97) hi = r; else lo = r; }
    r = hi; place(r);
    /* re-centre the target so the projected office sits in the middle of the band */
    const b = box(), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const hw = r * Math.tan(fitCam.fov * Math.PI / 360) * fitCam.aspect, hh = r * Math.tan(fitCam.fov * Math.PI / 360) / Math.cos(v.phi);
    v.tx += cx * hw * Math.cos(v.theta) - cy * hh * Math.sin(v.theta);
    v.tz += -cx * hw * Math.sin(v.theta) - cy * hh * Math.cos(v.theta);
  }
  return r;
}
const HOME = () => {
  if ((!phone() && !narrow()) || innerHeight < 200 || innerWidth < 100) return {theta:.38, phi:1.06, radius:91, tx:0, ty:6, tz:.5};
  const v = {theta:1.42, phi:.7, radius:0, tx:0, ty:0, tz:0}; /* portrait: look along the long axis so the loft fills the tall screen */
  v.radius = fitRadius(v, .9);
  return [v.radius, v.tx, v.tz].every(Number.isFinite) ? v : {theta:1.42, phi:.62, radius:90, tx:0, ty:0, tz:0};
};
const cam = H.cam = HOME(), goal = H.goal = HOME();
H.follow = null;
function placeCam(dt){
  if (H.follow){ const p = H.follow.c.g.position; goal.tx = p.x; goal.tz = p.z; goal.ty = 1; }
  const a = H.reduced ? 1 : 1 - Math.pow(.0015, dt);
  for (const k in goal){ if (!Number.isFinite(goal[k])) goal[k] = HOME()[k]; cam[k] = Number.isFinite(cam[k]) ? cam[k] + (goal[k] - cam[k]) * a : goal[k]; }
  const sp = Math.sin(cam.phi);
  camera.position.set(cam.tx + cam.radius * sp * Math.sin(cam.theta), cam.ty + cam.radius * Math.cos(cam.phi), cam.tz + cam.radius * sp * Math.cos(cam.theta));
  camera.lookAt(cam.tx, cam.ty, cam.tz);
}
const clampGoal = () => { H.moved = true; goal.phi = H.clamp(goal.phi, .3, 1.32); goal.radius = H.clamp(goal.radius, 6, 650); goal.tx = H.clamp(goal.tx, -46, 46); goal.tz = H.clamp(goal.tz, -44, 44); };
H.focusOn = (x, z, radius = 12) => { H.setEstateRoofs(false); H.airshipFocus=false; H.railFocus=false; H.follow = null; Object.assign(goal, {tx:x, ty:1, tz:z, radius:narrow() ? radius * 1.6 : radius}); };
H.resetView = () => { H.airshipFocus=false; H.railFocus=false; H.follow = null; Object.assign(goal, HOME()); H.moved = false; };
H.setFollow = a => { if (a) H.setEstateRoofs(false); H.follow = a; $('#c-follow').classList.toggle('on', !!a); if (a) goal.radius = Math.min(goal.radius, 11); };
function pan(dx, dy){ const s = goal.radius * .0016, c = Math.cos(goal.theta), sn = Math.sin(goal.theta); goal.tx -= (dx * c + dy * sn) * s; goal.tz -= (-dx * sn + dy * c) * s; }
const el = renderer.domElement, ptrs = new Map(); let dragged = false, pinch0 = 0, panMode = false;
el.addEventListener('contextmenu', e => e.preventDefault());
el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY, sx:e.clientX, sy:e.clientY}); dragged = false; panMode = e.button === 2 || e.shiftKey; if (ptrs.size === 2){ const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
el.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p){ hover(e); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 5) dragged = true;
  if (ptrs.size === 2){ const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0){ goal.radius *= pinch0 / d; pinch0 = d; } dragged = true; pan(dx / 2, dy / 2); clampGoal(); return; }
  if (!dragged) return;
  if (panMode) pan(dx, dy);
  else { goal.theta -= dx * .006; goal.phi -= dy * .005; }
  clampGoal();
});
el.addEventListener('pointerup', e => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; if (p && !dragged && !ptrs.size && e.button === 0) click(e); });
el.addEventListener('pointercancel', e => ptrs.delete(e.pointerId));
el.addEventListener('wheel', e => { e.preventDefault(); goal.radius *= Math.exp(e.deltaY * .0012); clampGoal(); }, {passive:false});
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hit(e){ const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(H.pickables, false)[0]; return h ? h.object.userData.agent : null; }
let hoverT = 0, hovered = null, lastClick = 0;
function hover(e){
  const n = performance.now(); if (n - hoverT < 70) return; hoverT = n;
  const r = hit(e); el.style.cursor = r !== null ? 'pointer' : 'grab';
  const a = typeof r === 'number' ? H.agents[r] : null;
  if (hovered && hovered !== a){ H.setHighlight(hovered, hovered.i === H.selected, true); hovered.tag.classList.remove('hover'); }
  if (a && a !== hovered){ H.setHighlight(a, true, a.i === H.selected); a.tag.classList.add('hover'); }
  hovered = a;
}
function click(e){
  const r = hit(e), n = performance.now(), dbl = n - lastClick < 320; lastClick = n;
  if (r === 'broadcast') H.openBroadcast();
  else if (r === 'neon') H.openChat();
  else if (typeof r === 'number'){ H.openCard(r); if (dbl) H.setFollow(H.agents[r]); }
  else if (dbl){ const p = floorPoint(e); if (p) H.focusOn(p.x, p.z, Math.max(9, goal.radius * .6)); }
  H.sfx && H.sfx.click();
}
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), fp = new THREE.Vector3();
function floorPoint(e){ const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(floorPlane, fp) ? {x:fp.x, z:fp.z} : null; }
/* right-click context menu on an agent */
el.addEventListener('pointerdown', e => { if (e.button !== 2) return; const r = hit(e); if (typeof r !== 'number'){ $('#ctx').hidden = true; return; } const a = H.agents[r]; const m = $('#ctx'); m.hidden = false; m.style.left = Math.min(innerWidth - 200, e.clientX) + 'px'; m.style.top = Math.min(innerHeight - 220, e.clientY) + 'px'; m.dataset.agent = r; $('#ctx-name').textContent = `${a.name} · ${a.role}`; });
$('#ctx').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; const a = H.agents[+$('#ctx').dataset.agent]; $('#ctx').hidden = true;
  ({card:() => H.openCard(a.i), gen:() => { H.enqueue(a); H.showDrawer('workbench'); }, task:() => { H.openCard(a.i); $('#c-task').click(); }, coach:() => H.coach(a), follow:() => { H.openCard(a.i); H.setFollow(a); }, ask:() => H.ask(`幫我檢視 ${a.name} 的狀況，他下一步該做什麼？`)})[b.dataset.act]();
});
addEventListener('pointerdown', e => { if (!e.target.closest('#ctx')) $('#ctx').hidden = true; });
/* keyboard: WASD / arrows pan, Q E rotate, + - zoom, F follow, Esc close */
addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select')) return;
  const k = e.key.toLowerCase(), s = goal.radius * .06, c = Math.cos(goal.theta), sn = Math.sin(goal.theta);
  const pan = (dx, dz) => { H.follow = null; goal.tx += dx * c + dz * sn; goal.tz += -dx * sn + dz * c; };
  if (k === 'w' || k === 'arrowup') pan(0, -s); else if (k === 's' || k === 'arrowdown') pan(0, s); else if (k === 'a' || k === 'arrowleft') pan(-s, 0); else if (k === 'd' || k === 'arrowright') pan(s, 0);
  else if (k === 'q') goal.theta += .15; else if (k === 'e') goal.theta -= .15; else if (k === '+' || k === '=') goal.radius *= .85; else if (k === '-') goal.radius *= 1.18;
  else if (k === 'f' && H.selected !== null) H.setFollow(H.follow ? null : H.agents[H.selected]); else if (k === 'r') H.resetView(); else if (k === ' '){ e.preventDefault(); H.setSpeed(S.speed ? 0 : 1); } else return;
  clampGoal();
});
$('#z-in').onclick = () => { goal.radius *= .8; clampGoal(); };
$('#z-out').onclick = () => { goal.radius *= 1.25; clampGoal(); };
$('#b-reset').onclick = H.resetView;
$('#b-full').onclick = () => { const d = document, p = d.fullscreenElement ? d.exitFullscreen() : d.documentElement.requestFullscreen && d.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => toast('這個檢視不支援全螢幕')); };

/* departments + KPI */
$('#depts').innerHTML = [['all', '全公司'], ...H.DEPT_IDS.map(d => [d, H.DEPTS[d].name])].map(([d, n]) => `<button class="seg" data-dept="${d}" style="--dc:${d === 'all' ? 'var(--fg)' : 'var(--d-' + d + ')'}">${d === 'all' ? '' : '<i></i>'}${n}</button>`).join('');
$('#depts').addEventListener('click', e => { const b = e.target.closest('[data-dept]'); if (b) H.setDept(b.dataset.dept); });
H.setDept = id => {
  S.dept = id;
  H.$$('#depts .seg').forEach(b => b.classList.toggle('on', b.dataset.dept === id));
  for (const d of H.DEPT_IDS) H.zoneMeshes[d].opacity = id === 'all' ? .07 : d === id ? .2 : .03;
  if (id === 'all') H.resetView(); else { const z = H.DEPTS[id].zone; H.focusOn((z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2, 30); }
  if (!$('#analytics').hidden) H.setAnalyticsTab(id);
  renderKPI(); H.renderFeed();
};
function renderKPI(){
  const k = H.kpi(), K = (l, v, hl) => `<div class="kpi${hl ? ' hl' : ''}"><small>${l}</small><b class="num">${v}</b></div>`;
  const sets = {
    all: [K('今日入帳', H.money(k.today), 1), K('本月', `${H.k(k.month)} · ${k.pct}%`), K('LINE 詢問', k.inquiries), K('成單', k.orders), K('出片', k.videos + ' 支'), K('交付', k.delivered + ' 支'), K('AI 產出', (H.runs || []).filter(r => r.state === 'done').length)],
    sales: [K('LINE 詢問', k.inquiries, 1), K('報價', k.quotes), K('成單', k.orders), K('待回覆', k.pending), K('本月', k.pct + '%')],
    creative: [K('腳本', k.scripts, 1), K('確認', k.approved), K('改稿', k.revisions), K('待確認', k.queued), K('洞察', k.insights)],
    production: [K('今日出片', k.videos + ' 支', 1), K('在製', k.inProd + ' 件'), K('待腳本', k.queued), K('待交付', k.qa)],
    growth: [K('今日交付', k.delivered + ' 支', 1), K('入帳', H.k(k.today)), K('觀看', k.views.toLocaleString('en-US')), K('合作品牌', k.clients)],
  };
  $('#kpis').innerHTML = sets[S.dept].join('');
}

/* drawers */
H.showDrawer = name => {
  $('#chat').hidden = name !== 'chat'; $('#analytics').hidden = name !== 'analytics'; $('#workbench').hidden = name !== 'workbench';
  $('#v-chat').classList.toggle('act', name === 'chat'); $('#v-an').classList.toggle('act', name === 'analytics'); $('#v-wb').classList.toggle('act', name === 'workbench');
  if (name === 'workbench') H.renderWorkbench();
  $('#v-floor').classList.toggle('act', !name && $('#feed').hidden);
  document.body.classList.toggle('drawer', !!name);
  if (name === 'analytics') H.setAnalyticsTab(S.dept);
};
$('#v-floor').onclick = () => { H.showDrawer(null); $('#feed').hidden = true; H.closeCard(); H.setDept('all'); };
$('#v-isle').onclick = () => { H.follow = null; H.moved = true; Object.assign(goal, {tx:0, ty:-4, tz:0, phi:.85, radius:narrow() ? 245 : 195}); };
$('#v-an').onclick = () => H.showDrawer($('#analytics').hidden ? 'analytics' : null);
$('#v-wb').onclick = () => H.showDrawer($('#workbench').hidden ? 'workbench' : null);
$('#wb-x').onclick = () => H.showDrawer(null);
$('#b-flywheel').onclick = () => { H.flywheelRun(); H.showDrawer('workbench'); };
$('#v-feed').onclick = () => { $('#feed').hidden = !$('#feed').hidden; $('#v-feed').classList.toggle('act', !$('#feed').hidden); H.renderFeed(); };
$('#v-chat').onclick = () => $('#chat').hidden ? H.openChat() : H.showDrawer(null);
$('#chat-x').onclick = () => H.showDrawer(null); $('#an-x').onclick = () => H.showDrawer(null);
$('#b-ask').onclick = () => H.openChat();
$('#bell').onclick = () => { S.notif = 0; $('#badge').hidden = true; $('#feed').hidden = false; $('#v-feed').classList.add('act'); H.renderFeed(); };

/* agent card */
H.selected = null;
H.openCard = i => {
  if (H.selected !== null && H.selected !== i){ H.setHighlight(H.agents[H.selected], false); if (H.follow) H.setFollow(null); }
  H.selected = i; $('#card').hidden = false;
  H.agents.forEach(a => a.tag.classList.toggle('sel', a.i === i)); H.setHighlight(H.agents[i], true, true);
  const a = H.agents[i]; H.focusOn(a.c.g.position.x, a.c.g.position.z, 13);
  H.renderCard();
};
H.closeCard = () => { if (H.selected !== null) H.setHighlight(H.agents[H.selected], false); H.selected = null; H.setFollow(null); $('#card').hidden = true; H.agents.forEach(a => a.tag.classList.remove('sel')); };
$('#c-follow').onclick = () => H.setFollow(H.follow ? null : H.agents[H.selected]);
$('#c-x').onclick = H.closeCard;
const PRIMARY = {sales:'馬上回報價', creative:'現在寫腳本', production:'加速渲染', growth:'驗收交片'};
H.renderCard = () => {
  if (H.selected === null) return;
  const a = H.agents[H.selected], k = H.kpi(), st = a.stats;
  $('#c-av').textContent = a.name[0]; $('#c-av').style.background = `var(--d-${a.dept})`;
  $('#c-name').textContent = a.name; $('#c-role').textContent = `${a.role} · ${H.DEPTS[a.dept].name}`;
  $('#c-st span').textContent = H.statusLabel(a); $('#c-st i').style.background = H.ST[a.status][1];
  const cell = (l, v, meter) => `<div class="stat"><small>${l}</small><b class="num">${v}</b>${meter !== undefined ? `<div class="meter"><i style="width:${Math.min(100, meter)}%"></i></div>` : ''}</div>`;
  $('#c-stats').innerHTML = {
    sales: () => cell('本月業績', H.money(st.sales)) + cell('目標達成', Math.round(st.sales / st.target * 100) + '%', st.sales / st.target * 100) + cell('今日成單', st.orders) + cell('待回 LINE', a.pending || 0),
    creative: () => a.data ? cell('今日洞察', st.insights) + cell('全隊腳本', k.scripts) + cell('改稿率', k.scripts ? Math.round(k.revisions / k.scripts * 100) + '%' : '0%') + cell('待確認', k.queued)
                          : cell('今日腳本', st.scripts) + cell('確認', st.approved) + cell('改稿', st.revisions) + cell('待確認', k.queued),
    production: () => cell('今日出片', st.videos + ' 支') + cell('渲染次數', st.renders) + cell('負責', H.svc(a.svc).suit + ' ' + H.svc(a.svc).name) + cell(a.name === 'Mina' ? '攝影棚' : '在製', a.name === 'Mina' ? (a.activity === 'live' ? 'REC' : '待機') : k.inProd + ' 件'),
    growth: () => cell('今日交付', st.delivered + ' 支') + cell('入帳', H.k(k.today)) + cell('觀看', st.views.toLocaleString('en-US')) + cell('待驗收', k.qa),
  }[a.dept]();
  $('#c-tasks').innerHTML = a.tasks.slice(0, 3).map(t => `<li><span>${t.auto ? '' : '<em>指派</em>'}${t.text.replace(/[<>&]/g, '')}</span><time class="num">${Math.max(1, Math.round(t.until - S.simMin))} 分</time></li>`).join('');
  $('#c-quote').innerHTML = `<strong>${H.BRAND.ai}：</strong>`; $('#c-quote').append(a.quote || '「保持節奏，有狀況隨時找我。」');
  $('#c-foot').textContent = '最近：' + a.last;
  $('#c-primary span').textContent = PRIMARY[a.dept];
  $('#c-primary').disabled = a.activity !== 'desk' || a.path.length > 0;
  $('#c-gen span').textContent = (H.JOBS[a.dept].labelFor ? H.JOBS[a.dept].labelFor(a) : H.JOBS[a.dept].label); $('#c-gen').disabled = a.status === 'ai';
};
$('#c-primary').onclick = () => H.primary(H.agents[H.selected]);
$('#c-coach').onclick = async () => { const b = $('#c-coach'); b.disabled = true; b.textContent = H.BRAND.ai + ' 思考中…'; await H.coach(H.agents[H.selected]); b.disabled = false; b.textContent = '教練建議'; H.renderCard(); };
$('#c-ask').onclick = () => { const a = H.agents[H.selected]; H.ask(`幫我檢視 ${a.name}（${H.DEPTS[a.dept].name}）的狀況，他下一步該做什麼？`); };
$('#c-gen').onclick = () => { H.enqueue(H.agents[H.selected]); H.showDrawer('workbench'); };

/* modals */
const PRESETS = {sales:['回覆所有待回 LINE', '約赤身牛排談年約', '整理經銷夥伴名單'], creative:['抓本週熱門話題', '把 4 版改稿收斂成 1 版', '寫牛排主題通用腳本'], production:['先出每案前 3 支', '鎖定數字人角色種子', '統一字幕字級'], growth:['回報 7 日成效給客戶', '改文案重送審', '排下週上架時間表']};
$('#c-task').onclick = () => {
  const a = H.agents[H.selected]; $('#t-who').textContent = `指派給 ${a.name}（${a.role}）`;
  $('#t-chips').innerHTML = PRESETS[a.dept].map(p => `<button type="button" class="chip">${p}</button>`).join('');
  $('#t-text').value = PRESETS[a.dept][0]; $('#modal-task').hidden = false; $('#t-text').focus();
};
$('#t-chips').addEventListener('click', e => { if (e.target.classList.contains('chip')) $('#t-text').value = e.target.textContent; });
$('#task-form').addEventListener('submit', e => { e.preventDefault(); const t = $('#t-text').value.trim(); if (!t) return; H.assignTask(H.agents[H.selected], t.slice(0, 40)); $('#modal-task').hidden = true; toast('已指派：' + t); });
const fRep = $('#f-rep'); H.agentsBy('sales').forEach(r => fRep.add(new Option(`${r.name}（${r.role}）`, r.i)));
const fSvc = $('#f-svc'); H.SERVICES.forEach(s => fSvc.add(new Option(`${s.suit} ${s.name} · NT$${s.price}/支`, s.id)));
$('#b-new').onclick = () => { $('#modal-deal').hidden = false; $('#f-co').value = H.pick(H.CLIENTS); $('#f-co').focus(); };
$('#deal-form').addEventListener('submit', e => {
  e.preventDefault();
  const r = H.agents[+fRep.value], who = $('#f-co').value.trim() || '新客戶', svc = fSvc.value, qty = Math.max(H.svc(svc).min, +$('#f-amt').value || 10);
  r.pending = (r.pending || 0) + 1; H.assignTask(r, `回 ${who} 的 ${H.svc(svc).name} ×${qty} 報價`, {deal:{who, svc, qty}});
  $('#modal-deal').hidden = true; toast(`已建立詢問：${who} → ${r.name}`); H.openCard(r.i);
});
H.$$('.scrim').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.dataset.close !== undefined) m.hidden = true; }));
addEventListener('keydown', e => { if (e.key === 'Escape'){ H.$$('.scrim').forEach(m => m.hidden = true); $('#meet-menu').hidden = true; } });

/* meetings + incidents */
$('#b-meet').onclick = () => { if (S.meeting){ H.endMeeting(); return; } $('#meet-menu').hidden = !$('#meet-menu').hidden; };
$('#meet-menu').innerHTML = [['all', '全員站會（Chill Zone）'], ...H.DEPT_IDS.map(d => [d, H.DEPTS[d].name + '會議'])].map(([d, n]) => `<button data-meet="${d}">${n}</button>`).join('');
$('#meet-menu').addEventListener('click', e => { const b = e.target.closest('[data-meet]'); if (!b) return; $('#meet-menu').hidden = true; H.closeCard(); H.callMeeting(b.dataset.meet); H.focusOn(b.dataset.meet === 'all' ? H.ATRIUM.x : 15.5, b.dataset.meet === 'all' ? H.ATRIUM.z : -2.5, 20); });
H.on('meeting', () => { $('#b-meet span').textContent = S.meeting ? '結束會議' : '召開會議'; $('#b-meet').classList.toggle('on', !!S.meeting); });
$('#b-event').onclick = () => S.incident ? toast('目前已有事件處理中') : H.triggerIncident();
function renderAlert(){
  const inc = S.incident, al = $('#alert');
  if (!inc || inc.ignored){ al.hidden = true; return; }
  const d = H.INC[inc.type]; al.hidden = false; al.style.setProperty('--dc', `var(--d-${d.dept})`);
  $('#al-title').textContent = d.title; $('#al-desc').textContent = d.desc; $('#al-prop').textContent = d.proposal;
  $('#al-acts').hidden = inc.approved; $('#al-run').hidden = !inc.approved;
}
H.on('incident', renderAlert);
$('#al-ok').onclick = () => H.resolveIncident(true); $('#al-no').onclick = () => H.resolveIncident(false);
$('#al-ask').onclick = () => H.ask('現在這個事件我該怎麼處理？');
H.on('live', on => { H.studioLive(on); $('#b-live').classList.toggle('on', on); $('#b-live span').textContent = on ? '收棚' : '數字人進棚'; });
$('#b-live').onclick = () => H.goLive(null, H.findAgent('Mina').activity !== 'live');
H.on('deal', d => { $('#badge').hidden = !S.notif; $('#badge').textContent = S.notif; toast(`成交 · ${d.r.name} 簽下 ${d.who} ${H.money(d.amt)}`); });

/* clock + speed */
$('#speed').innerHTML = [[0, '暫停'], [1, '1×'], [4, '4×'], [12, '12×']].map(([v, n]) => `<button class="seg" data-sp="${v}">${n}</button>`).join('');
$('#speed').addEventListener('click', e => { const b = e.target.closest('[data-sp]'); if (b) H.setSpeed(+b.dataset.sp); });
H.on('speed', () => H.$$('#speed .seg').forEach(b => b.classList.toggle('on', +b.dataset.sp === S.speed)));

let toastT;
function toast(t){ const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), 2600); }
H.toast = toast;

/* render loop */
const v3 = new THREE.Vector3();
function project(x, y, z, node, W, Hh){
  v3.set(x, y, z).project(camera);
  if (v3.z > 1 || v3.x < -1.2 || v3.x > 1.2 || v3.y < -1.2 || v3.y > 1.2){ node.style.visibility = 'hidden'; return; }
  let sx = (v3.x * .5 + .5) * W;
  if (node.classList.contains('show') || (node.classList.contains('zone') && W <= 760)){ const hw = node.offsetWidth / 2 + 6; sx = H.clamp(sx, hw, W - hw); } /* keep bubbles + zone labels on screen */
  node.style.visibility = ''; node.style.transform = `translate(${sx.toFixed(1)}px,${((-v3.y * .5 + .5) * Hh).toFixed(1)}px) translate(-50%,-100%)`;
}
let wasPhone = phone(), viewOff = 0, offWant = 0;
/* shift the image centre into the free band (between HUD and dock / open sheet) */
const bandOffset = () => { const b = freeBand(); return Math.round((b.top + b.bot) / 2 - stage.clientHeight / 2); };
function applyOffset(){ const w = stage.clientWidth, h = stage.clientHeight; if (Math.abs(viewOff) > .5) camera.setViewOffset(w, h, 0, -viewOff, w, h); else camera.clearViewOffset(); camera.updateProjectionMatrix(); }
function resize(){
  const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  viewOff = offWant = bandOffset(); applyOffset();
  if (phone() !== wasPhone || (phone() && !H.moved)){ wasPhone = phone(); if (!H.follow) Object.assign(goal, HOME()); }
}
addEventListener('resize', resize); resize();
document.fonts && document.fonts.ready.then(resize);
let last = performance.now(), lastUi = 0, lastScr = 0, lastAn = 0;
function uiTick(now){
  if (phone()) offWant = bandOffset();
  const hr = S.simMin / 60 % 24;
  $('#clk').textContent = H.fmtTime(S.simMin);
  $('#phase').textContent = H.daylight > .5 ? '王牌團隊上線' : '夜班 · AI 不休息';
  $('#hello').textContent = (hr < 5 || hr >= 18 ? '晚安' : hr < 11 ? '早安' : '午安') + '，Vito';
  const working = H.agents.filter(a => a.activity === 'desk' || a.activity === 'live').length, ai = H.agents.filter(a => a.status === 'ai').length;
  $('#sub').textContent = `8 位夥伴 + Ace · ${working} 位工作中${ai ? ` · ${ai} 位 AI 產出中` : ''}${S.meeting ? ' · 會議進行中' : ''}`;
  renderKPI(); H.renderCard(); H.drawMinimap();
  if (S.incident && S.incident.approved) $('#al-run').textContent = `執行中 · 約 ${Math.max(1, Math.round(S.incident.until - S.simMin))} 分鐘後解除`;
  if (now - lastScr > 1200){ lastScr = now; H.drawScreens(); }
  $('#stat-bar').textContent = `${H.fmtTime(S.simMin)} · 鏡頭 ${H.follow ? '跟隨 ' + H.follow.name : '自由'} · 滾輪縮放 · 右鍵拖曳平移 · 雙擊聚焦 · 右鍵員工開選單 · WASD / QE / F / 空白鍵`;
  if (now - lastAn > 2000){ lastAn = now; H.renderAnalytics(); }
}
function frame(now){
  const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
  if (Math.abs(offWant - viewOff) > .5){ viewOff += (offWant - viewOff) * Math.min(1, dt * 8); applyOffset(); }
  placeCam(dt); H.advance(dt); H.updateSim(dt); H.updateAgents(dt, t, now); H.updateWorld(dt, t); H.updateFx && H.updateFx(dt, t); H.setDaylight(S.simMin);
  renderer.render(scene, camera);
  const W = stage.clientWidth, Hh = stage.clientHeight;
  document.body.classList.toggle('far', cam.radius > 62);
  for (const a of H.agents){
    const p = a.c.g.position;
    a.tag.querySelector('.dot').style.background = H.ST[a.status][1];
    const sp = a.tag.querySelector('span'), txt = H.metricText(a); if (sp.textContent !== txt) sp.textContent = txt;
    if (!a.c.g.visible){ a.tag.style.visibility = a.bub.style.visibility = 'hidden'; continue; }
    project(p.x, p.y + 2.35, p.z, a.tag, W, Hh); project(p.x, p.y + 2.95, p.z, a.bub, W, Hh);
  }
  const n = H.neon.c.g.position; project(n.x, n.y + 2.75, n.z, H.neon.tag, W, Hh); project(n.x, n.y + 3.3, n.z, H.neon.bub, W, Hh);
  for (const z of H.zoneTags){ if (z.y === undefined && cam.radius > 100) z.el.style.visibility = 'hidden'; else project(z.x, z.y ?? .05, z.z, z.el, W, Hh); }
  for (const e of H.extraTags || []){ const o = e.o.position; if (!e.o.visible || cam.radius > 62) e.el.style.visibility = 'hidden'; else project(o.x, o.y + e.dy, o.z, e.el, W, Hh); }
  if (now - lastUi > 400){ lastUi = now; uiTick(now); }
  requestAnimationFrame(frame);
}

/* boot */
const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
H.presim(9 * 60 + Math.max(45, (nowMin - 540 + 1440) % 1440));
H.setDaylight(S.simMin);
S.feed.length = 0;
[['Ace 完成晨間巡檢，客戶／策劃／製作／交付四站上線', null], [`Jo 本月業績 ${H.k(H.findAgent('Jo').stats.sales)}，赤身牛排談年約中`, 'sales'], ['Kai 的「牛排幾分熟」一週破 5 萬觀看', 'growth']].forEach(([t, d]) => H.log(t, d));
H.neonLine = '8 位夥伴上線，' + (H.daylight > .5 ? '王牌團隊運作中' : '夜班持續出片') + '。';
H.setDept('all'); H.emit('speed'); H.drawScreens();
document.fonts && document.fonts.ready.then(H.drawScreens);
setTimeout(() => H.say(H.findAgent('Kai'), '牛排那支破 5 萬了！'), 900);
setTimeout(() => H.say(H.neon, '點任何夥伴按「AI 產出」，或按「王牌流程」看四站接力。', 'ACE', 7000, true), 1600);
requestAnimationFrame(frame);
setTimeout(() => { resize(); if (!H.moved){ Object.assign(goal, HOME()); Object.assign(cam, goal); } }, 150);
})();
