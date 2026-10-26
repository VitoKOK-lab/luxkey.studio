/* LUXKEY A.C.E. — AI 短影音行銷公司：共用命名空間、名冊、狀態 */
window.HQ = (() => {
  const H = {};
  H.$ = s => document.querySelector(s);
  H.$$ = s => [...document.querySelectorAll(s)];
  H.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  H.money = n => 'NT$' + Math.round(n).toLocaleString('en-US');
  H.k = n => Math.abs(n) >= 1e6 ? 'NT$' + (n / 1e6).toFixed(2) + 'M' : 'NT$' + (n / 1000).toFixed(0) + 'k';
  H.pick = a => a[Math.floor(Math.random() * a.length)];
  H.rand = (a, b) => a + Math.random() * (b - a);
  H.chance = p => Math.random() < p;
  H.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  H.fmtTime = m => { m = ((Math.floor(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const L = {};
  H.on = (e, f) => (L[e] = L[e] || []).push(f);
  H.emit = (e, d) => (L[e] || []).forEach(f => f(d));

  H.BRAND = {company:'LUXKEY', brand:'A.C.E.', tagline:'讓 AI 成為每個品牌的王牌', ai:'Ace', aiTitle:'AI 王牌製作人', monthlyTarget:1200000, site:'luxkey.com.tw'};
  H.FLOOR = {w:30, d:22};
  /* 四站：客戶接洽 → 腳本策劃 → AI 製作 → 交付成長（成效回到策劃） */
  H.DEPTS = {
    sales:      {id:'sales',      name:'客戶接洽', en:'CLIENTS',    color:'#c9560f', hex:0xc9560f, zone:{x0:-14.6, x1:-6.2, z0:.6, z1:10.6}, next:'creative'},
    creative:   {id:'creative',   name:'腳本策劃', en:'CREATIVE',   color:'#17363c', hex:0x17363c, zone:{x0:-14.6, x1:-6.2, z0:-10.6, z1:-1.2}, next:'production'},
    production: {id:'production', name:'AI 製作',  en:'PRODUCTION', color:'#f37021', hex:0xf37021, zone:{x0:-5.4, x1:9.4, z0:-10.6, z1:-1.2}, next:'growth'},
    growth:     {id:'growth',     name:'交付成長', en:'GROWTH',     color:'#3f7f8c', hex:0x3f7f8c, zone:{x0:10.2, x1:14.6, z0:.6, z1:10.6}, next:'creative'},
  };
  H.DEPT_IDS = ['sales', 'creative', 'production', 'growth'];

  H.SERVICES = [
    {id:'cut',   name:'AI 剪片',       price:300,  suit:'♠', min:10, dur:1.0},
    {id:'avatar', name:'AI 數字人',    price:2000, suit:'♥', min:10, dur:2.2},
    {id:'drama', name:'狗血劇商品介紹', price:3500, suit:'♦', min:10, dur:3.5},
    {id:'ugc',   name:'真人推薦影片',   price:2500, suit:'♣', min:5,  dur:2.8},
  ];
  H.svc = id => H.SERVICES.find(s => s.id === id);
  H.CLIENTS = ['赤身牛排館', '晴朗保養', '三點咖啡', '橘子健身', '好好早餐店', '城北牙醫', '山系露營', '甜點工作室', '老闆娘滷味', '日光眼鏡', '小島民宿', '綠蔭花藝'];
  H.TOPICS = ['牛排幾分熟怎麼分', '換季保養三個錯', '台北下午三點的咖啡', '健身新手第一週', '早餐店隱藏菜單', '牙齒美白迷思', '露營裝備清單', '生日蛋糕怎麼挑'];

  const S = (skin, hair, style, shirt, phones = false, capColor) => ({skin, hair, style, shirt, phones, capColor});
  H.ROSTER = [
    {dept:'sales',      name:'Jo',   role:'業務總監 · LINE 接洽',  stats:{inquiries:0, quotes:0, orders:0, sales:412000, target:600000}, look:S(0xf2c9a8, 0x1d1612, 'spiky', 0xc9560f, true)},
    {dept:'sales',      name:'Rin',  role:'客戶經理 · 續約與經銷', stats:{inquiries:0, quotes:0, orders:0, sales:286000, target:600000}, look:S(0xf3cdb0, 0x7a4a26, 'bob', 0xe07a3a, true)},
    {dept:'creative',   name:'Mira', role:'腳本策劃 · 生成前確認', stats:{scripts:0, revisions:0, approved:0}, look:S(0xf6d3b8, 0x2b1d14, 'bun', 0x17363c)},
    {dept:'creative',   name:'Aria', role:'成效分析 · 話題雷達', data:true, stats:{scripts:0, revisions:0, approved:0, insights:0}, look:S(0xe0aa82, 0x1d1612, 'bob', 0x2b5057)},
    {dept:'production', name:'Kai',  role:'AI 剪片師', svc:'cut',   stats:{videos:0, renders:0}, look:S(0xd9a07a, 0x1d1612, 'spiky', 0xf37021, true)},
    {dept:'production', name:'Mina', role:'AI 數字人', svc:'avatar', stats:{videos:0, renders:0}, look:S(0xf6d3b8, 0x120c08, 'bun', 0xff8c42)},
    {dept:'production', name:'Leo',  role:'劇情導演 · 狗血劇／真人', svc:'drama', stats:{videos:0, renders:0}, look:S(0x8d5a3b, 0x120c08, 'curly', 0xd9601a, true)},
    {dept:'growth',     name:'Owen', role:'交片與投放', stats:{delivered:0, views:0, posts:0}, look:S(0xc68863, 0x3b2a1a, 'cap', 0x3f7f8c, false, 0x17363c)},
  ];

  H.TASKS = {
    sales:      ['回覆 {c} 的 {s} 報價', '跟 {c} 確認 10 支起訂', '約 {c} LINE 討論', '整理 {c} 的素材清單'],
    creative:   ['寫「{t}」腳本', '確認 {c} 的角色設定', '改 {c} 腳本第 2 版', '抓本週熱門話題'],
    production: ['剪 {c} 的「{t}」', '生成 {c} 的數字人', '渲染 {c} 第 3 支', '調 {c} 的字幕與音樂'],
    growth:     ['交付 {c} 的 10 支直式影片', '上架 {c} 的第一波', '回報 {c} 的 7 日成效', '排 {c} 的投放'],
  };
  H.fillTask = (dept, t) => (t || H.pick(H.TASKS[dept])).replace('{c}', H.pick(H.CLIENTS)).replace('{s}', H.pick(H.SERVICES).name).replace('{t}', H.pick(H.TOPICS));

  H.state = {
    simMin: 9 * 60, speed: 1, dept: 'all', meeting: null, incident: null,
    projects: [],
    m: {
      sales: {inquiries:0, quotes:0, orders:0, booked:0},
      creative: {scripts:0, approved:0, revisions:0, insights:0},
      production: {videos:0, renders:0, rendering:0},
      growth: {delivered:0, revenue:0, views:0, clients:106},
    },
    hist: {t:[], revenue:[], videos:[], inquiries:[], views:[]},
    feed: [], notif: 0,
  };
  return H;
})();
