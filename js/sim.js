/* A.C.E. 製作飛輪：LINE 詢問 → 報價成單 → 腳本確認 → AI 製作 → 交片上架 → 成效回到策劃 */
(() => {
const H = HQ, S = H.state, M = S.m, {chance, rand, pick} = H;
const atDesk = a => a.activity === 'desk' && !a.path.length;
H.log = (text, dept) => { if (H.silent) return; S.feed.unshift({t:H.fmtTime(S.simMin), text, dept}); if (S.feed.length > 80) S.feed.length = 80; H.emit('feed'); };

/* 光球：站與站之間的交棒 */
const orbs = [], orbGeo = new THREE.SphereGeometry(.17, 14, 10);
const posOf = o => o.c ? {x:o.c.g.position.x, y:2.2, z:o.c.g.position.z} : o;
H.orb = (from, to, color, cb) => { if (H.silent){ cb && cb(); return; } const m = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({color})); H.scene.add(m); orbs.push({m, a:posOf(from), to, t:0, cb}); };
H.updateSim = dt => {
  const sp = Math.sqrt(Math.max(S.speed, .0001));
  for (let i = orbs.length - 1; i >= 0; i--){
    const o = orbs[i]; if (S.speed) o.t += dt / 1.3 * Math.min(sp, 2.5);
    const b = posOf(o.to), t = Math.min(1, o.t), e = t * t * (3 - 2 * t);
    o.m.position.set(o.a.x + (b.x - o.a.x) * e, o.a.y + (b.y - o.a.y) * e + Math.sin(Math.PI * t) * 3, o.a.z + (b.z - o.a.z) * e);
    if (t >= 1){ H.scene.remove(o.m); o.m.material.dispose(); orbs.splice(i, 1); o.cb && o.cb(); }
  }
};
const anyAt = dept => { const p = H.agentsBy(dept).filter(atDesk); return p.length ? pick(p) : pick(H.agentsBy(dept)); };
const hex = d => H.DEPTS[d].hex;
const producerFor = svc => H.agentsBy('production').find(a => a.svc === svc || (svc === 'ugc' && a.svc === 'drama')) || anyAt('production');

/* 突發事件 */
H.INC = {
  trend:  {title:'熱門話題爆發', dept:'creative', desc:'「' + pick(H.TOPICS) + '」正在全網發酵，三個客戶都想在 24 小時內上片。', proposal:'Mira 寫通用腳本，Kai 先出 3 支搶熱度，其他排程往後 1 天', effect:{inquiries:2.2}, fix:{inquiries:2.2, render:1.8}, mins:70},
  redo:   {title:'數字人角色不一致', dept:'production', desc:'客戶反映第 2 批數字人臉型與第 1 批不同，要求重做 4 支。', proposal:'鎖定角色種子重生成，Mina 專心重做，Leo 支援剪片', effect:{render:.6}, fix:{render:1.2}, mins:60},
  rev4:   {title:'客戶改腳本第 4 版', dept:'creative', desc:'晴朗保養的老闆第 4 次改腳本，製作已被卡住兩天。', proposal:'Ace 整理三版差異，一次確認後再開工；超過 3 版改稿改收費', effect:{approve:.3}, fix:{approve:1.5}, mins:50},
  flood:  {title:'LINE 詢問暴增', dept:'sales', desc:'一支作品被轉發破 50 萬觀看，LINE 一小時進來 40 則詢問。', proposal:'Rin 用 AI 先回報價表，Jo 只接 10 支以上的案子', effect:{inquiries:3, quote:.5}, fix:{inquiries:3, quote:1.6}, mins:80},
  takedown:{title:'投放素材被下架', dept:'growth', desc:'狗血劇廣告被平台判定誇大，三支素材下架。', proposal:'Owen 改文案重送審，Leo 補一版溫和結尾', effect:{views:.4}, fix:{views:1}, mins:60},
};
const boost = k => { const inc = S.incident; if (!inc) return 1; const d = H.INC[inc.type], src = inc.approved ? d.fix : d.effect; return (src && src[k]) || 1; };
H.boost = boost;

/* 專案 */
let pid = 0;
H.newProject = (client, svcId, qty, owner) => {
  const svc = H.svc(svcId); qty = Math.max(svc.min, qty || svc.min);
  const p = {id:++pid, client, svc:svcId, qty, done:0, amount:svc.price * qty, stage:'script', topic:pick(H.TOPICS), owner:owner ? owner.name : 'Jo', t:S.simMin};
  S.projects.unshift(p); if (S.projects.length > 40) S.projects.length = 40;
  M.sales.orders++; M.sales.booked += p.amount; if (owner){ owner.stats.orders++; owner.stats.sales += p.amount; }
  return p;
};
const active = stage => S.projects.filter(p => p.stage === stage);

/* 1. 客戶接洽 */
function inquiry(){
  const a = anyAt('sales'), p = a.c.g.position, c = pick(H.CLIENTS), s = pick(H.SERVICES);
  H.orb({x:p.x + rand(-3, 3), y:8, z:p.z + 6}, a, 0x06c755, () => {
    M.sales.inquiries++; a.stats.inquiries++; a.pending = (a.pending || 0) + 1; a.last = `LINE：${c} 問 ${s.name}`;
    if (chance(.3)) H.say(a, pick([`${c} 問 ${s.name} 多少錢`, `${c} 想做 10 支 ${s.name}`, `${c} 傳了商品照來`]));
  });
}
function quote(a){
  if (!a.pending) return; a.pending--; M.sales.quotes++; a.stats.quotes++;
  const c = pick(H.CLIENTS), s = pick(H.SERVICES); a.last = `報價 ${c}：${s.name} ×${s.min}`;
  H.setStatus(a, 'call', 3000);
  if (chance(.55 * boost('quote'))){
    const p = H.newProject(c, s.id, s.min + Math.floor(Math.random() * 3) * 5, a);
    H.say(a, `${c} 成單！${s.suit} ${s.name} ×${p.qty}，${H.money(p.amount)}`, '', 4200, true);
    H.log(`${a.name} 簽下 ${c}：${s.name} ×${p.qty}（${H.money(p.amount)}）`, 'sales');
    if (!H.silent){ S.notif++; H.emit('deal', {r:a, amt:p.amount, who:c}); }
    const m = anyAt('creative'); H.orb(a, m, hex('sales'), () => { m.last = `接到 ${c} 的腳本需求`; });
  } else if (chance(.3)) H.say(a, `${c} 先回去想想`);
}
/* 2. 腳本策劃 */
function script(a){
  const p = active('script').find(x => !x.scriptBy); if (!p) return;
  p.scriptBy = a.name; a.stats.scripts++; M.creative.scripts++; a.last = `寫 ${p.client}「${p.topic}」腳本`;
  H.setStatus(a, 'working');
  if (chance(.35)) H.say(a, pick([`${p.client} 的腳本：「${p.topic}」`, '前 3 秒要反轉', '角色設定先定好再開工']));
  if (H.silent) approve(a, p); else setTimeout(() => approve(a, p), H.dur(rand(4000, 9000)));
}
function approve(a, p){
  if (p.stage !== 'script') return;
  if (!H.silent && chance(.25 / boost('approve'))){ p.rev = (p.rev || 0) + 1; M.creative.revisions++; a.stats.revisions++; H.say(a, `${p.client} 要改第 ${p.rev + 1} 版`, '', 3600, true); setTimeout(() => approve(a, p), H.dur(5000)); return; }
  p.stage = 'production'; M.creative.approved++; a.stats.approved++; a.last = `${p.client} 腳本確認`;
  const pr = producerFor(p.svc);
  H.orb(a, pr, hex('creative'), () => { pr.last = `接手 ${p.client} ${H.svc(p.svc).name}`; });
  H.log(`${a.name} 完成 ${p.client} 生成前確認，交給 ${pr.name} 製作`, 'creative');
}
/* 3. AI 製作 */
function render(a){
  const mine = active('production').filter(p => producerFor(p.svc) === a || p.svc === 'ugc' && a.svc === 'drama');
  const p = mine[0] || active('production')[0]; if (!p) return;
  const svc = H.svc(p.svc);
  if (chance(.9 / svc.dur * boost('render'))){
    p.done++; a.stats.videos++; M.production.videos++; a.stats.renders++; M.production.renders++;
    a.last = `${p.client} 第 ${p.done}/${p.qty} 支完成`;
    if (chance(.18)) H.say(a, pick([`${p.client} 第 ${p.done} 支出爐`, '字幕上好了', '這版節奏對了', `渲染中… ${p.done}/${p.qty}`]));
    if (p.done >= p.qty){ p.stage = 'qa'; const o = anyAt('growth'); H.orb(a, o, hex('production'), () => { o.last = `驗收 ${p.client} ${p.qty} 支`; }); H.log(`${a.name} 完成 ${p.client} ${svc.name} ×${p.qty}，送交付`, 'production'); }
  }
}
/* 4. 交付成長 */
function deliver(a){
  const p = active('qa')[0]; if (!p) return;
  p.stage = 'delivered'; p.doneAt = S.simMin; a.stats.delivered += p.qty; M.growth.delivered += p.qty; M.growth.revenue += p.amount;
  a.last = `交付 ${p.client} ${p.qty} 支`;
  H.setStatus(a, 'deal', 3500); H.say(a, `${p.client} 交片！${p.qty} 支直式影片已上架，${H.money(p.amount)}`, '', 4200, true);
  H.log(`${a.name} 交付 ${p.client} ${H.svc(p.svc).name} ×${p.qty}，入帳 ${H.money(p.amount)}`, 'growth');
  if (!H.silent) H.emit('deliver', p);
  if (H.silent) feedback(a, p); else setTimeout(() => feedback(a, p), H.dur(rand(6000, 12000)));
}
function feedback(a, p){
  const v = Math.round(rand(8000, 60000) * boost('views')); p.views = v; M.growth.views += v; a.stats.views += v; a.stats.posts += p.qty;
  const m = H.agentsBy('creative').find(x => x.data) || anyAt('creative');
  H.orb(a, m, hex('growth'), () => { m.stats.insights++; M.creative.insights++; m.last = `${p.client} 7 日成效 ${v.toLocaleString('en-US')} 觀看`; });
  if (chance(.5)) H.log(`${p.client} 第一波 7 日觀看 ${v.toLocaleString('en-US')}，成效回到策劃`, 'growth');
  if (!H.silent && v > 40000 && chance(.6)) setTimeout(() => { const s = anyAt('sales'); s.pending = (s.pending || 0) + 1; H.say(s, `${p.client} 爆了，想續約第二批！`, '', 4000, true); }, H.dur(3000));
}
function insight(a){
  const line = pick(['3 秒反轉的完播率高 2.3 倍', '週四晚上 9 點上片觀看最多', '數字人配真人口白轉換最好', '牛排主題在雙北互動率最高']);
  a.stats.insights++; M.creative.insights++; a.last = '洞察：' + line;
  if (chance(.4)) H.say(a, line, '話題雷達');
  if (chance(.3)) H.log(`${a.name}：${line}`, 'creative');
}

/* 休息、客戶來訪、直播 */
function interrupt(a){ if (a.spot){ a.spot.taken = null; a.spot = null; } H.setCup(a, false); a.path = []; a.onArrive = null; }
function takeBreak(a){
  const free = H.breakSpots.filter(s => !s.taken); if (!free.length) return;
  const spot = pick(free); spot.taken = a; a.spot = spot; a.activity = 'break'; a.breakUntil = S.simMin + rand(10, 24);
  H.goTo(a, spot, () => { if (a.activity !== 'break') return; if (spot.sit) a.pose = 'sit'; H.setCup(a, true); H.setStatus(a, 'break'); if (chance(.5)) H.say(a, pick(['先吃塊披薩', '甜甜圈誰買的？', '補杯咖啡再剪', '放首歌吧', '這首 vinyl 讚'])); });
}
function endBreak(a){ interrupt(a); a.activity = 'returning'; H.goHome(a); }
H.goLive = (a, on) => {
  a = a || H.findAgent('Mina');
  if (on){ if (a.activity === 'live') return; interrupt(a); a.activity = 'live'; a.liveUntil = S.simMin + 45; H.goTo(a, H.stageSpot, () => { if (a.activity !== 'live') return; H.setStatus(a, 'live'); H.say(a, '數字人錄製開始，鎖定角色種子', '', 5000, true); H.log(`${a.name} 進棚錄製數字人`, 'production'); H.emit('live', true); }); }
  else { if (a.activity !== 'live') return; interrupt(a); a.activity = 'returning'; H.goHome(a); H.log(`${a.name} 收棚`, 'production'); H.emit('live', false); }
};

/* 同事對話、Ace 巡樓 */
const CHAT = {
  sales:[['赤身牛排想一次做 30 支', '那走年約最低價。'], ['這個客戶要先看樣片', '丟牛排那支給他看。']],
  creative:[['這支前 3 秒反轉要更狠', '讓老闆娘先翻桌再講產品。'], ['角色種子鎖好了嗎', '鎖了，第二批不會再跑掉。']],
  production:[['數字人口型對不上', '語速降 10% 再生成。'], ['這版 BGM 太滿', '副歌只留前 8 秒。']],
  growth:[['牛排那支破 5 萬了', '請 Rin 去談續約。'], ['平台又下架一支', '改掉「保證」兩個字重送。']],
};
function chatTick(){
  const dept = pick(H.DEPT_IDS), pool = H.agentsBy(dept).filter(atDesk);
  if (pool.length < 2 || S.meeting){ if (pool.length === 1 && chance(.5)){ const a = pool[0], others = H.agents.filter(b => b !== a && atDesk(b)); if (!others.length) return; const b = pick(others), lines = pick(CHAT[dept]); return pairChat(a, b, lines, dept); } return; }
  const [a, b] = pool.sort(() => Math.random() - .5); pairChat(a, b, pick(CHAT[dept]), dept);
}
function pairChat(a, b, lines, dept){
  a.activity = 'chat'; H.goTo(a, {x:b.home.x + .9, z:b.home.z + .2, face:-Math.PI / 2}, () => {
    if (a.activity !== 'chat') return;
    H.setStatus(a, 'idle'); H.say(a, lines[0], '', 3800, true); b.rotGoal = Math.PI / 2 * .6;
    setTimeout(() => { if (a.activity !== 'chat') return; H.say(b, lines[1], '', 3800, true); }, H.dur(2200));
    setTimeout(() => { if (a.activity !== 'chat') return; b.rotGoal = b.home.face; a.activity = 'returning'; H.goHome(a); }, H.dur(5600));
  });
  if (chance(.5)) H.log(`${a.name} 去找 ${b.name} 討論`, dept);
}
let patrol = null;
H.patrolReset = () => { patrol = null; };
function patrolTick(){
  if (S.meeting || patrol) return;
  const dept = pick(H.DEPT_IDS), pool = H.agentsBy(dept).filter(atDesk); if (!pool.length) return;
  const a = pick(pool), line = pick(H.COACH[dept]).replace('{c}', pick(H.CLIENTS)); patrol = a;
  H.goTo(H.neon, {x:a.home.x - .9, z:a.home.z + .3, face:Math.PI / 2}, () => {
    a.quote = line; H.say(H.neon, line, 'ACE → ' + a.name.toUpperCase(), 5200, true);
    H.neonLine = '正在跟 ' + a.name + ' 說：' + line; H.log('Ace 走到 ' + a.name + ' 身邊', dept);
    setTimeout(() => H.say(a, pick(['收到，馬上改！', '好，這批就這樣做。', '懂了，謝啦 Ace。']), '', 3000, true), H.dur(2600));
    setTimeout(() => { patrol = null; H.goTo(H.neon, H.neon.home); }, H.dur(6500));
  });
}
H.COACH = {
  sales:['10 支起訂先講清楚，省掉來回', '先丟樣片連結，再談價格', '{c} 問完價 2 小時內要回', '經銷夥伴那條線多推一把'],
  creative:['前 3 秒就反轉，不要鋪陳', '腳本確認好才開工，第 4 版要收費', '熱門話題 24 小時內要上', '角色種子先鎖，風格才一致'],
  production:['同一批保持同一組角色', '字幕字級大一點，手機看得清', '節奏卡 0.8 秒一個切點', '先出 3 支讓客戶安心'],
  growth:['交付就附上架時間表', '7 日成效主動回報，續約率會漲', '被下架先改文案別硬送', '把爆款截圖給業務當樣片'],
};

/* 會議 */
const SUM = {
  sales: () => [`今日 LINE 詢問 ${M.sales.inquiries}、報價 ${M.sales.quotes}、成單 ${M.sales.orders}`, `在製專案 ${active('production').length} 件，待腳本 ${active('script').length} 件`],
  creative: () => [`今日腳本 ${M.creative.scripts}，確認 ${M.creative.approved}，改稿 ${M.creative.revisions}`, `洞察 ${M.creative.insights} 則，熱門話題：${pick(H.TOPICS)}`],
  production: () => [`今日出片 ${M.production.videos} 支`, `在製 ${active('production').length} 件，待交付 ${active('qa').length} 件`],
  growth: () => [`今日交付 ${M.growth.delivered} 支，入帳 ${H.money(M.growth.revenue)}`, `累計觀看 ${M.growth.views.toLocaleString('en-US')}`],
};
SUM.all = () => { const k = H.kpi(); return [`今日：詢問 ${k.inquiries} → 成單 ${k.orders} → 出片 ${k.videos} → 交付 ${k.delivered}`, `入帳 ${H.money(k.today)}，本月 ${k.pct}%`]; };
H.callMeeting = dept => {
  if (S.meeting) H.endMeeting(true);
  const list = dept === 'all' ? H.agents : H.agentsBy(dept), spots = dept === 'all' ? H.allHands : H.meetChairs;
  S.meeting = {dept, arrived:0, total:list.length};
  list.forEach((a, i) => { interrupt(a); a.activity = 'meeting'; const sp = spots[i % spots.length]; H.goTo(a, sp, () => { if (a.activity !== 'meeting') return; if (dept !== 'all') a.pose = 'sit'; H.setStatus(a, 'meeting'); if (S.meeting && ++S.meeting.arrived === S.meeting.total) meetingSummary(); }); });
  H.patrolReset(); H.goTo(H.neon, dept === 'all' ? {x:H.ATRIUM.x, z:H.ATRIUM.z + .01, face:0} : {x:12.4, z:-4.4, face:Math.PI});
  const name = dept === 'all' ? '全員站會' : H.DEPTS[dept].name + '會議';
  H.drawScreen('meet', g => { g.fillStyle = '#f37021'; g.font = H.screenFont(700, 30, 1); g.fillText('進行中 · ' + name, 30, 60); g.fillStyle = '#c9ced8'; g.font = H.screenFont(500, 22); g.fillText(`${list.length} 位 · 主持：Ace`, 30, 106); });
  H.log(`Ace 召開${name}`, dept === 'all' ? null : dept); H.emit('meeting');
};
function meetingSummary(){ if (!S.meeting) return; const lines = SUM[S.meeting.dept](); H.say(H.neon, lines.join('；'), 'ACE 會議重點', 9000, true); H.log('會議重點：' + lines.join('；'), S.meeting.dept === 'all' ? null : S.meeting.dept); }
H.endMeeting = silentEnd => {
  if (!S.meeting) return; const d = S.meeting.dept; S.meeting = null;
  H.agents.filter(a => a.activity === 'meeting').forEach(a => { interrupt(a); a.activity = 'returning'; H.goHome(a); });
  H.goTo(H.neon, H.neon.home);
  H.drawScreen('meet', g => { g.fillStyle = '#f37021'; g.font = H.screenFont(700, 30, 1); g.fillText('會議桌', 30, 60); g.fillStyle = '#9aa1ad'; g.font = H.screenFont(500, 22); g.fillText('目前沒有排定的會議', 30, 106); });
  if (!silentEnd) H.log('會議結束，大家回到座位', d === 'all' ? null : d); H.emit('meeting');
};

/* 任務與主要動作 */
const doneEffect = {
  sales: (a, t) => { if (t && t.deal){ const p = H.newProject(t.deal.who, t.deal.svc, t.deal.qty, a); H.say(a, `${t.deal.who} 成單！${H.money(p.amount)}`, '', 4000, true); H.log(`${a.name} 簽下 ${t.deal.who}：${H.svc(t.deal.svc).name} ×${p.qty}`, 'sales'); if (!H.silent){ S.notif++; H.emit('deal', {r:a, amt:p.amount, who:t.deal.who}); } const m = anyAt('creative'); H.orb(a, m, hex('sales')); } else { a.pending = (a.pending || 0) + 1; quote(a); } },
  creative: a => a.data ? insight(a) : script(a),
  production: a => { for (let i = 0; i < 2; i++) render(a); },
  growth: a => deliver(a),
};
H.doneEffect = doneEffect;
H.assignTask = (a, text, extra) => { a.tasks.unshift(Object.assign({text, until:S.simMin + rand(15, 40), auto:false}, extra)); if (a.tasks.length > 4) a.tasks.length = 4; H.say(a, '收到：' + text, '', 4500, true); H.log(`指派給 ${a.name}：${text}`, a.dept); if (H.selected === a.i) H.renderCard(); };
H.primary = a => {
  if (a.activity !== 'desk') return;
  if (a.dept === 'sales'){ a.pending = (a.pending || 0) + 1; H.say(a, '馬上回報價！', '', 3000, true); setTimeout(() => quote(a), H.dur(1800)); }
  if (a.dept === 'creative'){ if (a.data){ insight(a); H.say(a, '跑一輪話題雷達', '', 3000, true); } else if (!active('script').length) H.say(a, '目前沒有待寫的腳本', '', 3000, true); else { H.say(a, '這支腳本我現在寫', '', 3000, true); script(a); } }
  if (a.dept === 'production'){ if (!active('production').length){ H.say(a, '目前沒有在製專案', '', 3000, true); return; } H.say(a, '加速渲染！', '', 3000, true); for (let i = 0; i < 3; i++) render(a); }
  if (a.dept === 'growth'){ if (!active('qa').length){ H.say(a, '目前沒有待交付的案子', '', 3000, true); return; } deliver(a); }
  if (H.selected === a.i) H.renderCard();
};
function tickTasks(a){
  for (let i = a.tasks.length - 1; i >= 0; i--){ const t = a.tasks[i]; if (t.until > S.simMin) continue; a.tasks.splice(i, 1); if (!t.auto && atDesk(a)){ H.say(a, '完成：' + t.text, '', 4500, true); H.log(`${a.name} 完成「${t.text}」`, a.dept); doneEffect[a.dept](a, t); } }
  while (a.tasks.length < 2) a.tasks.push({text:H.fillTask(a.dept), until:S.simMin + rand(30, 110), auto:true});
}

/* 事件 */
H.triggerIncident = type => {
  if (S.incident) return; type = type || pick(Object.keys(H.INC));
  const d = H.INC[type]; S.incident = {type, until:S.simMin + d.mins, approved:false, ignored:false};
  if (type === 'flood') for (let i = 0; i < 6; i++) setTimeout(inquiry, i * H.dur(600));
  H.say(H.neon, d.title + '：' + d.proposal, 'ACE 偵測到事件', 7000, true); H.log('事件：' + d.title, d.dept); H.emit('incident');
};
H.resolveIncident = approve => {
  const inc = S.incident; if (!inc) return;
  if (!approve){ inc.ignored = true; H.log('Vito 暫不處理：' + H.INC[inc.type].title, H.INC[inc.type].dept); H.emit('incident'); return; }
  inc.approved = true; inc.until = S.simMin + 40;
  if (inc.type === 'trend'){ const kai = H.findAgent('Kai'); H.say(kai, '先出 3 支搶熱度！', '', 3500, true); }
  if (inc.type === 'redo') H.goLive(null, true);
  if (inc.type === 'flood') H.say(H.findAgent('Rin'), 'AI 報價表已自動回覆', '', 3500, true);
  if (inc.type === 'takedown') H.say(H.findAgent('Owen'), '文案改好重送審', '', 3500, true);
  H.log('核准：' + H.INC[inc.type].proposal, H.INC[inc.type].dept); H.emit('incident');
};
function endIncident(){ const inc = S.incident; S.incident = null; H.log('事件解除：' + H.INC[inc.type].title, H.INC[inc.type].dept); H.emit('incident'); }

/* 時鐘 */
function pushHist(){ const h = S.hist; h.t.push(S.simMin); h.revenue.push(M.growth.revenue); h.videos.push(M.production.videos); h.inquiries.push(M.sales.inquiries); h.views.push(M.growth.views); for (const k in h) if (h[k].length > 97) h[k].shift(); }
function newDay(){
  Object.assign(M.sales, {inquiries:0, quotes:0, orders:0, booked:0}); Object.assign(M.creative, {scripts:0, approved:0, revisions:0, insights:0}); Object.assign(M.production, {videos:0, renders:0}); Object.assign(M.growth, {delivered:0, revenue:0, views:0});
  for (const k in S.hist) S.hist[k] = [];
  H.agents.forEach(a => { const s = a.stats; for (const k of ['inquiries', 'quotes', 'orders', 'scripts', 'revisions', 'approved', 'insights', 'videos', 'renders', 'delivered', 'views', 'posts']) if (k in s) s[k] = 0; });
  H.log('新的一天，王牌團隊上線');
}
function minute(){
  S.simMin++; if (S.simMin % 1440 === 0) newDay();
  const live = !H.silent, h = S.simMin % 1440, office = h >= 9 * 60 && h <= 19 * 60;
  if (chance((office ? .07 : .02) * boost('inquiries'))) inquiry();
  H.agentsBy('sales').forEach(a => { if (atDesk(a) && a.pending && chance(.08)) quote(a); });
  H.agentsBy('creative').forEach(a => { if (!atDesk(a)) return; if (a.data){ if (chance(.012)) insight(a); } else if (chance(.1)) script(a); });
  H.agentsBy('production').forEach(a => { if (atDesk(a) && chance(.09)) render(a); });
  H.agentsBy('growth').forEach(a => { if (atDesk(a) && chance(.12)) deliver(a); });
  M.production.rendering = active('production').length;
  if (live){
    H.agents.forEach(a => { if (a.activity === 'break' && a.breakUntil <= S.simMin && !a.path.length) endBreak(a); else if (a.activity === 'live' && a.liveUntil <= S.simMin) H.goLive(a, false); else if (atDesk(a) && !S.meeting && chance(.0035)) takeBreak(a); tickTasks(a); });
    if ((h === 11 * 60 || h === 15 * 60) && !S.meeting) H.goLive(null, true);
    H.lifeTick && H.lifeTick(h);
    if (S.simMin % 50 === 0) patrolTick();
    if (S.simMin % 23 === 0 && chance(.6)) chatTick();
    if (!S.incident && chance(.0035)) H.triggerIncident();
    if (S.incident && S.simMin >= S.incident.until) endIncident();
  }
  if (S.simMin % 15 === 0) pushHist();
}
let acc = 0;
H.advance = dt => { if (!S.speed) return; acc += dt * S.speed; let n = 0; while (acc >= 1 && n++ < 30){ acc -= 1; minute(); } };
H.presim = until => { H.silent = true; while (S.simMin < until) minute(); H.silent = false; };
H.setSpeed = x => { S.speed = x; H.emit('speed'); };

/* KPI 與快照 */
H.kpi = () => {
  const sales = H.agentsBy('sales'), month = sales.reduce((s, r) => s + r.stats.sales, 0), target = H.BRAND.monthlyTarget;
  return {month, target, pct:Math.round(month / target * 100), today:M.growth.revenue, booked:M.sales.booked,
    inquiries:M.sales.inquiries, quotes:M.sales.quotes, orders:M.sales.orders, pending:sales.reduce((s, a) => s + (a.pending || 0), 0),
    scripts:M.creative.scripts, approved:M.creative.approved, revisions:M.creative.revisions, insights:M.creative.insights,
    videos:M.production.videos, inProd:active('production').length, queued:active('script').length, qa:active('qa').length,
    delivered:M.growth.delivered, views:M.growth.views, clients:M.growth.clients + S.projects.filter(p => p.stage === 'delivered').length};
};
H.snapshot = () => {
  const k = H.kpi(), ag = d => H.agentsBy(d).map(a => Object.assign({name:a.name, role:a.role, status:H.statusLabel(a), last:a.last}, a.stats));
  return JSON.stringify({company:H.BRAND.company + ' ' + H.BRAND.brand, time:H.fmtTime(S.simMin), kpi:k, services:H.SERVICES.map(s => `${s.name} NT$${s.price}/支 ${s.min}支起`),
    sales:ag('sales'), creative:ag('creative'), production:ag('production'), growth:ag('growth'),
    projects:S.projects.slice(0, 12).map(p => ({client:p.client, service:H.svc(p.svc).name, qty:p.qty, done:p.done, stage:p.stage, amount:p.amount, views:p.views})),
    incident:S.incident ? {title:H.INC[S.incident.type].title, desc:H.INC[S.incident.type].desc, proposal:H.INC[S.incident.type].proposal, approved:S.incident.approved} : null,
    meeting:S.meeting ? S.meeting.dept : null, recent:S.feed.slice(0, 10).map(f => f.t + ' ' + f.text)});
};
})();
