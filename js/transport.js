/* Sightseeing transport: raised rail around the residential island and a sky boat. */
(() => {
const H=HQ,{scene,mat,mesh,box}=H,PI=Math.PI;
const group=new THREE.Group();group.name='estate-transport';scene.add(group);
const teal=mat(0x235259),cream=mat(0xffe8bd),orange=mat(0xf37021),metal=mat(0x566d7a),glass=mat(0x76bbcf,{roughness:.25});
const rect=(w,h,d,x,y,z,m=teal,p=group)=>mesh(box(w,h,d),m,p,x,y,z);
// Track loops outside the residential buildings; no change to employee bridge routes.
const island=H.ISL.res,rx=16,rz=13,railY=2.4;
const railPoint=(a,r=0)=>new THREE.Vector3(island.c[0]+(rx+r)*Math.cos(a),railY,island.c[2]+(rz+r)*Math.sin(a));
for(const offset of [-.55,.55]){
  const points=Array.from({length:97},(_,i)=>railPoint(i/96*PI*2,offset));
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),96,.07,4,false),metal,group);
}
for(let i=0;i<96;i++){
  const a=i/96*PI*2,p=railPoint(a),sleeper=rect(1.5,.12,.18,p.x,railY-.1,p.z,cream);
  sleeper.rotation.y=-a;
  if(i%8===0){const support=rect(.4,3.8,.4,p.x,railY-2,p.z,teal);support.name='rail-pier';}
}
const station=new THREE.Group();station.name='skyrail-station';group.add(station);
rect(5,.35,2.4,island.c[0],railY-.3,island.c[2]+rz+1.5,cream,station);
for(const x of [-2,2])rect(.18,2.6,.18,island.c[0]+x,railY+1,island.c[2]+rz+2,teal,station);
rect(5.6,.24,2.8,island.c[0],railY+2.3,island.c[2]+rz+1.5,orange,station);
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
const train=[carriage(true),carriage(false),carriage(false)];
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
const route=t=>new THREE.Vector3(Math.cos(t)*27,9+Math.sin(t*.7)*1.2,Math.sin(t)*23);
let elapsed=0;
function placeTransport(){
  train.forEach((c,i)=>{const a=elapsed*.075-i*.19,p=railPoint(a),next=railPoint(a+.01);c.position.copy(p);c.rotation.y=Math.atan2(next.x-p.x,next.z-p.z);});
  const a=elapsed*.035+.6,p=route(a),next=route(a+.01);ship.position.copy(p);ship.rotation.y=Math.atan2(next.x-p.x,next.z-p.z);
  propellers.forEach(p=>p.rotation.z=elapsed*8);
}
placeTransport();
H.transport={train,ship,group};
const prev=H.updateWorld;
H.updateWorld=(dt,t)=>{prev(dt,t);if(H.state.speed>0&&!H.reduced){elapsed+=dt*Math.min(H.state.speed,3);placeTransport();}};
// Buttons focus actual moving objects; returning to the estate uses the existing reset.
const rail=document.querySelector('.rail');
for(const [id,label,svg,focus] of [
 ['v-train','空島列車','<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M8 21l2-3m6 3-2-3M9 6h6"/>',()=>{const p=train[0].position;H.focusOn(p.x,p.z,29);H.goal.ty=3;}],
 ['v-airship','空船航線','<ellipse cx="12" cy="8" rx="10" ry="5"/><path d="M7 12l2 5h6l2-5M8 18h8"/>',()=>{const p=ship.position;H.focusOn(p.x,p.z,24);H.goal.ty=p.y+2;}]
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
    train[i].clear();train[i].add(model);model.scale.setScalar(.95);
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
