/* EVA visitors deliberately float outside the estate, distinct from grounded staff. */
(() => {
const H=HQ,PI=Math.PI,white=H.mat(0xf0eee5,{roughness:.65}),joint=H.mat(0x384650),
 gold=H.mat(0xb78b35,{metalness:.5,roughness:.2,emissive:0x6c4813,emissiveIntensity:.35}),
 blue=H.mat(0x83ddeb,{emissive:0x57c5de,emissiveIntensity:.7}),orange=H.mat(0xe98742);
const astronauts=[];
const box=(p,w,h,d,x,y,z,m=white)=>H.mesh(H.box(w,h,d),m,p,x,y,z);
const sphere=(p,r,x,y,z,m=white)=>H.mesh(new THREE.SphereGeometry(r,16,10),m,p,x,y,z);
for(const [i,base] of [[-24,6,-17],[25,8,-14],[-24,7,20],[25,10,20]].entries()){
 const g=new THREE.Group();g.name=`EVA-${String(i+1).padStart(2,'0')} 太空人`;g.userData.role='astronaut';g.scale.setScalar(1.3);H.scene.add(g);
 const torso=sphere(g,.5,0,0,0);torso.scale.set(.86,1.12,.65);
 sphere(g,.43,0,.76,0);
 const visor=sphere(g,.36,0,.77,.36,gold);visor.scale.set(.92,.73,.52);
 box(g,.4,.27,.06,0,.17,.33,joint);box(g,.23,.07,.03,0,.21,.37,blue);
 box(g,.56,.72,.3,0,.05,-.4);box(g,.42,.1,.05,0,.2,-.58,orange);
 const arms=[];
 for(const side of [-1,1]){
  const arm=new THREE.Group();arm.position.set(side*.45,.3,0);arm.rotation.z=side*.4;g.add(arm);
  sphere(arm,.17,0,0,0,joint);box(arm,.24,.46,.25,0,-.25,0);sphere(arm,.16,0,-.53,.03);arms.push({arm,side});
  const leg=new THREE.Group();leg.position.set(side*.23,-.5,0);leg.rotation.x=-.3;g.add(leg);
  box(leg,.27,.4,.28,0,-.17,0);sphere(leg,.15,0,-.4,.04,joint);box(leg,.24,.32,.26,0,-.55,.14);box(leg,.3,.18,.45,0,-.77,.23,joint);
  box(g,.08,.18,.05,side*.31,.14,.32,orange);
  const jet=sphere(g,.07,side*.18,-.45,-.45,blue);jet.scale.y=2.5;
 }
 const tether=H.mesh(new THREE.TorusGeometry(.2,.035,5,16,PI*1.6),orange,g,.47,-.23,-.05);tether.rotation.y=PI/2;
 const el=document.createElement('div');el.className='zone';el.textContent=g.name;document.getElementById('overlay').append(el);H.extraTags.push({el,o:g,dy:1.8});
 astronauts.push({g,base:new THREE.Vector3(...base),phase:i*1.7,arms});
}
let clock=0;
function update(dt){
 clock+=dt;
 for(const a of astronauts){const t=clock*.18+a.phase;
  a.g.position.copy(a.base).add(new THREE.Vector3(Math.sin(t)*1.8,Math.sin(t*.8)*.85,Math.cos(t)*1.4));
  a.g.rotation.set(Math.sin(t*.65)*.16,a.phase+clock*.035,Math.sin(t)*.22);
  for(const {arm,side} of a.arms){arm.rotation.z=side*(.4+Math.sin(t*1.4)*.12);arm.rotation.x=Math.sin(t+side)*.18;}
 }
}
H.astronauts=astronauts;H.updateAstronauts=update;update(0);
const button=document.createElement('button');button.id='v-astronauts';button.textContent='太空';button.style.cssText='font-size:12px;white-space:nowrap';button.title=button.ariaLabel='太空人巡航';
button.onclick=()=>{const p=astronauts[0].g.position;H.focusOn(p.x,p.z,17);H.goal.ty=p.y;};document.querySelector('.rail').append(button);
const previous=H.updateWorld;H.updateWorld=(dt,t)=>{previous(dt,t);update(H.state.speed>0&&!H.reduced?dt*Math.min(H.state.speed,3):0);};
})();
