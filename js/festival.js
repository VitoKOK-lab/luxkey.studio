/* Animal visitors: real train transfers, orthogonal paths and a square festival island. */
(() => {
const H=HQ,T=H.transport,V=THREE.Vector3,PI=Math.PI,N=312,Y=.15;
const park=new THREE.Group();park.name='animal-festival';H.scene.add(park);
const cream=H.mat(0xf4ead7),ink=H.mat(0x17363c),gold=H.mat(0xdbaa54),pink=H.mat(0xc36d79),wood=H.mat(0x947654);
const box=(w,h,d,x,y,z,m=cream,p=park)=>H.mesh(H.box(w,h,d),m,p,x,y,z);
const island=H.mesh(H.SKY.islandGeo(14,14,12,.3,'#9bb59a'),H.SKY.rockM,park,0,0,35);
box(27,.18,27,0,.03,35); // level, square promenade
box(2.2,.03,27,0,.135,35,wood);
box(26,.03,1.8,0,.135,39,wood);
function ramp(a,b,width,material=cream){
 const start=new V(...a),end=new V(...b),mid=start.clone().add(end).multiplyScalar(.5);
 const mesh=box(width,.16,start.distanceTo(end),mid.x,mid.y-.08,mid.z,material);
 mesh.lookAt(end);return mesh;
}
// Main-island access and two platforms; the outer line has a pedestrian overpass.
ramp([0,Y,21],[0,-.02,14],2.2);
for(const z of [51,61])box(55,.24,1.9,0,2.88,z);
ramp([-5,3,51],[-5,Y,45],1.8);
ramp([10,3,61],[0,7,61],1.8);ramp([0,7,61],[0,7,51],1.8);ramp([0,7,51],[0,Y,43],1.8);
for(const z of [51,61])for(const x of [-24,24])box(.3,6,.3,x,-.1,z,ink);
const gangways=new THREE.Group();park.add(gangways);
function label(text,x,y,z,action){const el=document.createElement('button');el.className='zone';el.textContent=text;el.onclick=action;document.getElementById('overlay').append(el);H.zoneTags.push({el,x,y,z});return el;}
const focus=()=>{H.focusOn(0,37,76);H.goal.ty=2;H.railFocus=true;};
label('動物遊園 · 節目／馬戲團／市集',0,4,35,focus);
const button=document.createElement('button');button.style.cssText='font-size:12px;white-space:nowrap';button.id='v-festival';button.title=button.ariaLabel='動物遊園';button.textContent='遊園';button.onclick=focus;document.querySelector('.rail').append(button);
// Stage and an actual animated programme canvas, shared with the reading dialog.
const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;const ctx=canvas.getContext('2d');
const texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;
box(12,6,.4,0,3.8,23,ink);const screen=H.mesh(new THREE.PlaneGeometry(11.5,5.5),new THREE.MeshBasicMaterial({map:texture}),park,0,3.8,23.23);
screen.userData.agent='festival';H.pickables.push(screen);box(13,.45,2,0,.3,23,gold);
const dialog=document.createElement('dialog');dialog.id='festival-dialog';dialog.style.cssText='width:min(900px,90vw);max-height:85vh;border:0;border-radius:18px;padding:20px;color:#17363c;background:#fffaf1';
dialog.innerHTML='<header style="display:flex;justify-content:space-between;gap:12px"><b>園區節目與市集</b><button class="btn" id="festival-close">關閉 ×</button></header><p id="festival-counts"></p><canvas width="960" height="540" style="width:100%;border-radius:12px"></canvas><p>正在輪播園區動畫節目；工作台有完成的產出時，也會加入內容展映。</p><p>市集：鮮果攤 · 花藝小舖 · 內容書店 · 麵包屋 · 文創小物 · 園區紀念品</p>';
document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();
H.openFestival=()=>{if(!dialog.open)dialog.showModal();};label('節目廣場 · 點我看節目',0,7.3,23,H.openFestival);
// A six-stall market, with striped awnings and actual goods on the counters.
for(let i=0;i<6;i++){
 const x=10.8,z=28+i*3.3,m=i%2?pink:gold;
 box(2.8,1,2,x,.65,z,wood);box(3.2,.16,2.4,x,2.6,z,m);
 for(const dx of [-1.3,1.3])box(.1,2.4,.1,x+dx,1.3,z+.8,ink);
 for(let j=0;j<5;j++){box(.3,.3,.35,x-1+j*.5,1.3,z,i===2?ink:i%2?pink:gold);box(.3,.08,2.4,x-1.25+j*.6,2.71,z,cream);}
}
label('週末市集',10.8,4,36,H.openFestival);
// Circus: six horses circle the ring and jump a low obstacle.
const ring=H.mesh(new THREE.CylinderGeometry(3.7,3.9,.24,48),pink,park,-7.5,.22,39);
const horses=[];
for(let i=0;i<6;i++){
 const g=new THREE.Group();park.add(g);const m=H.mat([0xb4774c,0xe4d8bd,0x51413b][i%3]);
 box(.55,.65,1.2,0,.85,0,m,g);box(.35,.8,.35,0,1.25,.47,m,g);box(.4,.4,.7,0,1.65,.65,m,g);
 box(.12,.5,.4,0,1.5,.35,ink,g);box(.1,.6,.12,0,.9,-.7,ink,g);
 const legs=[];for(const x of [-.2,.2])for(const z of [-.43,.43])legs.push(box(.12,.6,.12,x,.3,z,m,g));
 horses.push({g,legs});
}
box(1.4,.12,.12,-7.5,.8,42,gold);for(const x of [-8.25,-6.75])box(.12,.9,.12,x,.6,42,ink);
label('馬戲團 · 馬術巡演',-7.5,4,39,()=>{H.focusOn(-7.5,39,27);H.goal.ty=1;});
// One set of instanced body parts renders 312 distinct visitors in a few draw calls.
const parts={},dummy=new THREE.Object3D(),color=new THREE.Color();
for(const name of ['body','head','muzzle','earL','earR','eyeL','eyeR','tail','leg0','leg1','leg2','leg3']){
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:.85}),N);
 mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;parts[name]=mesh;H.scene.add(mesh);
}
const palette=[0xf0afba,0xf4eee1,0xd49a5a,0x777d89,0xe7d3b1,0xed7b36];
const visitors=Array.from({length:N},(_,id)=>({id,kind:id%6,p:new V(),yaw:0,path:[],state:'watch',wait:0,visits:0,zonePath:[],service:null,coach:0,seat:0}));
const stats={arrivals:0,boarded:0,departures:0,watched:0,market:0,circus:0,docks:0};
let elapsed=0,paintAt=-1;
const point=(x,z,y=Y)=>new V(x,y,z);
function go(a,path,done){a.path=path.map(p=>p.clone());a.done=done;a.state='walking';}
function zonePath(a,zone){
 const id=a.id,entry=point(0,39);
 if(zone==='watch'){const x=(id%14-6.5)*.68,z=26.5+Math.floor(id/14)%6*.8;return [entry,point(0,z),point(x,z)];}
 if(zone==='market'){const z=27.5+id%20*.85,x=5.5+Math.floor(id/20)%4*.7;return [entry,point(3.5,39),point(3.5,z),point(x,z)];}
 const angle=(id%64)/64*PI*2,r=5+(Math.floor(id/64)%2)*.45,n=Math.ceil(angle/.18),out=[entry,point(-7.5+r,39)];
 for(let i=1;i<=n;i++){const t=angle*i/n;out.push(point(-7.5+r*Math.cos(t),39+r*Math.sin(t)));}return out;
}
function visit(a,zone,instant=false){
 const path=zonePath(a,zone);a.zone=zone;a.zonePath=path;
 const arrived=()=>{a.state=zone;a.wait=18+a.id%17;a.yaw=zone==='watch'?PI:zone==='market'?PI/2:Math.atan2(-7.5-a.p.x,39-a.p.z);};
 if(instant){a.p.copy(path[path.length-1]);arrived();}else go(a,path,arrived);
}
function queue(a){
 const waiting=visitors.filter(v=>v.state==='queue'||v.queuing).length;
 if(waiting>=72){a.visits=0;visit(a,'watch');return;}
 a.queuing=true;const x=(a.id%12-5.5)*.65,z=44.3+Math.floor(a.id/12)%6*.7;
 go(a,[point(0,43),point(x,43),point(x,z)],()=>{a.queuing=false;a.state='queue';a.yaw=0;});
}
function finishVisit(a){
 stats[a.zone==='watch'?'watched':a.zone]++;a.visits++;
 go(a,a.zonePath.slice().reverse(),()=>a.visits>=3?queue(a):visit(a,['watch','market','circus'][a.visits]));
}
const platform=s=>s.id==='north'?51:61;
function stationPath(s,x){return s.id==='north'?[point(0,43),point(-5,45),point(-5,51,3),point(x,51,3)]:[point(0,43),point(0,51,7),point(0,61,7),point(10,61,3),point(x,61,3)];}
function seatPoint(a){const coach=a.service.coaches[a.coach];coach.updateWorldMatrix(true,false);return coach.localToWorld(new V(0,.54,(a.seat-1)*.72));}
function dock(s){
 stats.docks++;const riders=visitors.filter(a=>a.state==='aboard'&&a.service===s);
 for(const a of riders){a.p.copy(seatPoint(a));const x=s.coaches[a.coach].position.x;a.service=null;a.visits=0;stats.arrivals++;
  go(a,[point(x,platform(s),3),...stationPath(s,x).reverse()],()=>visit(a,'watch'));
 }
 const boarding=visitors.filter(a=>a.state==='queue').slice(0,36);
 boarding.forEach((a,i)=>{
  a.service=s;a.coach=1+Math.floor(i/3)%10;a.seat=i%3; // allocate the last six to the end cars below
  if(i>=30){a.coach=i<33?0:11;a.seat=i%3;}
  const x=s.coaches[a.coach].position.x;
  go(a,[point(a.p.x,43),...stationPath(s,x),seatPoint(a)],()=>{a.state='aboard';stats.boarded++;});
 });
 updateGangways();
}
function depart(s){stats.departures++;updateGangways();}
function updateGangways(){
 for(const child of [...gangways.children]){child.geometry.dispose();gangways.remove(child);}
 for(const s of T.services)if(s.dwell>0)for(const c of s.coaches){
  const a=new V(c.position.x,3.7,c.position.z),b=new V(c.position.x,3,platform(s)),m=box(.65,.1,a.distanceTo(b),0,0,0,wood,gangways);
  m.position.copy(a.clone().add(b).multiplyScalar(.5));m.position.y-=.05;m.lookAt(b);
 }
}
// Reserve a stop where all twelve cars line up with the long platforms.
for(const s of T.services){
 let best=Infinity,u=0;const target=new V(s.id==='north'?22.8:-22.8,3,56);
 for(let i=0;i<6000;i++){const d=T.journeyPoint(i/6000).distanceToSquared(target);if(d<best){best=d;u=i/6000;}}
 s.stopDistance=u*T.journeyLength;s.distance=s.stopDistance-s.direction*s.speed*(s.id==='north'?8:24);
}
T.place();
for(const a of visitors){
 if(a.id<72){a.service=T.services[Math.floor(a.id/36)];const i=a.id%36;a.coach=Math.floor(i/3);a.seat=i%3;a.state='aboard';a.p.copy(seatPoint(a));}
 else if(a.id<120){a.p.set((a.id%12-5.5)*.65,Y,44.3+Math.floor(a.id/12)%6*.7);a.state='queue';}
 else {a.visits=Math.floor((a.id-120)/64);visit(a,['watch','market','circus'][a.visits],true);}
}
// Open passenger decks preserve the Kenney locomotive at both ends.
H.kenneyReady.then(()=>{
 for(const s of T.services)for(let i=1;i<11;i++){
  const c=s.coaches[i];c.clear();const m=H.mat(s.color);
  box(1.45,.24,2.7,0,.4,0,m,c);
  for(const x of [-.7,.7])for(const z of [-.95,.95])box(.1,.45,.6,x,.7,z,m,c);
  for(const z of [-1.3,1.3])box(1.45,.45,.1,0,.7,z,m,c);
  for(const x of [-.62,.62])for(const z of [-.9,.9]){const w=H.mesh(new THREE.CylinderGeometry(.22,.22,.12,8),ink,c,x,.18,z);w.rotation.z=PI/2;}
 }
});
function paint(){
 const phase=Math.floor(elapsed/18)%3,run=(H.runs||[]).find(r=>r.state==='done'&&r.text);
 ctx.fillStyle=['#163d49','#50334c','#203d34'][phase];ctx.fillRect(0,0,960,540);
 ctx.fillStyle='#e9b975';ctx.font='bold 26px sans-serif';ctx.fillText('A.C.E. FESTIVAL  /  園區節目',44,55);
 ctx.fillStyle='#fff7e9';ctx.font='bold 52px sans-serif';ctx.fillText(['動物列車旅行記','馬戲團 · 星光巡演',run?'工作台內容展映':'王牌製作所 · 幕後日記'][phase],44,130);
 for(let i=0;i<7;i++){const x=90+i*120,y=290+Math.sin(elapsed*1.8+i)*25;ctx.fillStyle='#'+palette[i%6].toString(16);ctx.fillRect(x-25,y-30,55,55);ctx.fillRect(x-20,y-50,12,25);ctx.fillRect(x+15,y-50,12,25);ctx.fillStyle='#17363c';ctx.fillRect(x-10,y-12,5,5);ctx.fillRect(x+17,y-12,5,5);}
 ctx.fillStyle='#d3e0dc';ctx.font='24px sans-serif';ctx.fillText(phase===2&&run?run.text.replace(/\s+/g,' ').slice(0,34):['下一站，讓好內容被更多夥伴看見。','六匹駿馬，環場奔跑與越障演出。','從靈感、腳本到作品，一起看創作發生。'][phase],44,420);
 ctx.font='20px sans-serif';ctx.fillText(`現場動畫節目  ·  第 ${phase+1} 段／3  ·  ${visitors.filter(a=>a.state==='watch').length} 位觀眾`,44,492);texture.needsUpdate=true;
 if(dialog.open){dialog.querySelector('canvas').getContext('2d').drawImage(canvas,0,0);dialog.querySelector('#festival-counts').textContent=`312 位動物遊客｜累計下車 ${stats.arrivals} · 上車 ${stats.boarded} · 觀賞 ${stats.watched} · 市集 ${stats.market} · 馬戲團 ${stats.circus}`;}
}
function renderAnimals(){
 for(const a of visitors){
  const aboard=a.state==='aboard';if(aboard){a.p.copy(seatPoint(a));a.yaw=a.service.coaches[a.coach].rotation.y;}
  const hidden=(aboard||a.p.z>49)&&!T.railway.visible,scale=hidden?0:aboard?.58:.63,phase=elapsed*8+a.id;
  const moving=a.path.length>0,sitting=a.state==='watch'||a.state==='circus';
  const body=palette[a.kind],dark=a.kind===1?0x363b43:0x775746;
  const specs={body:[0,.43,0,.58,.48,.8,body],head:[0,.81,.32,.54,.5,.5,body],muzzle:[0,.71,.61,.28,.19,.16,a.kind===0?0xdb8797:0xf4e4ce],earL:[-.2,1.1,.26,.14,a.kind===4?.6:.22,.15,dark],earR:[.2,1.1,.26,.14,a.kind===4?.6:.22,.15,dark],eyeL:[-.15,.85,.58,.065,.075,.04,0x142832],eyeR:[.15,.85,.58,.065,.075,.04,0x142832],tail:[0,.48,-.52,.12,.12,a.kind===2?.4:.18,dark]};
  for(let j=0;j<4;j++)specs['leg'+j]=[(j%2?1:-1)*.2,.13+(moving?Math.max(0,Math.sin(phase+j*PI/2))*.1:0),(j<2?-.25:.25),.13,sitting?.16:.26,.16,dark];
  for(const [name,v] of Object.entries(specs)){
   const [x,y,z,w,h,d,c]=v,sn=Math.sin(a.yaw),cs=Math.cos(a.yaw);
   dummy.position.set(a.p.x+(x*cs+z*sn)*scale,a.p.y+y*scale,a.p.z+(-x*sn+z*cs)*scale);dummy.rotation.set(0,a.yaw,0);dummy.scale.set(w*scale,h*scale,d*scale);dummy.updateMatrix();parts[name].setMatrixAt(a.id,dummy.matrix);color.setHex(c);parts[name].setColorAt(a.id,color);
  }
 }
 for(const mesh of Object.values(parts)){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
}
function update(dt){
 elapsed+=dt;
 for(const a of visitors){
  let budget=dt*4.5;
  while(a.path.length&&budget>0){const p=a.path[0],d=a.p.distanceTo(p);if(d<1e-6){a.path.shift();continue;}a.yaw=Math.atan2(p.x-a.p.x,p.z-a.p.z);if(d<=budget){a.p.copy(p);budget-=d;a.path.shift();}else{a.p.lerp(p,budget/d);budget=0;}}
  if(a.state==='walking'&&!a.path.length){const cb=a.done;a.done=null;cb&&cb();}
  if(['watch','market','circus'].includes(a.state)&&(a.wait-=dt)<=0)finishVisit(a);
 }
 horses.forEach((h,i)=>{const a=elapsed*.7+i*PI/3,jump=Math.max(0,Math.cos(a-PI/2))**18*.65;h.g.position.set(-7.5+Math.cos(a)*2.7,.35+jump,39+Math.sin(a)*2.7);h.g.rotation.y=-a;h.legs.forEach((l,j)=>l.rotation.x=Math.sin(elapsed*9+j*PI)*.45);});
 if(elapsed-paintAt>.2){paint();paintAt=elapsed;}renderAnimals();
}
H.festival={visitors,stats,parts,park,horses,dock,depart,canDepart:s=>!visitors.some(a=>a.service===s&&a.state==='walking'),update,focus,screen,canvas};
paint();renderAnimals();
const previous=H.updateWorld;H.updateWorld=(dt,t)=>{previous(dt,t);update(H.state.speed>0&&!H.reduced?dt*Math.min(H.state.speed,3):0);};
})();
