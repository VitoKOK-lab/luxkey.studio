/* AI 工作台：每位 AI 員工可用 Claude 產出真正的交付物；任務佇列、飛輪串接、每日報告 */
(() => {
const H = HQ, S = H.state, $ = H.$;
H.sample = null; H.toolsOK = false;
H.aiReady = new Promise(res => {
  if (window.claude && window.claude.use){
    window.claude.use('sample').then(async s => {
      H.sample = s;
      if (s){ const lim = await s.limits().catch(() => null); H.toolsOK = !!(lim && lim.tools); }
      $('#ai-state').textContent = `${H.BRAND.aiTitle} · ${s ? '由 Claude 驅動' : '示範模式'}`; res(s);
    });
  } else { $('#ai-state').textContent = `${H.BRAND.aiTitle} · 示範模式`; res(null); }
});
H.aiOff = () => { H.sample = null; $('#ai-state').textContent = `${H.BRAND.aiTitle} · 示範模式`; };

const BRAND = `公司：LUXKEY（品牌 A.C.E.，luxkey.com.tw），AI 短影音行銷公司，slogan「讓 AI 成為每個品牌的王牌」。十年行銷團隊 × AI 製作。服務與價格：AI 剪片 NT$300/支、AI 數字人 NT$2,000/支、狗血劇商品介紹（3 秒反轉的劇情廣告）NT$3,500/支、真人推薦影片；每種 10 支起訂、未稅；同一批沿用同一組角色與風格。流程：LINE 討論 → 提供素材 → 生成前確認（腳本、角色、畫面確認好才製作）→ 製作交片（可直接上架的直式影片）。調性：直白、懂商業、不割韭菜、懂行銷懂商業會用 AI。`;
/* 各角色的產出定義：標題、提示、離線範本 */
H.JOBS = {
  sales: {label:'生成 LINE 報價回覆', build:a => `${BRAND}\n你是「${a.name}」（${a.role}）。客戶「${H.pick(H.CLIENTS)}」在 LINE 問：想做短影音推新品，預算有限，問多少錢、怎麼開始。寫一則 LINE 回覆（繁體中文，150 字內）：先問清楚產品與想講的重點，給出適合的方案與價格、10 支起訂與流程，口吻像朋友、直接、不推銷。不要 Markdown。`,
    offline:a => `老闆你好！新品推短影音的話，我建議先做「AI 剪片」：一支 NT$300、10 支起，外面行情 1,500。你把商品照跟想講的 2–3 個重點丟給我，我們先出腳本跟畫面方向，確認好才製作，交的是可以直接上架的直式影片。要衝轉換的話可以混 2 支「狗血劇商品介紹」（NT$3,500，3 秒反轉）。方便的話先告訴我產品是什麼？——${a.name}`},
  creative: {label:'生成短影音腳本', labelFor:a => a.data ? '生成話題洞察 ×3' : '生成 30 秒腳本', build:a => a.data
      ? `${BRAND}\n你是「${a.name}」（${a.role}）。根據以下即時數據與熱門話題，寫 3 條可執行的洞察（每條 40 字內，標明給哪個部門），繁體中文，不要 Markdown：\n${H.snapshot().slice(0, 6000)}`
      : `${BRAND}\n你是「${a.name}」（${a.role}）。客戶「${H.pick(H.CLIENTS)}」，主題「${H.pick(H.TOPICS)}」，服務「狗血劇商品介紹」。寫一支 30 秒直式短影音腳本（繁體中文）：標題鉤子（前 3 秒反轉）、分鏡 1–5（秒數｜畫面｜口白｜字幕）、片尾 CTA。總長 250 字內，不要 Markdown 標題。`,
    offline:a => a.data ? `1. 給策劃：3 秒反轉的完播率高 2.3 倍，狗血劇腳本都從反轉開場。\n2. 給製作：數字人配真人口白轉換最好，Mina 的案子加真人旁白。\n3. 給業務：牛排主題在雙北互動最高，餐飲客戶主推 AI 剪片 ×10。` : `【牛排幾分熟怎麼分｜30 秒】\n鉤子：老闆娘把整盤牛排倒進垃圾桶——「這種熟度我不賣。」\n0–3s｜倒牛排慢動作｜「客人點五分熟，端出來是七分。」\n3–10s｜切面特寫｜「三分、五分、七分，看這個粉紅帶。」\n10–20s｜老闆娘拿溫度計｜「我們每一塊都量，差 2 度就重煎。」\n20–27s｜客人一口下去閉眼｜字幕：赤身牛排館・只賣對的熟度\n27–30s｜Logo＋地址｜「今晚來，我幫你煎對。」`},
  production: {label:'生成製作指令清單', build:a => `${BRAND}\n你是「${a.name}」（${a.role}）。根據客戶「${H.pick(H.CLIENTS)}」的腳本主題「${H.pick(H.TOPICS)}」，寫一份 AI 製作指令清單（繁體中文，200 字內）：畫面生成提示（風格、鏡頭、光線）、數字人設定（角色種子、語速、口型）、剪輯節奏（切點秒數、字幕字級、BGM）、交付規格（9:16、長度、檔名）。不要 Markdown。`,
    offline:a => `畫面：日系餐飲紀實風、35mm 手持、暖色逆光、淺景深；主體牛排切面特寫 3 秒。\n數字人：角色種子 ACE-07 鎖定、語速 0.9x、口型對齊中文、服裝黑圍裙。\n剪輯：0.8 秒一切點、字幕 64px 白字黑邊、BGM 副歌只用前 8 秒、片尾 2 秒 Logo。\n交付：9:16、28–30 秒、MP4 H.264、檔名 赤身牛排_幾分熟_v1。`},
  growth: {label:'生成上架文案與交片說明', build:a => `${BRAND}\n你是「${a.name}」（${a.role}）。客戶「${H.pick(H.CLIENTS)}」的 10 支短影音交付了。寫：1) 交片說明（給客戶，80 字內，含上架建議時間與順序）2) 3 則上架文案（各 40 字內，含 hashtag）3) 一句 7 日成效回報的開場白。繁體中文，不要 Markdown。`,
    offline:a => `交片說明：10 支直式影片已上傳雲端，建議週四 21:00 先上「幾分熟」那支，之後隔天一支，第 3 支之後開始投放。\n\n文案 1：客人點五分，端出七分？我們每塊都量溫度 🌡️ #赤身牛排 #台北美食\n文案 2：老闆娘把整盤牛排倒掉，只因為差 2 度。 #牛排 #幾分熟\n文案 3：今晚來，我幫你煎對。 #晚餐 #台北牛排\n\n成效回報：老闆，第一支上線 7 天破 5 萬觀看，這是數據截圖，我們下一批可以這樣加碼——`},
};

/* 佇列：一次只跑一件，顯示在工作台 */
const queue = []; let running = false;
H.runs = [];
function render(){
  const box = $('#wb-list'); if ($('#workbench').hidden) return;
  box.innerHTML = H.runs.slice(0, 12).map(r => `<article class="run ${r.state}" style="--dc:var(--d-${r.dept})">
    <header><span class="avatar">${r.name[0]}</span><div><b>${r.name}</b><small>${r.label}</small></div><span class="rs">${{queued:'排隊中', running:'產出中…', done:'完成', error:'失敗'}[r.state]}</span></header>
    <pre>${r.text.replace(/[<>&]/g, c => ({'<':'&lt;', '>':'&gt;', '&':'&amp;'})[c])}</pre>
    ${r.state === 'done' ? `<div class="run-act"><button class="chip" data-copy="${r.id}">複製</button><button class="chip" data-apply="${r.id}">套用到飛輪</button>${r.next ? `<button class="chip" data-next="${r.id}">交給${r.next}</button>` : ''}</div>` : ''}
  </article>`).join('') || '<p class="empty">還沒有產出。點任一位夥伴的「AI 產出」，或按上方「王牌流程 ×4」。</p>';
  $('#wb-count').textContent = queue.length + (running ? 1 : 0);
}
H.renderWorkbench = render;
H.enqueue = (a, opts = {}) => {
  const job = H.JOBS[a.dept];
  const run = {id:Date.now() + Math.random(), agent:a, name:a.name, dept:a.dept, label:opts.label || (job.labelFor ? job.labelFor(a) : job.label), prompt:opts.prompt || job.build(a), offline:() => job.offline(a), state:'queued', text:'', next:opts.next || null, onDone:opts.onDone};
  H.runs.unshift(run); queue.push(run); render(); pump();
  return run;
};
async function pump(){
  if (running || !queue.length) return;
  running = true; const r = queue.shift(); r.state = 'running'; const a = r.agent;
  const prev = a.status; H.setStatus(a, 'ai'); H.say(a, 'AI 產出中…', '', 2500, true); render();
  await H.aiReady;
  try {
    if (!H.sample) throw {code:'offline'};
    const ctl = new AbortController(); r.abort = () => ctl.abort();
    const {text} = await H.sample(r.prompt, {modelTier:'quick', cache:false, signal:ctl.signal, onText:({text}) => { r.text = text; render(); }});
    r.text = text.trim();
  } catch (e){
    if (e.code === 'not_granted' || e.code === 'sampling_disabled') H.aiOff();
    r.text = r.offline(); r.demo = true;
  }
  r.state = 'done'; a.status = prev === 'ai' ? 'working' : prev; a.statusUntil = 0;
  a.last = '完成 AI 產出：' + r.label; H.say(a, '產出完成：' + r.label, '', 4000, true); H.log(`${a.name} 完成「${r.label}」`, a.dept);
  if (H.selected === a.i) H.renderCard();
  running = false; render(); r.onDone && r.onDone(r); pump();
}
H.applyRun = r => { H.doneEffect[r.dept](r.agent); H.toast(`${r.name} 的產出已投入流程`); };

/* 飛輪一鍵串接：內容腳本 → 投放文案 → 導購回覆 → 會員推播，上一站產出餵給下一站 */
H.flywheelRun = () => {
  const s = H.pick(H.agentsBy('sales')), c = H.agentsBy('creative').find(x => !x.data), p = H.pick(H.agentsBy('production')), g = H.agentsBy('growth')[0];
  const client = H.pick(H.CLIENTS), topic = H.pick(H.TOPICS);
  H.log(`Ace 啟動王牌流程：${s.name} → ${c.name} → ${p.name} → ${g.name}（${client}）`);
  H.enqueue(s, {label:`流程 1/4 LINE 報價（${client}）`, prompt:`${BRAND}\n你是「${s.name}」（${s.role}）。客戶「${client}」在 LINE 說想做「${topic}」主題的短影音。寫一則 LINE 回覆（150 字內）：推薦方案、價格、10 支起訂與流程，並問清楚產品重點。繁體中文，不要 Markdown。`, next:'腳本策劃', onDone:r1 => {
    H.orb(s, c, H.DEPTS.sales.hex);
    H.enqueue(c, {label:'流程 2/4 30 秒腳本', prompt:`${BRAND}\n你是「${c.name}」（${c.role}）。根據業務與客戶「${client}」的往來，寫一支 30 秒直式短影音腳本（主題「${topic}」，前 3 秒反轉；分鏡：秒數｜畫面｜口白｜字幕；片尾 CTA），250 字內，繁體中文，不要 Markdown：\n${r1.text.slice(0, 1200)}`, next:'AI 製作', onDone:r2 => {
      H.orb(c, p, H.DEPTS.creative.hex);
      H.enqueue(p, {label:'流程 3/4 製作指令', prompt:`${BRAND}\n你是「${p.name}」（${p.role}）。把這支腳本轉成 AI 製作指令清單（畫面提示、數字人設定、剪輯節奏、交付規格），200 字內，繁體中文，不要 Markdown：\n${r2.text.slice(0, 1500)}`, next:'交付成長', onDone:r3 => {
        H.orb(p, g, H.DEPTS.production.hex);
        H.enqueue(g, {label:'流程 4/4 上架文案', prompt:`${BRAND}\n你是「${g.name}」（${g.role}）。客戶「${client}」這批影片交付了。寫交片說明（80 字內）＋3 則上架文案（含 hashtag）＋一句成效回報開場白，繁體中文，不要 Markdown。背景：\n${r3.text.slice(0, 800)}`, onDone:() => { H.orb(g, c, H.DEPTS.growth.hex); H.toast('王牌流程完成：4 站產出都在工作台'); H.log('王牌流程完成，成效回報回到策劃', 'growth'); }});
      }});
    }});
  }});
};
/* 全員衝刺：每部門各挑 1 人 */
H.sprint = () => { H.DEPT_IDS.forEach(d => H.enqueue(H.pick(H.agentsBy(d).filter(a => a.activity === 'desk')) || H.agentsBy(d)[0])); H.toast('已排入 4 件 AI 產出'); };
/* 每日飛輪報告 */
H.dailyReport = () => {
  const z = H.neon;
  const run = {id:Date.now(), agent:z, name:H.BRAND.ai, dept:'production', label:'每日王牌日報', state:'queued', text:'',
    prompt:`${BRAND}\n你是 ${H.BRAND.aiTitle} ${H.BRAND.ai}。根據即時數據寫一份給老闆 Vito 的每日日報（繁體中文，200 字內）：客戶／策劃／製作／交付各一句現況、一個最大瓶頸、三個明天的行動。不要 Markdown 標題。\n${H.snapshot().slice(0, 8000)}`,
    offline:() => { const k = H.kpi(); return `王牌日報 ${H.fmtTime(S.simMin)}\n客戶：詢問 ${k.inquiries}、成單 ${k.orders}。\n策劃：腳本 ${k.scripts}、確認 ${k.approved}、改稿 ${k.revisions}。\n製作：出片 ${k.videos} 支、在製 ${k.inProd} 件。\n交付：${k.delivered} 支、入帳 ${H.money(k.today)}。\n瓶頸：待腳本 ${k.queued} 件卡在確認。\n明天：1. 先清腳本確認 2. 熱門話題先出 3 支 3. 回報 7 日成效談續約。`; }};
  H.runs.unshift(run); queue.push(run); render(); pump();
  return run;
};
async function pump(){
  if (running || !queue.length) return;
  running = true; const r = queue.shift(); r.state = 'running'; const a = r.agent;
  const prev = a.status; H.setStatus(a, 'ai'); H.say(a, 'AI 產出中…', '', 2500, true); render();
  await H.aiReady;
  try {
    if (!H.sample) throw {code:'offline'};
    const ctl = new AbortController(); r.abort = () => ctl.abort();
    const {text} = await H.sample(r.prompt, {modelTier:'quick', cache:false, signal:ctl.signal, onText:({text}) => { r.text = text; render(); }});
    r.text = text.trim();
  } catch (e){
    if (e.code === 'not_granted' || e.code === 'sampling_disabled') H.aiOff();
    r.text = r.offline(); r.demo = true;
  }
  r.state = 'done'; a.status = prev === 'ai' ? 'working' : prev; a.statusUntil = 0;
  a.last = '完成 AI 產出：' + r.label; H.say(a, '產出完成：' + r.label, '', 4000, true); H.log(`${a.name} 完成「${r.label}」`, a.dept);
  if (H.selected === a.i) H.renderCard();
  running = false; render(); r.onDone && r.onDone(r); pump();
}
H.applyRun = r => { H.doneEffect[r.dept](r.agent); H.toast(`${r.name} 的產出已投入流程`); };

/* 飛輪一鍵串接：內容腳本 → 投放文案 → 導購回覆 → 會員推播，上一站產出餵給下一站 */
H.flywheelRun = () => {
  const s = H.pick(H.agentsBy('sales')), c = H.agentsBy('creative').find(x => !x.data), p = H.pick(H.agentsBy('production')), g = H.agentsBy('growth')[0];
  const client = H.pick(H.CLIENTS), topic = H.pick(H.TOPICS);
  H.log(`Ace 啟動王牌流程：${s.name} → ${c.name} → ${p.name} → ${g.name}（${client}）`);
  H.enqueue(s, {label:`流程 1/4 LINE 報價（${client}）`, prompt:`${BRAND}\n你是「${s.name}」（${s.role}）。客戶「${client}」在 LINE 說想做「${topic}」主題的短影音。寫一則 LINE 回覆（150 字內）：推薦方案、價格、10 支起訂與流程，並問清楚產品重點。繁體中文，不要 Markdown。`, next:'腳本策劃', onDone:r1 => {
    H.orb(s, c, H.DEPTS.sales.hex);
    H.enqueue(c, {label:'流程 2/4 30 秒腳本', prompt:`${BRAND}\n你是「${c.name}」（${c.role}）。根據業務與客戶「${client}」的往來，寫一支 30 秒直式短影音腳本（主題「${topic}」，前 3 秒反轉；分鏡：秒數｜畫面｜口白｜字幕；片尾 CTA），250 字內，繁體中文，不要 Markdown：\n${r1.text.slice(0, 1200)}`, next:'AI 製作', onDone:r2 => {
      H.orb(c, p, H.DEPTS.creative.hex);
      H.enqueue(p, {label:'流程 3/4 製作指令', prompt:`${BRAND}\n你是「${p.name}」（${p.role}）。把這支腳本轉成 AI 製作指令清單（畫面提示、數字人設定、剪輯節奏、交付規格），200 字內，繁體中文，不要 Markdown：\n${r2.text.slice(0, 1500)}`, next:'交付成長', onDone:r3 => {
        H.orb(p, g, H.DEPTS.production.hex);
        H.enqueue(g, {label:'流程 4/4 上架文案', prompt:`${BRAND}\n你是「${g.name}」（${g.role}）。客戶「${client}」這批影片交付了。寫交片說明（80 字內）＋3 則上架文案（含 hashtag）＋一句成效回報開場白，繁體中文，不要 Markdown。背景：\n${r3.text.slice(0, 800)}`, onDone:() => { H.orb(g, c, H.DEPTS.growth.hex); H.toast('王牌流程完成：4 站產出都在工作台'); H.log('王牌流程完成，成效回報回到策劃', 'growth'); }});
      }});
    }});
  }});
};
/* 全員衝刺：每部門各挑 1 人 */
H.sprint = () => { H.DEPT_IDS.forEach(d => H.enqueue(H.pick(H.agentsBy(d).filter(a => a.activity === 'desk')) || H.agentsBy(d)[0])); H.toast('已排入 4 件 AI 產出'); };
/* 每日飛輪報告 */
H.dailyReport = () => {
  const z = H.neon;
  const run = {id:Date.now(), agent:z, name:H.BRAND.ai, dept:'production', label:'每日王牌日報', state:'queued', text:'',
    prompt:`${BRAND}\n你是 ${H.BRAND.aiTitle} ${H.BRAND.ai}。根據即時數據寫一份給老闆 Vito 的每日日報（繁體中文，200 字內）：客戶／策劃／製作／交付各一句現況、一個最大瓶頸、三個明天的行動。不要 Markdown 標題。\n${H.snapshot().slice(0, 8000)}`,
    offline:() => { const k = H.kpi(); return `飛輪日報 ${H.fmtTime(S.simMin)}\n內容：素材 ${k.videos} 支、觀看 ${k.views.toLocaleString('en-US')}。\n流量：名單 ${k.leads}、ROAS ${k.roas.toFixed(1)}x。\n成交：營收 ${H.money(k.today)}、訂單 ${k.orders}。\n會員：回購 ${k.repurchase}、UGC ${k.ugc}。\n瓶頸：購物車 ${k.carts} 台待追。\n明天：1. 追購物車 2. 加碼最佳活動 3. 邀 UGC。`; }};
  H.runs.unshift(run); queue.push(run); render(); pump();
};
$('#workbench').addEventListener('click', async e => {
  const b = e.target.closest('[data-copy],[data-apply],[data-next]'); if (!b) return;
  const r = H.runs.find(x => String(x.id) === (b.dataset.copy || b.dataset.apply || b.dataset.next)); if (!r) return;
  if (b.dataset.copy){ try { await navigator.clipboard.writeText(r.text); H.toast('已複製'); } catch (_){ const sel = getSelection(), rg = document.createRange(); rg.selectNodeContents(b.closest('.run').querySelector('pre')); sel.removeAllRanges(); sel.addRange(rg); H.toast('已選取文字，請按 ⌘C'); } }
  if (b.dataset.apply) H.applyRun(r);
  if (b.dataset.next){ const nd = H.DEPTS[r.dept].next, to = H.pick(H.agentsBy(nd)); H.orb(r.agent, to, H.DEPTS[r.dept].hex); H.enqueue(to, {label:`接手 ${r.name} 的${r.label}`, prompt:`${BRAND}\n你是「${to.name}」（${to.role}）。上一站 ${r.name}（${H.DEPTS[r.dept].name}）交來這份產出，請用你的角色接力，產出你這一站的交付物（繁體中文，200 字內，不要 Markdown）：\n${r.text.slice(0, 1500)}`}); }
});
$('#wb-sprint').onclick = H.sprint; $('#wb-flywheel').onclick = H.flywheelRun; $('#wb-report').onclick = H.dailyReport;
$('#wb-clear').onclick = () => { H.runs = H.runs.filter(r => r.state === 'running' || r.state === 'queued'); render(); };
})();
