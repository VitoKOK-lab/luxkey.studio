/* Ace 對話：Claude（sample capability）＋ 離線回答 */
(() => {
const H = HQ, S = H.state, $ = H.$;
const AI = H.BRAND.ai;
const RULES = `你是 ${AI}，LUXKEY（品牌 A.C.E.，luxkey.com.tw，slogan「讓 AI 成為每個品牌的王牌」）的 ${H.BRAND.aiTitle}。這是一間 AI 短影音行銷公司：十年行銷團隊 × AI 製作，服務 AI 剪片 NT$300/支、AI 數字人 NT$2,000/支、狗血劇商品介紹 NT$3,500/支、真人推薦影片，每種 10 支起訂、未稅；流程 LINE 討論 → 提供素材 → 生成前確認 → 製作交片。你帶 8 位夥伴：客戶接洽 Jo、Rin；腳本策劃 Mira、成效分析 Aria；AI 製作 Kai（剪片）、Mina（數字人）、Leo（劇情／真人）；交付成長 Owen。老闆是 Vito。用繁體中文回答，直白、懂商業、給可執行建議，最多 7 行，不用 Markdown 標題。每則訊息後附上即時資料（JSON），只根據資料回答，不捏造數字。可用工具時主動使用：看某人 focus_agent、看部門 focus_department、開會 call_meeting、指派 assign_task、處理事件 handle_incident、調速 set_speed、要夥伴產出交付物 ai_generate、跑完整王牌流程 flywheel_run、數字人進棚 go_live、日報 daily_report、建立新案 new_project。`;
const DE = ['sales', 'creative', 'production', 'growth'];
const need = (a, n) => { if (!a) throw new Error('找不到夥伴 ' + n); return a; };
const TOOLS = [
  {name:'focus_agent', description:'把 3D 鏡頭移到某位夥伴並打開資訊卡，回傳他的資料。', inputSchema:{type:'object', properties:{name:{type:'string', description:'英文名，例如 Kai'}}, required:['name']},
   execute:({name}) => { const a = need(H.findAgent(name), name); H.openCard(a.i); return Object.assign({name:a.name, dept:a.dept, role:a.role}, a.stats); }},
  {name:'focus_department', description:'切換部門視角與 KPI。dept: sales 客戶接洽, creative 腳本策劃, production AI 製作, growth 交付成長, all 全公司。', inputSchema:{type:'object', properties:{dept:{type:'string', enum:[...DE, 'all']}}, required:['dept']},
   execute:({dept}) => { if (![...DE, 'all'].includes(dept)) throw new Error('未知部門'); H.setDept(dept); return '已切換'; }},
  {name:'call_meeting', description:'召開會議：all 是全員站會（Chill Zone），其他是部門會議（會議桌）。', inputSchema:{type:'object', properties:{dept:{type:'string', enum:[...DE, 'all']}}, required:['dept']},
   execute:({dept}) => { H.callMeeting(dept); return '會議已召開'; }},
  {name:'end_meeting', description:'結束目前會議，大家回座位。', execute:() => { H.endMeeting(); return '已結束'; }},
  {name:'assign_task', description:'指派一項工作給某位夥伴，他會在幾十分鐘內完成並產生對應成果。', inputSchema:{type:'object', properties:{name:{type:'string'}, task:{type:'string'}}, required:['name', 'task']},
   execute:({name, task}) => { const a = need(H.findAgent(name), name); H.assignTask(a, String(task).slice(0, 40)); return '已指派給 ' + a.name; }},
  {name:'new_project', description:'建立新案：client 客戶名、service 服務 id（cut 剪片 / avatar 數字人 / drama 狗血劇 / ugc 真人推薦）、qty 支數（10 起）。', inputSchema:{type:'object', properties:{client:{type:'string'}, service:{type:'string', enum:['cut', 'avatar', 'drama', 'ugc']}, qty:{type:'number'}}, required:['client', 'service']},
   execute:({client, service, qty}) => { const a = H.findAgent('Jo'); const p = H.newProject(String(client).slice(0, 20), H.svc(service) ? service : 'cut', Number(qty) || 10, a); H.log(`Ace 建立新案 ${p.client}：${H.svc(p.svc).name} ×${p.qty}`, 'sales'); H.openCard(a.i); return `已建立：${p.client} ${H.svc(p.svc).name} ×${p.qty}，${H.money(p.amount)}`; }},
  {name:'ai_generate', description:'讓某位夥伴用 AI 產出他角色的交付物（業務：LINE 報價回覆；策劃：30 秒腳本或話題洞察；製作：AI 製作指令清單；交付：上架文案與交片說明）。可選 brief 補充需求。產出會出現在 AI 工作台。', inputSchema:{type:'object', properties:{name:{type:'string'}, brief:{type:'string'}}, required:['name']},
   execute:({name, brief}) => { const a = need(H.findAgent(name), name); const job = H.JOBS[a.dept]; H.enqueue(a, brief ? {prompt:job.build(a) + '\n老闆補充需求：' + String(brief).slice(0, 300)} : {}); H.showDrawer('workbench'); return `${a.name} 開始產出`; }},
  {name:'flywheel_run', description:'跑一輪完整王牌流程：LINE 報價 → 30 秒腳本 → 製作指令 → 上架文案，四站接力產出。', execute:() => { H.flywheelRun(); H.showDrawer('workbench'); return '王牌流程已啟動'; }},
  {name:'daily_report', description:'產出今日日報到工作台。', execute:() => { H.dailyReport(); H.showDrawer('workbench'); return '日報產出中'; }},
  {name:'go_live', description:'讓 Mina 進攝影棚錄製數字人（on=true）或收棚（false）。', inputSchema:{type:'object', properties:{on:{type:'boolean'}}, required:['on']},
   execute:({on}) => { H.goLive(null, !!on); return on ? 'Mina 進棚' : 'Mina 收棚'; }},
  {name:'handle_incident', description:'處理目前事件：approve=true 執行建議方案，false 暫不處理。', inputSchema:{type:'object', properties:{approve:{type:'boolean'}}, required:['approve']},
   execute:({approve}) => { if (!S.incident) throw new Error('目前沒有事件'); H.resolveIncident(!!approve); return approve ? '已核准' : '已暫緩'; }},
  {name:'set_speed', description:'設定模擬速度：0 暫停、1、4、12 倍速。', inputSchema:{type:'object', properties:{speed:{type:'number', enum:[0, 1, 4, 12]}}, required:['speed']},
   execute:({speed}) => { H.setSpeed([0, 1, 4, 12].includes(+speed) ? +speed : 1); return '速度 ' + S.speed; }},
];

const turns = [];
function addMsg(cls, text){ const d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = text; $('#msgs').append(d); $('#msgs').scrollTop = 1e9; return d; }
['今天公司狀況？', '哪一站卡住了？', '跑一輪王牌流程', '請 Mira 寫一支腳本', '幫赤身牛排建 10 支剪片', '召開站會'].forEach(c => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = c; b.onclick = () => H.ask(c); $('#chips').append(b);
});
let greeted = false, ctl = null;
H.openChat = () => {
  H.showDrawer('chat');
  if (!greeted){ greeted = true; addMsg('a', `嗨 Vito，我是 ${AI}。詢問、腳本、製作、交付四站我都盯著，要我叫夥伴產出、開會、建案或處理事件，直接說。`); }
  setTimeout(() => $('#q').focus(), 50);
};
$('#compose').addEventListener('submit', e => {
  e.preventDefault(); if (ctl){ ctl.abort(); return; }
  const q = $('#q').value.trim(); if (q){ $('#q').value = ''; H.ask(q); }
});
H.ask = async q => {
  H.openChat(); addMsg('u', q);
  const bubble = addMsg('a', '思考中…');
  H.neonLine = 'Vito 問：' + q;
  await H.aiReady;
  if (!H.sample){ await new Promise(r => setTimeout(r, 450)); bubble.textContent = offline(q); turns.push({role:'user', content:q}, {role:'assistant', content:bubble.textContent}); return; }
  ctl = new AbortController(); $('#send').textContent = '停止';
  const input = [{role:'user', content:RULES}, ...turns.slice(-8), {role:'user', content:q + '\n\n[即時公司資料]\n' + H.snapshot()}];
  try {
    const opts = {signal:ctl.signal, onText:({text}) => { bubble.textContent = text; $('#msgs').scrollTop = 1e9; }};
    if (H.toolsOK){ opts.tools = TOOLS; opts.modelTier = 'quick'; } else opts.cache = false;
    const {text, truncated} = await H.sample(input, opts);
    bubble.textContent = text + (truncated ? '\n（回答被截斷）' : '');
    turns.push({role:'user', content:q}, {role:'assistant', content:text});
    H.neonLine = text.replace(/\s+/g, ' ').slice(0, 120);
  } catch (e){
    bubble.textContent = e.text || '';
    const why = {cancelled:'', not_granted:'你沒有允許這個頁面使用 Claude，改用示範模式回答。', sampling_disabled:'這個帳號無法使用 Claude，改用示範模式。', rate_limited:'Claude 目前忙碌或已達用量上限，稍後再試。', refused:`${AI} 無法回答這個問題，換個問法試試。`}[e.code];
    if (e.code === 'not_granted' || e.code === 'sampling_disabled'){ H.aiOff(); bubble.textContent = offline(q); }
    if (why) addMsg('sys', why); else if (why === undefined) addMsg('sys', '連線中斷，請再試一次。');
    if (!bubble.textContent) bubble.remove();
  } finally { ctl = null; $('#send').textContent = '送出'; }
};

function offline(q){
  const k = H.kpi();
  if (/流程|一輪|整條|串接/.test(q)){ H.flywheelRun(); H.showDrawer('workbench'); return '王牌流程啟動：LINE 報價 → 30 秒腳本 → 製作指令 → 上架文案，四站接力，產出都在 AI 工作台。'; }
  const nm = q.match(/幫\s*(\S+?)\s*建\s*(\d+)?\s*支?\s*(剪片|數字人|狗血劇|真人)/); if (nm){ const svc = {剪片:'cut', 數字人:'avatar', 狗血劇:'drama', 真人:'ugc'}[nm[3]]; const p = H.newProject(nm[1], svc, +nm[2] || 10, H.findAgent('Jo')); H.openCard(H.findAgent('Jo').i); return `已建立 ${p.client} 的 ${H.svc(svc).name} ×${p.qty}（${H.money(p.amount)}），Mira 會先寫腳本做生成前確認。`; }
  const m = q.match(/請\s*([A-Za-z]+)\s*(寫|做|生成|產出)/); if (m && H.findAgent(m[1])){ const a = H.findAgent(m[1]); H.enqueue(a); H.showDrawer('workbench'); return `${a.name} 開始產出，完成後會出現在工作台。`; }
  if (/報告|日報/.test(q)){ H.dailyReport(); H.showDrawer('workbench'); return '今日日報產出中，請看工作台。'; }
  if (/全員|站會|大會/.test(q)){ H.callMeeting('all'); return '好，全員到 Chill Zone 集合。到齊後我會報告今日重點。'; }
  if (/會議/.test(q)){ const d = /策劃|腳本/.test(q) ? 'creative' : /製作/.test(q) ? 'production' : /交付|成長/.test(q) ? 'growth' : 'sales'; H.callMeeting(d); return `已召開${H.DEPTS[d].name}會議。`; }
  if (/數字人|進棚|錄/.test(q)){ H.goLive(null, true); return 'Mina 進棚錄數字人，角色種子鎖定。'; }
  if (/卡|瓶頸|幫忙|問題/.test(q)){
    const out = [];
    if (k.pending > 5) out.push(`客戶接洽：${k.pending} 則 LINE 待回，先回 10 支以上的`);
    if (k.queued > 2) out.push(`腳本策劃：${k.queued} 件卡在生成前確認，Mira 今天先清`);
    if (k.inProd > 4) out.push(`AI 製作：${k.inProd} 件在製，Kai 先出每案前 3 支`);
    if (k.qa > 0) out.push(`交付：${k.qa} 件等 Owen 驗收上架`);
    if (!out.length) out.push('目前四站都順，可以去接新案');
    return '目前的瓶頸：\n' + out.map((s, i) => `${i + 1}. ${s}`).join('\n');
  }
  if (S.incident && /事件|處理|核准/.test(q)){ const d = H.INC[S.incident.type]; return `現在的事件是「${d.title}」：${d.desc}\n我的建議：${d.proposal}。按橫幅的「核准執行」就會開始。`; }
  return `現在 ${H.fmtTime(S.simMin)}，公司概況：\n· 客戶：LINE 詢問 ${k.inquiries}，報價 ${k.quotes}，成單 ${k.orders}\n· 策劃：腳本 ${k.scripts}，確認 ${k.approved}，改稿 ${k.revisions}\n· 製作：出片 ${k.videos} 支，在製 ${k.inProd} 件\n· 交付：${k.delivered} 支，入帳 ${H.money(k.today)}，本月 ${k.pct}%`;
}

H.coach = async a => {
  let tip;
  try {
    await H.aiReady; if (!H.sample) throw 0;
    tip = (await H.sample(`你是 LUXKEY A.C.E.（AI 短影音行銷公司）的 ${H.BRAND.aiTitle} ${AI}。根據這位夥伴的資料，給他一句 30 字以內、具體可執行的繁體中文建議，只輸出那句話，不加引號：\n${JSON.stringify(Object.assign({name:a.name, dept:H.DEPTS[a.dept].name, role:a.role, last:a.last}, a.stats))}`, {modelTier:'quick', cache:false})).text.trim();
  } catch (e){ tip = H.pick(H.COACH[a.dept]).replace('{c}', H.pick(H.CLIENTS)); }
  a.quote = tip; H.say(a, tip, 'ACE → ' + a.name.toUpperCase(), 6000, true);
  H.neonLine = '給 ' + a.name + '：' + tip; H.log(AI + ' 輔導 ' + a.name, a.dept);
  return tip;
};
})();
