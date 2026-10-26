/* Peripheral theme-park rides: a full archipelago coaster and upright wheel cabins. */
(() => {
const H=HQ,V=THREE.Vector3,PI=Math.PI,root=new THREE.Group();root.name='群島遊樂園';H.scene.add(root);
const cream=H.mat(0xfff3df),steel=H.mat(0x234c53),gold=H.mat(0xefb24d),red=H.mat(0xe65c42);
const box=(w,h,d,x,y,z,m=cream,p=root)=>H.mesh(H.box(w,h,d),m,p,x,y,z);
const island=H.mesh(H.SKY.islandGeo(9,10,13,.4,'#16883d'),H.SKY.rockM,root,60,.15,30);
box(15,.15,17,60,.16,30);
// Link from the entertainment island's east edge onto the wheel plaza.
const bridge=box(6,.15,2.4,51,-1.1,30);bridge.rotation.z=Math.atan2(2.55,6);
const wheel=new THREE.Group();wheel.name='星光摩天輪';wheel.position.set(60,13,30);root.add(wheel);
for(const z of [-1.5,1.5])for(const dx of [-3.3,3.3]){const beam=box(.42,13.3,.42,60+dx/2,6.7,30+z,steel);beam.rotation.z=Math.atan2(dx,13);}
const ringMat=gold;
for(const z of [-.7,.7]){const torus=H.mesh(new THREE.TorusGeometry(10,.16,6,64),ringMat,wheel,0,0,z);}
const cabins=[];
for(let i=0;i<12;i++){
 const a=i/12*PI*2,spoke=box(.12,20,.12,0,0,0,cream,wheel);spoke.rotation.z=a;
 const g=new THREE.Group();g.name='摩天輪車廂 '+(i+1);root.add(g);
 const m=i%2?red:gold;
 box(1.8,.22,1.5,0,-.7,0,m,g);box(1.9,.14,1.6,0,1,0,m,g);
 for(const x of [-.8,.8])for(const z of [-.65,.65])box(.08,1.7,.08,x,.15,z,steel,g);
 box(1.7,.45,.08,0,-.35,.7,m,g);box(1.7,.45,.08,0,-.35,-.7,m,g);
 for(const x of [-.4,.4]){box(.32,.45,.3,x,-.18,0,steel,g);box(.3,.3,.3,x,.22,0,cream,g);}
 cabins.push({g,angle:a});
}
// Outer route encloses the office, residential, entertainment, pasture and festival islands.
const points=[[-74,8,69],[-38,8,73],[10,9,73],[55,10,73],[75,13,52],[75,19,5],[73,13,-44],[52,25,-67],[10,12,-72],[-34,22,-70],[-70,14,-53],[-76,17,-10],[-76,8,40]].map(p=>new V(...p));
const curve=new THREE.CatmullRomCurve3(points,true,'centripetal'),length=curve.getLength();
function side(t){const tangent=curve.getTangentAt((t+1)%1);return new V(-tangent.z,0,tangent.x).normalize();}
const railCurves=[-.65,.65].map(offset=>new THREE.CatmullRomCurve3(Array.from({length:240},(_,i)=>curve.getPointAt(i/240).addScaledVector(side(i/240),offset)),true));
for(const c of railCurves)H.mesh(new THREE.TubeGeometry(c,480,.12,5,true),red,root);
const dummy=new THREE.Object3D(),ties=new THREE.InstancedMesh(H.box(1.6,.12,.16),steel,220);root.add(ties);
const supports=new THREE.InstancedMesh(H.box(.22,1,.22),cream,44);root.add(supports);
for(let i=0;i<220;i++){const t=i/220,p=curve.getPointAt(t);dummy.position.copy(p);dummy.lookAt(p.clone().add(curve.getTangentAt(t)));dummy.scale.set(1,1,1);dummy.updateMatrix();ties.setMatrixAt(i,dummy.matrix);}
for(let i=0;i<44;i++){const p=curve.getPointAt(i/44);dummy.position.set(p.x,(p.y-6)/2,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(1,p.y+6,1);dummy.updateMatrix();supports.setMatrixAt(i,dummy.matrix);}
const trains=[];
for(let j=0;j<3;j++){
 const cars=[],m=[gold,red,H.mat(0x43aaba)][j];
 for(let i=0;i<6;i++){
  const g=new THREE.Group();g.name='雲霄飛車 '+(j+1)+'-'+(i+1);root.add(g);
  box(1.15,.3,1.8,0,.24,0,m,g);for(const x of [-.57,.57])box(.1,.5,1.8,x,.5,0,m,g);
  for(const z of [-.35,.4]){box(.9,.5,.12,0,.55,z-.25,steel,g);box(.32,.42,.3,0,.7,z,cream,g);box(.3,.3,.3,0,1.08,z,cream,g);box(.9,.07,.07,0,.74,z+.2,steel,g);}
  cars.push(g);
 }
 trains.push({cars,offset:j/3,speed:10+j*2});
}
let elapsed=0;
function update(dt){elapsed+=dt;wheel.rotation.z=elapsed*.1;for(const c of cabins){const a=c.angle+wheel.rotation.z;c.g.position.set(60+Math.cos(a)*10,13+Math.sin(a)*10,30);}
for(const train of trains)for(let i=0;i<train.cars.length;i++){const t=((train.offset+elapsed*train.speed/length-i*2.05/length)%1+1)%1,p=curve.getPointAt(t),g=train.cars[i];g.position.copy(p);g.lookAt(p.clone().add(curve.getTangentAt(t)));}}
function button(id,text,title,x,z,r){const b=document.createElement('button');b.id=id;b.textContent=text;b.title=b.ariaLabel=title;b.style.cssText='font-size:12px';b.onclick=()=>{H.focusOn(x,z,r);H.goal.ty=10;};document.querySelector('.rail').append(b);}
button('v-wheel','摩天輪','星光摩天輪',60,30,52);button('v-coaster','飛車','環群島雲霄飛車',0,0,210);
H.rides={root,wheel,cabins,trains,curve,update};update(0);
const previous=H.updateWorld;H.updateWorld=(dt,t)=>{previous(dt,t);update(H.state.speed>0&&!H.reduced?dt*Math.min(H.state.speed,3):0);};
})();
