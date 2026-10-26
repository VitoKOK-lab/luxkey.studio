/* 飛輪 HQ — analytics drawer, activity feed, minimap, zone labels, wall screens */
(() => {
const H = HQ, S = H.state, $ = H.$;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'})[c]);
const dvar = d => `var(--d-${d})`;

/* charts */
function lineChart(vals, ts, color, fmt){
  if (vals.length < 2) return '<p class="empty">資料累積中，稍待幾分鐘。</p>';
  const W = 360, Hh = 130, l = 44, r = 10, t = 12, b = 22, max = Math.max(...vals) * 1.12 || 1;
  const x = i => l + i / (vals.length - 1) * (W - l - r), y = v => t + (1 - v / max) * (Hh - t - b);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  let g = '';
  for (const f of [0, .5, 1]){ const v = max * f / 1.12; g += `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${l - 6}" y="${y(v) + 3}" text-anchor="end" class="ax">${esc(fmt(v))}</text>`; }
  const n = vals.length - 1;
  return `<svg viewBox="0 0 ${W} ${Hh}" class="chart" role="img" aria-label="趨勢圖">${g}
    <polygon points="${l},${y(0)} ${pts} ${x(n)},${y(0)}" fill="${color}" opacity=".12"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="${x(n)}" cy="${y(vals[n])}" r="4" fill="${color}" stroke="var(--panel)" stroke-width="2"/>
    <text x="${l}" y="${Hh - 4}" class="ax">${H.fmtTime(ts[0])}</text><text x="${W - r}" y="${Hh - 4}" text-anchor="end" class="ax">${H.fmtTime(ts[n])}</text></svg>`;
}
function spark(vals, color){
  if (vals.length < 2) return '';
  const W = 120, Hh = 30, max = Math.max(...vals) || 1, pts = vals.map((v, i) => `${(i / (vals.length - 1) * W).toFixed(1)},${(Hh - 2 - v / max * (Hh - 4)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${Hh}" class="spark"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}
const bars = (rows, color) => rows.map(rw => `<button class="li" data-agent="${rw.i ?? ''}"><span class="nm">${esc(rw.name)}</span><span class="bar"><i style="width:${Math.min(100, rw.pct)}%;background:${color}"></i></span><span class="num v">${esc(rw.val)}</span></button>`).join('');
const stat = (label, val, cls = '') => `<div class="stat"><small>${label}</small><b class="num ${cls}">${val}</b></div>`;

const TABS = [['all', '總覽'], ['sales', '客戶'], ['creative', '策劃'], ['production', '製作'], ['growth', '交付']];
let tab = 'all';
H.renderAnalytics = () => {
  const box = $('#an-body'); if ($('#analytics').hidden) return;
  $('#an-tabs').innerHTML = TABS.map(([id, n]) => `<button class="seg ${id === tab ? 'on' : ''}" data-tab="${id}">${n}</button>`).join('');
  const k = H.kpi(), h = S.hist, M = S.m;
  let html = '';
  const P = S.projects, stageName = {script:'腳本確認', production:'製作中', qa:'待交付', delivered:'已交付'};
  const projRows = list => `<div class="tbl">${list.slice(0, 8).map(p => `<div class="tr"><div class="nm"><b>${esc(p.client)} · ${esc(H.svc(p.svc).suit + ' ' + H.svc(p.svc).name)}</b><small>${stageName[p.stage]}${p.views ? ' · ' + p.views.toLocaleString('en-US') + ' 觀看' : ''}</small></div><span class="num">${p.done}/${p.qty} 支</span><span class="bar"><i style="width:${p.done / p.qty * 100}%;background:${dvar('production')}"></i></span><span class="num">${H.k(p.amount)}</span></div>`).join('') || '<p class="empty">目前沒有專案。</p>'}</div>`;
  if (tab === 'all'){
    const cards = [['sales', '今日詢問', k.inquiries, h.inquiries], ['creative', '腳本確認', k.approved, h.videos], ['production', '今日出片', k.videos + ' 支', h.videos], ['growth', '今日入帳', H.k(k.today), h.revenue]];
    html += `<div class="dcards">${cards.map(([d, l, v, s]) => `<button class="dcard" data-dept="${d}" style="--dc:${dvar(d)}"><small>${H.DEPTS[d].name}</small><span>${l}</span><b class="num">${v}</b>${spark(s, dvar(d))}</button>`).join('')}</div>`;
    html += `<h4>製作漏斗（今日）</h4><div class="funnel">${(() => { const rows = [['LINE 詢問', k.inquiries, 'sales'], ['報價', k.quotes, 'sales'], ['成單', k.orders, 'creative'], ['出片', k.videos, 'production'], ['交付', k.delivered, 'growth']]; const mx = Math.max(1, ...rows.map(r => r[1])); return rows.map(([n, v, d]) => `<div><span>${n}</span><i style="width:${Math.max(3, Math.sqrt(v / mx) * 100)}%;background:${dvar(d)}"></i><b class="num">${v}</b></div>`).join(''); })()}</div>`;
    html += `<h4>今日入帳 · 本月 ${H.k(k.month)} / ${H.k(k.target)}（${k.pct}%）</h4>${lineChart(h.revenue, h.t, dvar('growth'), H.k)}`;
    html += `<h4>進行中專案</h4>${projRows(P.filter(p => p.stage !== 'delivered'))}`;
  }
  if (tab === 'sales'){
    html += `<div class="stats4">${stat('今日詢問', k.inquiries)}${stat('報價', k.quotes)}${stat('成單', k.orders)}${stat('待回覆', k.pending, k.pending > 6 ? 'bad' : '')}</div>`;
    html += `<h4>詢問累積</h4>${lineChart(h.inquiries, h.t, dvar('sales'), v => Math.round(v))}<h4>本月業績</h4>`;
    html += bars(H.agentsBy('sales').map(a => ({i:a.i, name:a.name + ' · ' + a.role, pct:a.stats.sales / a.stats.target * 100, val:Math.round(a.stats.sales / a.stats.target * 100) + '% · ' + H.k(a.stats.sales)})), dvar('sales'));
    html += `<h4>服務價目</h4><div class="tbl">${H.SERVICES.map(s => `<div class="tr"><div class="nm"><b>${s.suit} ${s.name}</b><small>${s.min} 支起 · 未稅</small></div><span class="num">${H.money(s.price)}／支</span><span class="num muted">本月 ${P.filter(p => p.svc === s.id).length} 案</span></div>`).join('')}</div>`;
  }
  if (tab === 'creative'){
    html += `<div class="stats4">${stat('今日腳本', k.scripts)}${stat('確認', k.approved)}${stat('改稿', k.revisions, k.revisions > 4 ? 'bad' : '')}${stat('洞察', k.insights)}</div>`;
    html += `<h4>待確認腳本</h4>${projRows(P.filter(p => p.stage === 'script'))}<h4>熱門話題雷達</h4><div class="chips">${H.TOPICS.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>`;
  }
  if (tab === 'production'){
    html += `<div class="stats4">${stat('今日出片', k.videos + ' 支')}${stat('在製', k.inProd)}${stat('待腳本', k.queued)}${stat('待交付', k.qa)}</div>`;
    html += `<h4>出片累積</h4>${lineChart(h.videos, h.t, dvar('production'), v => Math.round(v) + ' 支')}<h4>在製專案</h4>${projRows(P.filter(p => p.stage === 'production'))}<h4>每人出片</h4>`;
    const ag = H.agentsBy('production'), mx = Math.max(1, ...ag.map(a => a.stats.videos));
    html += bars(ag.map(a => ({i:a.i, name:a.name + ' · ' + a.role, pct:a.stats.videos / mx * 100, val:a.stats.videos + ' 支'})), dvar('production'));
  }
  if (tab === 'growth'){
    html += `<div class="stats4">${stat('今日交付', k.delivered + ' 支')}${stat('入帳', H.k(k.today))}${stat('累計觀看', k.views.toLocaleString('en-US'))}${stat('合作品牌', k.clients)}</div>`;
    html += `<h4>觀看累積</h4>${lineChart(h.views, h.t, dvar('growth'), v => Math.round(v / 1000) + 'k')}<h4>已交付</h4>${projRows(P.filter(p => p.stage === 'delivered'))}`;
  }
  box.innerHTML = html;
};
H.setAnalyticsTab = t => { tab = t; H.renderAnalytics(); };
$('#analytics').addEventListener('click', e => {
  const t = e.target.closest('[data-tab]'), d = e.target.closest('[data-dept]'), ag = e.target.closest('[data-agent]'), c = e.target.closest('[data-camp]');
  if (t){ tab = t.dataset.tab; H.setDept(tab); }
  else if (d) H.setDept(d.dataset.dept);
  else if (ag && ag.dataset.agent !== '') H.openCard(+ag.dataset.agent);
});

/* feed */
H.renderFeed = () => {
  if ($('#feed').hidden) return;
  const list = S.feed.filter(f => S.dept === 'all' || !f.dept || f.dept === S.dept).slice(0, 40);
  $('#feed-list').innerHTML = list.map(f => `<div class="li"><i class="ev" style="background:${f.dept ? dvar(f.dept) : 'var(--accent)'}"></i><span class="nm" title="${esc(f.text)}">${esc(f.text)}</span><time class="num">${f.t}</time></div>`).join('') || '<p class="empty">還沒有動態。</p>';
};
H.on('feed', () => H.renderFeed());

/* minimap */
const mm = $('#minimap'), mg = mm.getContext('2d');
const MW = 200, MH = 150, FWm = H.FLOOR.w, FDm = H.FLOOR.d, sx = x => (x + FWm / 2) / FWm * MW, sz = z => (z + FDm / 2) / FDm * MH;
function mmSize(){ const r = Math.min(devicePixelRatio, 2); mm.width = MW * r; mm.height = MH * r; mg.setTransform(r, 0, 0, r, 0, 0); }
mmSize();
H.drawMinimap = () => {
  const css = getComputedStyle(document.documentElement);
  mg.clearRect(0, 0, MW, MH);
  mg.fillStyle = css.getPropertyValue('--panel-2'); mg.fillRect(0, 0, MW, MH);
  for (const id of H.DEPT_IDS){ const z = H.DEPTS[id].zone; mg.globalAlpha = S.dept === id ? .35 : .16; mg.fillStyle = H.DEPTS[id].color; mg.fillRect(sx(z.x0), sz(z.z0), sx(z.x1) - sx(z.x0), sz(z.z1) - sz(z.z0)); }
  mg.globalAlpha = .12; mg.fillStyle = '#f37021'; mg.fillRect(sx(10.2), sz(-11), sx(15) - sx(10.2), sz(-6.2) - sz(-11));
  mg.globalAlpha = 1;
  for (const a of H.agents){ const p = a.c.g.position; mg.fillStyle = H.DEPTS[a.dept].color; mg.beginPath(); mg.arc(sx(p.x), sz(p.z), H.selected === a.i ? 4 : 2.4, 0, Math.PI * 2); mg.fill(); }
  const n = H.neon.c.g.position; mg.fillStyle = '#f37021'; mg.beginPath(); mg.arc(sx(n.x), sz(n.z), 3.5, 0, Math.PI * 2); mg.fill();
  const c = H.cam; mg.strokeStyle = css.getPropertyValue('--fg'); mg.lineWidth = 1.2; mg.strokeRect(sx(c.tx) - 6, sz(c.tz) - 4, 12, 8);
};
mm.addEventListener('click', e => { const r = mm.getBoundingClientRect(); H.focusOn((e.clientX - r.left) / r.width * FWm - FWm / 2, (e.clientY - r.top) / r.height * FDm - FDm / 2, 20); });

/* zone labels */
H.zoneTags = [];
const zl = (text, x, z, dept) => {
  const el = document.createElement('button'); el.className = 'zone estate-room-label'; el.textContent = text;
  el.style.setProperty('--dc', dept ? dvar(dept) : 'var(--accent)');
  el.addEventListener('click', () => dept ? H.setDept(dept) : H.focusOn(x, z - 2, 20));
  $('#overlay').append(el); H.zoneTags.push({el, x, z});
};
for (const id of H.DEPT_IDS){ const z = H.DEPTS[id].zone; zl(`${H.DEPTS[id].name} · ${H.agentsBy(id).length}`, z.x0 + 2.2, z.z1 - .3, id); }
zl('Ace 王牌室', 12.6, -6.0); zl('玻璃會議廳', 12.4, .8); zl('無邊際泳池', 1.0, 10.5); zl('超跑車庫', 11.8, 9.8); zl('雕塑庭院', -9.6, 1.5); zl('數字人攝影棚', 7.0, -6.4); zl('客戶接待', -8.0, 10.0);

/* wall screens */
const F = H.screenFont;
H.drawScreens = () => {
  const k = H.kpi(), P = S.projects;
  H.drawScreen('production', (g, W, Hh) => {
    g.fillStyle = '#9aa1ad'; g.font = F(600, 24); g.fillText('RENDER WALL · 今日出片', 40, 56);
    g.fillStyle = '#fff'; g.font = F(700, 86, 1); g.fillText(k.videos + ' 支', 36, 148);
    g.fillStyle = '#f37021'; g.font = F(600, 24); g.fillText(`在製 ${k.inProd} 件 · 待腳本 ${k.queued} · 待交付 ${k.qa}`, 40, 190);
    const live = H.findAgent('Mina'); g.textAlign = 'right'; g.fillStyle = live.activity === 'live' ? '#f37021' : '#4b5261'; g.font = F(700, 40, 1); g.fillText(live.activity === 'live' ? '● REC 數字人' : 'STAGE IDLE', W - 40, 120); g.textAlign = 'left';
    P.filter(p => p.stage === 'production').slice(0, 4).forEach((p, i) => { const y = 230 + i * 36; g.fillStyle = '#c9ced8'; g.font = F(500, 22); g.fillText(`${p.client} · ${H.svc(p.svc).name}`, 40, y + 18); g.fillStyle = '#2a303c'; g.fillRect(520, y + 4, W - 680, 16); g.fillStyle = '#f37021'; g.fillRect(520, y + 4, (W - 680) * p.done / p.qty, 16); g.fillStyle = '#9aa1ad'; g.fillText(`${p.done}/${p.qty}`, W - 140, y + 18); });
  });
  H.drawScreen('creative', (g, W) => {
    g.fillStyle = '#9aa1ad'; g.font = F(600, 24); g.fillText('話題雷達 · 腳本板', 40, 56);
    g.fillStyle = '#fff'; g.font = F(700, 64, 1); g.fillText(`${k.approved} 確認 / ${k.scripts} 腳本`, 36, 136);
    H.TOPICS.slice(0, 4).forEach((t, i) => { g.fillStyle = i ? '#c9ced8' : '#f37021'; g.font = F(500, 24); g.fillText((i ? '○ ' : '● ') + t, 40, 200 + i * 40); });
  });
  H.drawScreen('sales', (g, W) => {
    g.fillStyle = '#9aa1ad'; g.font = F(600, 24); g.fillText('LINE 詢問 · 今日', 40, 56);
    g.fillStyle = '#06c755'; g.font = F(700, 86, 1); g.fillText(String(k.inquiries), 36, 150);
    g.fillStyle = '#c9ced8'; g.font = F(500, 24); g.fillText(`報價 ${k.quotes} · 成單 ${k.orders} · 待回 ${k.pending}`, 40, 200);
    g.fillStyle = '#2a303c'; g.fillRect(40, 240, W - 80, 20); g.fillStyle = '#c9560f'; g.fillRect(40, 240, (W - 80) * Math.min(1, k.month / k.target), 20);
    g.fillStyle = '#9aa1ad'; g.font = F(500, 22); g.fillText(`本月 ${H.k(k.month)} / 目標 ${H.k(k.target)} · ${k.pct}%`, 40, 292);
  });
  H.drawScreen('growth', (g, W) => {
    g.fillStyle = '#9aa1ad'; g.font = F(600, 24); g.fillText('交付 · 成效', 40, 56);
    g.fillStyle = '#fff'; g.font = F(700, 72, 1); g.fillText(`${k.delivered} 支`, 36, 140);
    g.fillStyle = '#3f7f8c'; g.font = F(600, 24); g.fillText(`入帳 ${H.money(k.today)} · 觀看 ${k.views.toLocaleString('en-US')}`, 40, 186);
    const d = P.filter(p => p.views).slice(0, 3); d.forEach((p, i) => { g.fillStyle = '#c9ced8'; g.font = F(500, 22); g.fillText(`${p.client}：${p.views.toLocaleString('en-US')} 觀看`, 40, 240 + i * 36); });
  });
  H.drawScreen('neon', (g, W) => {
    g.fillStyle = '#f37021'; g.font = F(700, 30, 1); g.fillText('ACE · AI 王牌製作人', 30, 52);
    g.fillStyle = '#c9ced8'; g.font = F(500, 26); H.wrapText(g, H.neonLine || '8 位夥伴上線，王牌團隊運作中。', 30, 104, W - 60, 36, 5);
  });
};
})();
