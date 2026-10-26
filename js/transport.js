/* Sightseeing transport: one railway around all five islands and a sky boat. */
(() => {
const H=HQ,{scene,mat,mesh,box}=H,PI=Math.PI;
const group=new THREE.Group();group.name='estate-transport';scene.add(group);
const teal=mat(0x235259),cream=mat(0xffe8bd),orange=mat(0xf37021),metal=mat(0x566d7a),glass=mat(0x76bbcf,{roughness:.25});
const rect=(w,h,d,x,y,z,m=teal,p=group)=>mesh(box(w,h,d),m,p,x,y,z);
// Orthogonal routes: long axis-aligned straights and small rounded 90-degree corners.
const island=H.ISL.res;
function rectangularLoop(w,d,r,y){
 const corners=[[-w,-d],[w,-d],[w,d],[-w,d]].map(([x,z])=>new THREE.Vector3(x,y,z));
 const curve=new THREE.CurvePath();
 for(let i=0;i<4;i++){
  const v=corners[i],prev=corners[(i+3)%4],next=corners[(i+1)%4];
  const start=v.clone().add(prev.clone().sub(v).normalize().multiplyScalar(r));
  const end=v.clone().add(next.clone().sub(v).normalize().multiplyScalar(r));
  const nextStart=next.clone().add(v.clone().sub(next).normalize().multiplyScalar(r));
  curve.add(new THREE.QuadraticBezierCurve3(start,v,end));curve.add(new THREE.LineCurve3(end,nextStart));
 }
 return curve;
}
const railCurve=rectangularLoop(58,56,5,3);
railCurve.arcLengthDivisions=1200;railCurve.updateArcLengths();
const railLength=railCurve.getLength(),wrap=u=>(u%1+1)%1;
const railPoint=(u,offset=0)=>{const p=railCurve.getPointAt(wrap(u)),t=railCurve.getTangentAt(wrap(u));return p.add(new THREE.Vector3(t.z,0,-t.x).normalize().multiplyScalar(offset));};
for(const offset of [-.55,.55]){
 const points=Array.from({length:601},(_,i)=>railPoint(i/600,offset));
 mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),600,.065,5,false),metal,group);
}
// Instanced sleepers keep a world-sized railway inexpensive to render.
const ties=Math.ceil(railLength/.72),sleepers=new THREE.InstancedMesh(box(1.65,.12,.18),cream,ties),dummy=new THREE.Object3D();
sleepers.name='world-rail-sleepers';sleepers.receiveShadow=true;group.add(sleepers);
for(let i=0;i<ties;i++){
 const u=i/ties,p=railPoint(u),t=railCurve.getTangentAt(u);dummy.position.copy(p);dummy.position.y-=.13;dummy.rotation.set(0,Math.atan2(t.x,t.z),0);dummy.updateMatrix();sleepers.setMatrixAt(i,dummy.matrix);
}
sleepers.instanceMatrix.needsUpdate=true;
const stations=[];
for(const [id,name,target] of [
 ['main','中央轉運站',[0,3,56]],['res','住宅島站',[-31,3,56]],['farm','牧場島站',[-37,3,-56]],
 ['pasture','草原島站',[39,3,-56]],['fun','娛樂島站',[34,3,56]]
]){
 const v=new THREE.Vector3(...target);let u=0,best=Infinity;
 for(let i=0;i<1000;i++){const d=railPoint(i/1000).distanceToSquared(v);if(d<best){best=d;u=i/1000;}}
 const p=railPoint(u,2.0),t=railCurve.getTangentAt(u),station=new THREE.Group();station.name='world-station-'+id;station.position.copy(p);station.rotation.y=Math.atan2(t.x,t.z);group.add(station);
 rect(2.4,.3,7,0,-.25,0,cream,station);
 for(const z of [-2.7,2.7])rect(.13,2.7,.13,.9,1.2,z,metal,station);
 rect(2.7,.16,7.6,0,2.5,0,teal,station);
 rect(2.0,6,.6,0,-3.3,-2.7,metal,station);rect(2.0,6,.6,0,-3.3,2.7,metal,station);
 const stationInfo={id,name,u,position:p};stations.push(stationInfo);
 const label=document.createElement('button');stationInfo.label=label;label.className='zone';label.textContent=name;label.style.setProperty('--dc','#477a80');
 label.onclick=()=>{H.focusOn(p.x,p.z,32);H.goal.ty=p.y;H.railFocus=true;};document.getElementById('overlay').append(label);H.zoneTags.push({el:label,x:p.x,z:p.z,y:p.y+3});
}
function carriage(engine){
  const c=new THREE.Group();c.name=engine?'skyrail-locomotive':'skyrail-carriage';group.add(c);
  rect(1.25,.4,2.3,0,.35,0,teal,c);rect(1.15,1.1,1.9,0,1.05,0,engine?orange:cream,c);
  rect(1.35,.2,2.1,0,1.65,0,teal,c);
  for(const x of [-.59,.59])for(const z of [-.5,.45])rect(.025,.5,.62,x,1.2,z,glass,c);
  rect(.8,.5,.03,0,1.2,1.0,glass,c);
  for(const x of [-.65,.65])for(const z of [-.7,.7]){const w=mesh(new THREE.CylinderGeometry(.23,.23,.13,10),metal,c,x,.18,z);w.rotation.z=PI/2;}
  if(engine){rect(.95,.35,.55,0,.7,1.2,orange,c);mesh(new THREE.SphereGeometry(.13,8,6),cream,c,0,.9,1.49);}
  return c;
}
const train=[carriage(true),carriage(false),carriage(false),carriage(false),carriage(false)];
const railway=new THREE.Group();railway.name='world-railway';
for(const child of [...group.children])railway.add(child);group.add(railway);
const ship=new THREE.Group();ship.name='sky-boat';group.add(ship);
const boatBody=new THREE.Group();ship.add(boatBody);
// Boat hull fallback is replaced when the Kenney Watercraft model is ready.
const outline=new THREE.Shape();outline.moveTo(-1,-2.2);outline.lineTo(-1.35,1.3);outline.quadraticCurveTo(0,3.2,1.35,1.3);outline.lineTo(1,-2.2);outline.closePath();
const hull=mesh(new THREE.ExtrudeGeometry(outline,{depth:.65,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.15,bevelThickness:.15}),teal,boatBody);hull.rotation.x=-PI/2;
rect(1.6,1.0,1.8,0,1.15,-.7,cream,boatBody);rect(1.9,.15,2,0,1.75,-.7,orange,boatBody);
rect(1.1,.45,.04,0,1.28,.22,glass,boatBody);
for(const x of [-1,1])for(const z of [-1.6,1.2])rect(.06,2.2,.06,x,1.8,z,metal,ship);
const envelope=mesh(new THREE.SphereGeometry(1,16,10),cream,ship,0,3.7,0);envelope.scale.set(1.8,1.35,3.3);
for(const z of [-1.7,0,1.7]){const ring=mesh(new THREE.TorusGeometry(1.45,.06,4,20),orange,ship,0,3.7,z);ring.scale.set(1.1,.82,1);}
const propellers=[];
for(const x of [-1.8,1.8]){const p=new THREE.Group();p.position.set(x,.95,-1.6);ship.add(p);rect(.12,1.1,.12,0,0,0,cream,p);rect(1.1,.12,.12,0,0,0,cream,p);propellers.push(p);}
const airCurve=rectangularLoop(68,64,6,10);
const airLength=airCurve.getLength();
const route=t=>airCurve.getPointAt(wrap(t));
let elapsed=0;
function placeTransport(){
  train.forEach((c,i)=>{const u=wrap((elapsed*5.2-i*2.9)/railLength),p=railPoint(u),next=railPoint(u+.0002);c.position.copy(p);c.lookAt(next);});
  const a=elapsed*6/airLength+.6,p=route(a),next=route(a+.0002);ship.position.copy(p);ship.rotation.y=Math.atan2(next.x-p.x,next.z-p.z);
  propellers.forEach(p=>p.rotation.z=elapsed*8);
}
placeTransport();
H.transport={train,ship,group,railway,railCurve,railLength,railPoint,stations,airCurve};
H.focusWorldRail=()=>{H.follow=null;H.moved=true;H.setEstateRoofs(true);Object.assign(H.goal,{tx:0,ty:2.5,tz:0,theta:.25,phi:.72,radius:Math.max(235,235/(innerWidth/innerHeight))});};
const prev=H.updateWorld;
H.updateWorld=(dt,t)=>{
 prev(dt,t);if(H.state.speed>0&&!H.reduced){elapsed+=dt*Math.min(H.state.speed,3);placeTransport();}
 const wide=!!H.cam&&H.cam.radius>=150;
 railway.visible=wide||!!H.railFocus;ship.visible=wide||!!H.airshipFocus;
 for(const s of stations)if(s.label)s.label.hidden=!railway.visible;
 for(const object of H.airDecor||[])object.visible=wide;
};
// Buttons focus actual moving objects; returning to the estate uses the existing reset.
const rail=document.querySelector('.rail');
for(const [id,label,svg,focus] of [
 ['v-train','世界環線','<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M8 21l2-3m6 3-2-3M9 6h6"/>',()=>H.focusWorldRail()],
 ['v-airship','空船航線','<ellipse cx="12" cy="8" rx="10" ry="5"/><path d="M7 12l2 5h6l2-5M8 18h8"/>',()=>{const p=ship.position;H.focusOn(p.x,p.z,24);H.goal.ty=p.y+2;H.airshipFocus=true;}]
]){const b=document.createElement('button');b.id=id;b.title=b.ariaLabel=label;b.innerHTML=`<svg class="i" viewBox="0 0 24 24">${svg}</svg>`;b.onclick=focus;rail.append(b);}
// Official Kenney CC0 forest and delivery vehicle, with local texture dependencies.
H.kenneyAssets={loaded:0,failed:[]};
if(THREE.GLTFLoader){
  const loader=new THREE.GLTFLoader();
  const load=(name,placements)=>new Promise(resolve=>loader.load(`assets/kenney/mini-racing/${name}.glb`,g=>{
    for(const [x,y,z,scale,angle] of placements){const root=g.scene.clone(true);root.position.set(x,y,z);root.scale.setScalar(scale);root.rotation.y=angle||0;root.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});group.add(root);}
    H.kenneyAssets.loaded++;resolve();
  },undefined,()=>{H.kenneyAssets.failed.push(name);console.warn('Kenney model unavailable:',name);resolve();}));
  H.kenneyReady=Promise.all([
    load('vehicle-truck-yellow',[[island.c[0]+4,island.y+.05,island.c[2]+7,.6,PI/2]])
  ]);
}
if(THREE.GLTFLoader){
 const loader=new THREE.GLTFLoader();
 const load=(pack,name,apply)=>new Promise(resolve=>loader.load(`assets/kenney/${pack}/${name}.glb`,g=>{
   g.scene.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});
   apply(g.scene);H.kenneyAssets.loaded++;resolve();
 },undefined,()=>{H.kenneyAssets.failed.push(name);console.warn('Kenney model unavailable:',name);resolve();}));
 const models=[
  ...['a','b','c'].map((part,i)=>load('train-kit','train-electric-bullet-'+part,model=>{
    // Keep animated parent transforms and replace only the carriage geometry.
    const targets=i===0?[0]:i===1?[1,2,3]:[4];
    for(const target of targets){const coach=model.clone(true);train[target].clear();train[target].add(coach);coach.scale.setScalar(.95);}
  })),
  load('watercraft-kit','boat-tug-a',model=>{ship.remove(boatBody);model.scale.setScalar(1.25);ship.add(model);}),
  load('mini-forest','tree',model=>{
    for(const [x,z,s] of [[-16,-7,1.7],[-16,-3,1.3],[-8,-13,1.7],[17,0,1.4],[16,4,1.5]]){
      const tree=model.clone(true);tree.position.set(x,-.1,z);tree.scale.setScalar(s);group.add(tree);
    }
  }),
  load('mini-forest','tree-high',model=>{
    for(const [x,z] of [[-12,-13],[-3,-13],[16,-5]]){const tree=model.clone(true);tree.position.set(x,-.1,z);tree.scale.setScalar(1.6);group.add(tree);}
  }),
  load('mini-forest','stones',model=>{
    for(const [x,z] of [[-10,-.4],[-16,3],[16,8]]){const rock=model.clone(true);rock.position.set(x,.08,z);rock.scale.setScalar(1.5);group.add(rock);}
  })
 ];
 H.kenneyReady=Promise.all([H.kenneyReady,...models]);
}
})();
