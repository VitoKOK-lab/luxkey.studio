/* Tennis club art pass: materials, transparent mesh fencing, seated crowd and local lighting. */
(() => {
const H=HQ,F=H.ISL.fun,PI=Math.PI,V=THREE.Vector3;
const root=new THREE.Group();root.name='A.C.E. TENNIS CLUB';F.g.add(root);
const fine=new THREE.Group();root.add(fine);
const cream=H.mat(0xece7d9),metal=H.mat(0x163431,{roughness:.55}),wood=H.mat(0x99704b),navy=H.mat(0x173a59),lime=H.mat(0xceeb37);
const box=(w,h,d,x,y,z,m=cream,p=root)=>H.mesh(H.box(w,h,d),m,p,x,y,z);
const tex=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'));const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(8,H.renderer.capabilities.getMaxAnisotropy());return t;};
let seed=7403;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const surface=tex(512,1024,c=>{
 c.fillStyle='#27547c';c.fillRect(0,0,512,1024);
 for(let i=0;i<42000;i++){c.fillStyle=random()>.5?'rgba(210,232,242,.09)':'rgba(2,18,39,.13)';c.fillRect(random()*512,random()*1024,1+random()*2,1+random()*2);}
 c.strokeStyle='#f9f5e3';c.lineWidth=4;c.strokeRect(48,48,416,928);
 c.beginPath();for(const x of [108,404]){c.moveTo(x,48);c.lineTo(x,976);}for(const y of [280,744]){c.moveTo(48,y);c.lineTo(464,y);}c.moveTo(256,280);c.lineTo(256,744);c.stroke();
 for(const y of [48,976]){c.fillStyle='#f9f5e3';c.fillRect(254,y===48?48:962,4,14);}
});
F.courtSurface.material.map.dispose();F.courtSurface.material.map=surface;F.courtSurface.material.needsUpdate=true;
F.oldCourtNet.visible=false;
const surround=tex(256,256,c=>{c.fillStyle='#285440';c.fillRect(0,0,256,256);for(let i=0;i<9000;i++){c.fillStyle=random()>.5?'#335e46':'#214a36';c.fillRect(random()*256,random()*256,1,2);}});surround.wrapS=surround.wrapT=THREE.RepeatWrapping;surround.repeat.set(4,7);
box(7.4,.08,12.5,8.5,-.02,0,new THREE.MeshStandardMaterial({map:surround,roughness:1}));
// Paved entry and slim border edging leave the existing west gate route clear.
box(1.2,.035,12.8,4.2,-.035,0,cream);
for(const x of [4.75,12.25])box(.09,.06,12.8,x,0,0,cream);
for(const z of [-6.35,6.35])box(7.5,.06,.09,8.5,0,z,cream);
function meshPanel(w,h,x,y,z,rotation=0,spacing=.17){
 const t=tex(64,64,c=>{c.clearRect(0,0,64,64);c.strokeStyle='#29483f';c.lineWidth=4;c.beginPath();c.moveTo(0,32);c.lineTo(32,0);c.lineTo(64,32);c.lineTo(32,64);c.closePath();c.stroke();});
 t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(w/spacing,h/spacing);
 const m=new THREE.MeshStandardMaterial({map:t,transparent:true,alphaTest:.08,side:THREE.DoubleSide,roughness:.8});
 const o=H.mesh(new THREE.PlaneGeometry(w,h),m,root,x,y,z);o.rotation.y=rotation;o.castShadow=false;return o;
}
for(const x of [4.9,12.1]){
 for(const z of [-6,-4,-2,2,4,6])box(.055,2.5,.055,x,1.25,z,metal);
 const segments=x<8?[[-3.4,5.2],[3.4,5.2]]:[[0,12]];
 for(const [z,len] of segments){meshPanel(len,2.4,x,1.3,z,PI/2);box(.05,.05,len,x,2.52,z,metal);}
}
for(const z of [-6,6]){meshPanel(7.2,2.4,8.5,1.3,z);box(7.25,.05,.05,8.5,2.52,z,metal);for(const x of [7.3,9.7])box(.05,2.5,.05,x,1.25,z,metal);}
const net=meshPanel(4.65,.7,8.5,.49,0,0,.12);box(4.75,.045,.04,8.5,.86,0,cream);
// Three-tier grandstand, two rows of seated spectators, with an airy cantilever shade.
for(let r=0;r<3;r++){
 box(.9,.3+r*.35,10,12.8+r*.85,(.3+r*.35)/2,0,cream);
 box(.4,.09,9.4,12.8+r*.85,.37+r*.35,0,wood);
}
const canopy=new THREE.Group();root.add(canopy);
for(const z of [-4.9,4.9])box(.12,3.4,.12,15.2,1.7,z,metal);
box(3.1,.12,10.5,14,3.5,0,cream,canopy);
for(let i=0;i<5;i++)box(3,.035,.05,14,3.57,-4+i*2,metal,canopy);
const spectators=[];
const crowdReady=Promise.all(Array.from({length:12},async(_,i)=>{
 const row=Math.floor(i/6),g=new THREE.Group();g.position.set(13.55+row*.8,.65+row*.35,-4.1+(i%6)*1.64);g.rotation.y=-PI/2;fine.add(g);
 const gltf=await H.loadChar(['character-male-a','character-female-b','character-male-c','character-female-d'][i%4]);
 gltf.scene.scale.setScalar(1.65);g.add(gltf.scene);gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});
 const mixer=new THREE.AnimationMixer(gltf.scene),clip=gltf.animations.find(c=>c.name==='sit');if(clip)mixer.clipAction(H.groundCharClip(clip)).play();
 spectators.push({g,mixer});
})).catch(e=>console.warn('Tennis audience',e));
// Benches, towels, water bottles, ball basket and a practice racket.
for(const x of [6.5,10.5]){
 box(2,.12,.6,x,.5,7.3,wood,fine);box(2,.45,.08,x,.8,7.58,wood,fine);
 for(const dx of [-.8,.8])box(.09,.5,.5,x+dx,.25,7.3,metal,fine);
 box(.7,.025,.45,x-.4,.58,7.3,cream,fine);
 for(const dx of [.35,.65]){H.mesh(new THREE.CylinderGeometry(.065,.065,.25,8),H.mat(0x8fd1cb),fine,x+dx,.69,7.25);}
}
box(.5,.55,.5,11.5,.3,5.1,metal,fine);
for(let i=0;i<12;i++)H.mesh(new THREE.SphereGeometry(.07,8,6),lime,fine,11.35+(i%3)*.14,.6+Math.floor(i/9)*.1,4.96+Math.floor(i/3)%3*.14);
function racket(){const g=new THREE.Group();const hoop=H.mesh(new THREE.TorusGeometry(.22,.025,6,24),navy,g,0,.32,0);hoop.scale.y=1.3;box(.055,.35,.055,0,0,0,metal,g);
for(let i=-2;i<=2;i++){box(.33,.008,.008,0,.32+i*.075,0,cream,g);box(.008,.43,.008,i*.065,.32,0,cream,g);}return g;}
const rackets=[racket(),racket()];for(const r of rackets)H.scene.add(r);
// Slender cypress planting and low clipped hedges frame the spectator side.
for(const z of [-5.5,5.5])for(const x of [13.2,14.6]){box(.65,.3,.65,x,.15,z,cream);H.mesh(new THREE.ConeGeometry(.42,2.4,7),H.mat(0x28583c),root,x,1.5,z);}
// Live rally display, not fabricated match scores.
const scoreCanvas=document.createElement('canvas');scoreCanvas.width=768;scoreCanvas.height=256;const sc=scoreCanvas.getContext('2d'),scoreTex=new THREE.CanvasTexture(scoreCanvas);scoreTex.encoding=THREE.sRGBEncoding;
for(const x of [7,10])box(.08,3,.08,x,1.5,-6.7,metal);
const score=H.mesh(new THREE.PlaneGeometry(3.8,1.25),new THREE.MeshBasicMaterial({map:scoreTex,toneMapped:false}),root,8.5,2.75,-6.65);
let lastHits=-1;
function scoreboard(){const hits=H.tennis.rally.hits;if(lastHits===hits)return;lastHits=hits;sc.fillStyle='#0d2729';sc.fillRect(0,0,768,256);sc.textAlign='center';sc.fillStyle='#e3d5a1';sc.font='bold 38px sans-serif';sc.fillText('A.C.E.  TENNIS CLUB',384,56);sc.fillStyle='#ffffff';sc.font='bold 52px sans-serif';sc.fillText('阿傑  ×  '+(F.court.B.ready?F.court.B.who.name:'小夏'),384,126);sc.font='30px sans-serif';sc.fillStyle='#b9e4bd';sc.fillText('練習回合 · 已擊球 '+hits+' 次',384,199);scoreTex.needsUpdate=true;}
const lights=[],glows=[];
const glowTex=tex(128,128,c=>{const g=c.createRadialGradient(64,64,3,64,64,64);g.addColorStop(0,'rgba(210,247,230,.32)');g.addColorStop(1,'rgba(210,247,230,0)');c.fillStyle=g;c.fillRect(0,0,128,128);});
for(const x of [5.15,11.85])for(const z of [-4.8,4.8]){
 box(.075,4.6,.075,x,2.3,z,metal);box(.65,.18,.32,x,4.65,z,metal);
 const bulb=H.mesh(new THREE.PlaneGeometry(.52,.24),new THREE.MeshBasicMaterial({color:0xe4ffef,toneMapped:false,side:THREE.DoubleSide}),root,x,4.54,z);bulb.rotation.x=PI/2;
 const light=new THREE.SpotLight(0xe1f9e8,0,16,.65,.6,1.2);light.position.set(x,4.5,z);light.target.position.set(8.5,0,z*.35);root.add(light,light.target);lights.push(light);
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));sprite.position.set(x,4.55,z);sprite.scale.set(1.7,1.7,1);root.add(sprite);glows.push(sprite);
}
// One local shadow map; the other lamps illuminate without extra shadow passes.
lights[0].castShadow=true;lights[0].shadow.mapSize.set(512,512);lights[0].shadow.bias=-.001;lights[0].shadow.normalBias=.03;
// Keep the club's diffuse materials from reflecting a bright indoor environment at night.
const clubMaterials=new Set();F.g.traverse(o=>{if(o.isMesh&&o.material?.isMeshStandardMaterial&&!o.material.emissive.getHex()){o.material=o.material.clone();clubMaterials.add(o.material);}});
const baseDay=H.setDaylight;H.setDaylight=min=>{baseDay(min);const night=1-H.daylight;for(const m of clubMaterials)m.envMapIntensity=.08+H.daylight*.22;for(const l of lights)l.intensity=night*2.8;for(const g of glows)g.material.opacity=night;};
let time=0;
function update(dt){time+=dt;scoreboard();for(const s of spectators)s.mixer.update(dt);
 const partner=F.court.B.ready?F.court.B.who:H.tennis.sparring;
 [H.tennis.coach,partner].forEach((a,i)=>{const g=a.c?.g||a.g,r=rackets[i];g.updateWorldMatrix(true,false);r.position.copy(g.localToWorld(new V(.4,1,.3)));r.rotation.set(-.3, g.rotation.y,Math.sin(time*5.4+i*PI)*.7);});
 const center=F.W(8.5,0),distance=H.camera.position.distanceTo(center);fine.visible=distance<95;canopy.visible=distance>32;for(const s of spectators)s.g.visible=distance<65;
}
function focus(){H.focusOn(F.c[0]+8.5,F.c[2],34);H.goal.ty=F.c[1]+1;H.goal.theta=-.75;H.goal.phi=.85;}
const button=document.createElement('button');button.id='v-tennis-club';button.textContent='球場';button.title=button.ariaLabel='精緻網球俱樂部';button.style.fontSize='12px';button.onclick=focus;document.querySelector('.rail').append(button);
H.tennisClub={root,fine,net,spectators,crowdReady,lights,glows,rackets,score,focus,update};
const previous=H.updateWorld;H.updateWorld=(dt,t)=>{previous(dt,t);update(H.state.speed>0&&!H.reduced?dt*Math.min(H.state.speed,3):0);};scoreboard();
})();
