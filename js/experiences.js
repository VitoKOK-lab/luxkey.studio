/* Quiet sanctuary, live point-of-view cameras and peripheral dragon flights. */
(() => {
const H=HQ,V=THREE.Vector3,PI=Math.PI;
const style=document.createElement('style');style.textContent=`
body.immersive .top,body.immersive #kpis,body.immersive .actions,body.immersive .rail,body.immersive #overlay,body.immersive #card,body.immersive .mini,body.immersive #minimap,body.immersive .statbar,body.immersive .greet,body.immersive .mapbox,body.immersive .panel,body.immersive .drawer,body.immersive .alert{visibility:hidden!important}
#view-hud{position:fixed;top:calc(env(safe-area-inset-top,0px) + 12px);left:12px;right:12px;max-width:780px;margin:auto;z-index:80;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:rgba(15,40,47,.94);color:#fff6e6;box-shadow:0 5px 22px #0003}
#view-caption{flex:1;min-width:0}#view-identity{display:block;font-size:15px}#view-location{display:block;font-size:12px;color:#cedbd6;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#view-hud button{flex:none;min-height:44px;padding:8px 12px;border:1px solid #d9cbb3;border-radius:12px;background:#fff9ed;color:#17363c;font-size:13px}
#view-hud[hidden],#view-exit[hidden],#meditation-hint[hidden]{display:none}#meditation-hint{position:fixed;top:22%;left:50%;transform:translateX(-50%);z-index:80;color:#fff;text-shadow:0 2px 8px #17363c;text-align:center;font-size:24px;pointer-events:none}
@media(max-width:440px){#view-hud{gap:6px;padding:8px}#view-hud button{padding:8px;font-size:12px}#view-identity{font-size:13px}#view-location{font-size:11px}}
.experience-dialog{border:0;border-radius:18px;background:#fffaf2;color:#17363c;padding:24px;width:min(480px,90vw);max-height:85vh}.experience-dialog .choices{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.experience-dialog button,.experience-dialog select{min-height:44px}.experience-dialog select{width:100%;margin-top:12px}
`;document.head.append(style);
const exit=document.createElement('button');exit.id='view-exit';exit.hidden=true;exit.textContent='離開視角 · Esc';document.body.append(exit);
const hud=document.createElement('div');hud.id='view-hud';hud.hidden=true;hud.innerHTML='<div id="view-caption"><strong id="view-identity"></strong><span id="view-location"></span></div><button id="view-switch">切換</button>';hud.append(exit);document.body.append(hud);
const identity=hud.querySelector('#view-identity'),location=hud.querySelector('#view-location');
const hint=document.createElement('div');hint.id='meditation-hint';hint.hidden=true;document.body.append(hint);
function railButton(id,text,title,fn){const b=document.createElement('button');b.style.cssText='font-size:12px;white-space:nowrap';b.id=id;b.textContent=text;b.title=b.ariaLabel=title;b.onclick=fn;document.querySelector('.rail').append(b);return b;}
function focus(x,z,r=70){H.focusOn(x,z,r);H.goal.ty=2;H.moved=true;}
const sanctuary=new THREE.Group();sanctuary.name='private-sanctuary';sanctuary.position.set(-108,0,-82);H.scene.add(sanctuary);
const sand=H.mat(0xe0d5b8),stone=H.mat(0x686d69),wood=H.mat(0x907760),ink=H.mat(0x17363c),white=H.mat(0xf9f4e8);
const box=(w,h,d,x,y,z,m=wood,p=sanctuary)=>H.mesh(H.box(w,h,d),m,p,x,y,z);
H.mesh(H.SKY.islandGeo(18,14,14,.2,'#8f9d83'),H.SKY.rockM,sanctuary);
box(29,.2,20,0,.04,-1,sand);box(15,.3,4,0,.12,10,wood);box(1.1,.2,1.1,0,.36,9,ink);
for(const x of [-15.5,15.5])box(.3,.35,22,x,.2,-1,stone);
for(const z of [-11.8,10.2])box(31,.35,.3,0,.2,z,stone);
for(const [x,z,s] of [[-6,-4,2.2],[-3.5,-3,1.1],[5,0,1.7],[7,1.5,.9],[1,-7,1.3]]){
 const rock=H.mesh(new THREE.DodecahedronGeometry(s,0),stone,sanctuary,x,.5*s,z);rock.scale.set(.8,1.2,.65);rock.rotation.y=x;
 for(let i=0;i<5;i++){const rake=H.mesh(new THREE.TorusGeometry(s+1+i*.26,.025,3,64),white,sanctuary,x,.16,z);rake.rotation.x=PI/2;rake.scale.y=.72;}
}
for(let i=0;i<8;i++)box(1.4,.08,.7,0,.19,8-i*.9,stone);
for(let i=0;i<4;i++)H.SKY.tree(i<2?-16:16,(i%2?8:-9),1.4,sanctuary);
const pavilion=new THREE.Group();sanctuary.add(pavilion);for(const x of [-4.5,4.5])for(const z of [8,12])box(.18,3,.18,x,1.7,z,wood,pavilion);box(10,.2,5.4,0,3.3,10,ink,pavilion);
const vito=new THREE.Group();vito.position.set(0,.46,9);vito.rotation.y=PI;sanctuary.add(vito);let vitoRig;
H.loadChar('character-male-a').then(g=>{g.scene.scale.setScalar(2.3);vito.add(g.scene);const mixer=new THREE.AnimationMixer(g.scene);mixer.clipAction(H.groundCharClip(g.animations.find(a=>a.name==='sit'))).play();vitoRig={root:g.scene,mixer};});
H.sanctuary={group:sanctuary,vito};
const label=document.createElement('button');label.className='zone';label.textContent='Vito 私人島 · 枯山水';label.onclick=()=>showSanctuary();document.getElementById('overlay').append(label);H.zoneTags.push({el:label,x:-108,y:5,z:-82});
const meditateLaunch=document.createElement('button');meditateLaunch.id='meditation-start';meditateLaunch.className='btn';meditateLaunch.textContent='開始冥想';meditateLaunch.hidden=true;meditateLaunch.style.cssText='position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:80';document.body.append(meditateLaunch);
meditateLaunch.onclick=()=>H.enterView('meditation');
function showSanctuary(){focus(-108,-82,68);meditateLaunch.hidden=false;}
const panel=document.createElement('dialog');panel.id='view-dialog';panel.className='experience-dialog';panel.innerHTML='<header style="display:flex;justify-content:space-between"><b>進入世界的不同視角</b><button class="btn" data-close>關閉 ×</button></header><label>員工<select id="view-employee"></select></label><div class="choices"><button class="btn" data-view="employee">員工第一人稱</button><button class="btn" data-view="train">北上列車・車內</button><button class="btn" data-view="train-south">南下列車・車內</button><button class="btn" data-view="ufo">UFO 向下俯瞰</button><button class="btn" data-view="tennis">網球選手</button><button class="btn" data-view="meditation">私人島冥想</button></div><p>拖曳環顧四周；按 Esc 或上方「退出」返回。</p>';
document.body.append(panel);panel.querySelector('[data-close]').onclick=()=>panel.close();
hud.querySelector('#view-switch').onclick=()=>openViewPanel();
for(const a of H.agents){const o=document.createElement('option');o.value=a.i;o.textContent=a.name;panel.querySelector('select').append(o);}
function openViewPanel(){
 for(const option of panel.querySelectorAll('option')){const a=H.agents[+option.value];option.textContent=a.name+' · '+(a.offMain?(a.c.g.visible?'島外通勤':'住宅島休息中'):'辦公室');}
 if(!panel.open)panel.showModal();
}
railButton('v-perspective','視角','第一人稱／列車／UFO／網球視角',()=>openViewPanel());
railButton('v-private','私人','私人島與冥想',()=>showSanctuary());
// Keep the requested entries visible near the existing primary actions.
for(const [id,text,action] of [
 ['b-views','切換視角',()=>openViewPanel()],
 ['b-sanctuary','枯山水・私人島',()=>showSanctuary()],
 ['b-festival','動物遊園',()=>H.festival.focus()]
]){const b=document.createElement('button');b.id=id;b.className='btn';b.textContent=text;b.onclick=action;document.querySelector('.actions').prepend(b);}
const idleOrbit=H.idleOrbit={enabled:!H.reduced,lastInput:performance.now(),delay:12000,active:false};
const orbitLabel=document.createElement('label');orbitLabel.style.cssText='display:flex;gap:10px;align-items:center;margin-top:16px';
orbitLabel.innerHTML='<input id="idle-orbit-enabled" type="checkbox"> 閒置 12 秒後自動環繞';panel.append(orbitLabel);const orbitCheck=orbitLabel.querySelector('input');orbitCheck.checked=idleOrbit.enabled;
const noteInput=()=>{idleOrbit.lastInput=performance.now();idleOrbit.active=false;};
for(const name of ['pointerdown','pointermove','wheel','keydown','touchstart'])addEventListener(name,noteInput,{passive:true});
document.addEventListener('visibilitychange',noteInput);
orbitCheck.onchange=()=>{idleOrbit.enabled=orbitCheck.checked;noteInput();};
H.updateIdleOrbit=(dt,now)=>{
 const reading=[...document.querySelectorAll('dialog')].some(d=>d.open)||document.activeElement?.matches('input,textarea,select');
 idleOrbit.active=idleOrbit.enabled&&!H.view&&!H.follow&&!reading&&!document.hidden&&now-idleOrbit.lastInput>=idleOrbit.delay;
 if(idleOrbit.active){H.goal.theta+=Math.min(dt,.05)*.055;H.moved=true;}
};
let saved=null,hiddenBody=null,hiddenBefore=true;
H.exitView=()=>{
 H.hideViewBody(false);hiddenBody=null;H.view=null;document.body.classList.remove('immersive');exit.hidden=true;hud.hidden=true;hint.hidden=true;
 H.camera.up.set(0,1,0);H.camera.fov=saved?.fov||35;
 const v=saved?.cameraView;if(v?.enabled)H.camera.setViewOffset(v.fullWidth,v.fullHeight,v.offsetX,v.offsetY,v.width,v.height);else H.camera.clearViewOffset();H.camera.updateProjectionMatrix();
 if(saved){Object.assign(H.goal,saved.goal);H.setEstateRoofs(saved.roof);H.railFocus=saved.rail;H.follow=saved.follow;H.state.speed=saved.speed;saved=null;H.emit('speed');}
};
exit.onclick=H.exitView;addEventListener('keydown',e=>{if(e.key==='Escape'&&H.view&&!panel.open)H.exitView();});
H.enterView=(mode,index=0)=>{
 if(H.view)H.exitView();
 saved={goal:{...H.goal},follow:H.follow,cameraView:H.camera.view?{...H.camera.view}:null,fov:H.camera.fov,roof:H.estate.roofs.visible,rail:H.railFocus,speed:H.state.speed};
 H.view={mode,index,yaw:0,pitch:mode.startsWith('train')?-.12:0,started:performance.now()};H.follow=null;H.moved=true;H.railFocus=mode.startsWith('train');
 H.setEstateRoofs(mode!=='employee');H.camera.fov=mode==='ufo'?68:72;H.camera.clearViewOffset();H.camera.updateProjectionMatrix();
 document.body.classList.add('immersive');meditateLaunch.hidden=true;exit.hidden=false;hud.hidden=false;hint.hidden=mode!=='meditation';exit.textContent=mode==='meditation'?'結束冥想':'退出';
 if(mode==='employee')panel.querySelector('select').value=String(index);
 if(mode==='meditation')H.setSpeed(0);
 if(mode.startsWith('train')&&!H.state.speed)H.setSpeed(1);
 if(mode==='tennis'){const n=H.tennis.sparring;H.tennis.sparring.g.visible=true;}
 panel.close();H.updateView(0);
};
for(const s of H.transport.services)s.button.onclick=()=>H.enterView(s.id==='north'?'train':'train-south');
panel.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>H.enterView(b.dataset.view,+panel.querySelector('select').value));
H.updateView=(dt=.016)=>{
 const view=H.view;if(!view)return;let p=new V(),target=new V(),yaw=0;hiddenBody=null;
 if(view.mode==='employee'){
  const a=H.agents[view.index]||H.agents[0],island=a.route?.island,at=a.c.g.position;
  identity.textContent=a.name+' 的第一人稱';
  const area=!a.offMain?'辦公室':island&&Math.abs(at.x-island.c[0])<=island.ax&&Math.abs(at.z-island.c[2])<=island.az?island.name:'吊橋／通勤中';
  location.textContent=H.DEPTS[a.dept].name+' · '+area+(!a.c.g.visible?' · 休息中':'');
  a.c.g.updateWorldMatrix(true,false);p=a.c.g.localToWorld(new V(0,1.55,.15));yaw=a.c.g.rotation.y;hiddenBody=a.rig?.root;
 }else if(view.mode.startsWith('train')){
  const s=H.transport.services[view.mode==='train-south'?1:0],c=s.coaches[4];
  identity.textContent=(s.id==='north'?'北上':'南下')+'列車 · 第 5 節車廂內';location.textContent=s.name+' · '+(!H.state.speed?'已暫停':s.dwell>0?'中央站停靠 · '+Math.ceil(s.dwell)+' 秒後出發':s.realm+'行駛中');
  c.updateWorldMatrix(true,false);p=c.localToWorld(new V(s.direction*.38,1.36,-1));yaw=c.rotation.y-s.direction*PI/2;
 }else if(view.mode==='ufo'){
  identity.textContent='UFO 俯瞰視角';location.textContent='空中巡航 · 向下看島群';
  p.copy(H.ufo.position).add(new V(0,-1,0));target.copy(p).add(new V(Math.sin(view.yaw)*5,-12,Math.cos(view.yaw)*(.1+view.pitch*5)));H.camera.up.set(0,0,-1);
 }else if(view.mode==='tennis'){
  identity.textContent='阿傑的第一人稱';location.textContent='網球場 · 與 '+(H.ISL.fun.court.B.ready?H.ISL.fun.court.B.who.name:'小夏')+' 對打';
  const a=H.tennis.coach;a.g.updateWorldMatrix(true,false);p=a.g.localToWorld(new V(0,1.55,.1));target.copy(H.tennis.ball.position);hiddenBody=a.rig?.root;
 }else{
  identity.textContent='Vito · 私人島冥想';location.textContent='枯山水 · 園區已暫停';
  p.set(-108,1.65,-73);yaw=PI;hiddenBody=vitoRig?.root;
  const phase=(performance.now()-view.started)/1000%10;hint.textContent=phase<4?'吸氣 · 放慢呼吸':phase<5?'停留一刻':'吐氣 · 放鬆肩膀';
 }
 if(view.mode!=='ufo')H.camera.up.set(0,1,0);
 if(!['ufo','tennis'].includes(view.mode)){const angle=yaw+view.yaw;target.copy(p).add(new V(Math.sin(angle)*Math.cos(view.pitch),Math.sin(view.pitch),Math.cos(angle)*Math.cos(view.pitch)));}
 else if(view.mode==='tennis'){target.y+=view.pitch*4;target.x+=view.yaw*2;}
 H.camera.clearViewOffset();H.camera.position.copy(p);H.camera.lookAt(target);H.camera.updateMatrixWorld();
};
H.hideViewBody=hide=>{if(!hiddenBody)return;if(hide){hiddenBefore=hiddenBody.visible;hiddenBody.visible=false;}else hiddenBody.visible=hiddenBefore;};
// Three low-poly dragons follow broad orbits outside the estate's clear front view.
const dragons=[];
for(let i=0;i<3;i++){
 const g=new THREE.Group(),m=H.mat([0x477b70,0x8773a8,0xc9975c][i]),mem=H.mat([0x85b3a0,0xb5a2ca,0xe7c48d][i],{side:THREE.DoubleSide});H.scene.add(g);
 const body=H.mesh(new THREE.SphereGeometry(1,10,6),m,g,0,0,0);body.scale.set(.9,.75,2.6);
 box(.85,.8,1.6,0,.35,2.5,m,g);for(const x of [-.35,.35]){box(.12,.16,.15,x,.65,3.32,goldMaterial(),g);const horn=H.mesh(new THREE.ConeGeometry(.16,.7,5),white,g,x,1,2.2);horn.rotation.x=-.4;}
 const tail=H.mesh(new THREE.ConeGeometry(.55,3.6,7),m,g,0,-.1,-3.6);tail.rotation.x=-PI/2;
 const wings=[];
 for(const sign of [-1,1]){
  const pivot=new THREE.Group();pivot.position.set(sign*.65,.3,0);g.add(pivot);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,1,sign*4.7,.2,-.4,sign*1.2,0,-2.1],3));geo.computeVertexNormals();pivot.add(new THREE.Mesh(geo,mem));wings.push({pivot,sign});
  for(const z of [-1,1])box(.25,.9,.3,sign*.65,-.7,z,m,g);
 }
 dragons.push({g,wings,phase:i*PI*2/3});
}
function goldMaterial(){return H.mat(0xe9bf62,{emissive:0x8d6226,emissiveIntensity:.25});}
H.dragons=dragons;let flight=0;
railButton('v-dragons','龍','島群守護龍',()=>{H.focusWorldRail();});
const previous=H.updateWorld;H.updateWorld=(dt,t)=>{
 previous(dt,t);const step=H.state.speed>0&&!H.reduced?dt*Math.min(H.state.speed,3):0;flight+=step;
 for(const d of dragons){const a=flight*.055+d.phase;d.g.position.set(Math.cos(a)*83,18+Math.sin(a*2)*4,Math.sin(a)*73);d.g.rotation.y=-a;d.wings.forEach(w=>w.pivot.rotation.z=w.sign*(.15+Math.sin(flight*2.8+d.phase)*.5));d.g.visible=!H.view&&(H.cam.radius>=150||Math.abs(d.g.position.x)>55);}
 if(vitoRig){vitoRig.mixer.update(step);H.groundCharacter(vitoRig.root,true);}
 label.hidden=!!H.view;
 if(H.view||H.goal.tx>-80)meditateLaunch.hidden=true;
};
})();
