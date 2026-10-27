/* Keep exploration controls visible; put infrequent simulation tools behind More. */
(() => {
const H=HQ,top=document.querySelector('.top'),actions=document.querySelector('.actions');
const style=document.createElement('style');style.textContent=`
.top .actions{position:static;margin:0;padding:0;display:flex;flex-wrap:nowrap;overflow:visible;gap:6px;pointer-events:auto}
.top .actions .btn{height:42px;padding:0 14px;border-radius:12px;background:var(--panel);color:var(--fg);white-space:nowrap}
#more-tools{position:fixed;top:calc(var(--st) + 66px);right:var(--gr);z-index:30;width:min(440px,calc(100vw - 24px));max-height:calc(100dvh - var(--st) - 86px);overflow:auto;padding:16px;border:1px solid var(--line);border-radius:18px;background:var(--panel);color:var(--fg);box-shadow:var(--shadow)}
#more-tools header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}#more-tools h3{font-size:12px;color:var(--muted);margin:14px 0 8px}
#more-tools .tool-grid{display:flex;gap:8px;flex-wrap:wrap;position:relative}#more-tools .btn{min-height:40px;height:auto;background:var(--panel-2);color:var(--fg);box-shadow:none}
#more-tools .icon-btn{width:auto;padding:0 12px}#more-tools .icon-btn::after{content:attr(aria-label)}
#more-tools details{margin-top:16px;border-top:1px solid var(--line);padding-top:12px}#more-tools summary{cursor:pointer;padding:8px 0;font-weight:600;font-size:13px}
#more-tools .clock,#more-tools .greet,#more-tools .kpis,#more-tools #depts{position:static;display:flex;margin:8px 0;max-width:100%;flex-wrap:wrap;box-shadow:none}#more-tools .greet{display:block}#more-tools .clock{justify-content:space-between}#more-tools .who{display:flex}#more-tools #b-ask{display:inline-flex}#more-tools #meet-menu{top:auto;bottom:auto;right:0;z-index:2}
body.immersive #more-tools{display:none}
@media(max-width:760px){.top{flex-wrap:nowrap;gap:6px}.top .brand{padding:6px 9px}.top .brand small{display:none}.top .brand .logo{display:none}.top .actions .btn{font-size:12px;padding:0 10px;height:40px}.top .spacer{display:block;flex:1}.top .actions{flex:none}#more-tools{right:12px}}
`;document.head.append(style);
const panel=document.createElement('section');panel.id='more-tools';panel.hidden=true;panel.setAttribute('aria-label','更多工具');panel.innerHTML='<header><b>更多工具</b><button class="btn" id="more-close">關閉 ×</button></header><h3>園區與畫面</h3><div class="tool-grid" id="explore-tools"></div><details><summary>營運與 AI 工具</summary><div class="tool-grid" id="business-tools"></div></details><details><summary>時間、速度與營運資訊</summary><div id="simulation-tools"></div></details>';document.body.append(panel);
const explore=panel.querySelector('#explore-tools'),business=panel.querySelector('#business-tools'),sim=panel.querySelector('#simulation-tools');
for(const node of [...actions.children]){if(node.id==='b-views')continue;(['b-festival','b-sanctuary','b-tour','b-sound','b-reset','b-full'].includes(node.id)?explore:business).append(node);}
for(const selector of ['#depts','.clock','.greet','#kpis','.who','#bell']){const node=document.querySelector(selector);if(node)sim.append(node);}
document.querySelector('.row2').remove();top.append(actions);
const pause=document.createElement('button');pause.id='b-world-pause';pause.className='btn';pause.onclick=()=>H.setSpeed(H.state.speed?0:1);const sync=()=>{pause.textContent=H.state.speed?'暫停':'繼續';pause.setAttribute('aria-label',H.state.speed?'暫停園區':'繼續園區');};H.on('speed',sync);sync();
const more=document.createElement('button');more.id='b-more';more.className='btn';more.textContent='更多';more.setAttribute('aria-controls',panel.id);more.setAttribute('aria-expanded','false');actions.append(pause,more);
function close(returnFocus=false){panel.hidden=true;more.setAttribute('aria-expanded','false');if(returnFocus)more.focus();}
more.onclick=()=>{const open=panel.hidden;panel.hidden=!open;more.setAttribute('aria-expanded',String(open));if(open)panel.querySelector('#more-close').focus();};panel.querySelector('#more-close').onclick=()=>close(true);
addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!more.contains(e.target))close();});
addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){close(true);}});
explore.addEventListener('click',e=>{if(e.target.closest('button')?.id!=='b-sound')close();});
sim.querySelector('#bell').addEventListener('click',()=>close());
business.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&b.id!=='b-meet')close();});
})();
