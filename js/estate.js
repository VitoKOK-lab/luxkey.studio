/* A.C.E. estate: real low-poly geometry, shared with the existing simulation. */
(() => {
const H = HQ, {scene, mesh, mat, box} = H, PI = Math.PI;
const estate = new THREE.Group(); estate.name = 'ace-estate'; scene.add(estate);
const roofs = new THREE.Group(); roofs.name = 'estate-roofs'; estate.add(roofs);
const wood = mat(0x856a50), dark = mat(0x183039), stone = mat(0xe8e5dc, {roughness:.36});
const bronze = mat(0xb49a6b, {metalness:.65, roughness:.3});
const paper = mat(0xffeed5, {emissive:0xffd59a, emissiveIntensity:.35});
const orange = mat(0xf37021);
for(const finish of [wood,dark,stone,bronze])finish.color.convertSRGBToLinear();
const glass = new THREE.MeshPhysicalMaterial({color:0xb0dbe2, transparent:true, opacity:.17, roughness:.06, metalness:.05, clearcoat:1, envMapIntensity:.8, side:THREE.DoubleSide, depthWrite:false});
const rect = (w,h,d,x,y,z,m=stone,parent=estate) => mesh(box(w,h,d),m,parent,x,y,z);
const cylinder = (r,h,x,y,z,m=stone,n=12,parent=estate) => mesh(new THREE.CylinderGeometry(r,r,h,n),m,parent,x,y,z);
const obstacle = (x,z,w,d) => H.block(x-w/2,z-d/2,x+w/2,z+d/2,.15);
const glassPanels=[];
function glazing(w,h,x,y,z,rotation=0,parent=roofs){
  const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rotation;parent.add(g);
  const pane=mesh(new THREE.PlaneGeometry(w,h),glass,g);pane.castShadow=false;pane.renderOrder=2;glassPanels.push(pane);
  for(const side of [-1,1])rect(.045,h,.055,side*w/2,0,0,dark,g);
  for(const side of [-1,1])rect(w,.045,.055,0,side*h/2,0,dark,g);
  return g;
}
function rail(w,x,y,z,rotation=0){glazing(w,1.05,x,y+.525,z,rotation);const cap=rect(w,.035,.05,x,y+1.06,z,bronze,roofs);cap.rotation.y=rotation;}
function slab(w,d,x,y,z){
  rect(w,.22,d,x,y,z,stone,roofs);
  // Recessed bronze shadow gap gives the cantilevered slabs a thin edge.
  rect(w+.04,.055,d+.04,x,y-.07,z,bronze,roofs);
}
function lounge(x,y,z,parent=roofs){
  rect(2.6,.36,.95,x,y+.32,z,mat(0xd0c4b3),parent);rect(2.6,.55,.16,x,y+.68,z-.42,stone,parent);
  rect(.7,.14,.65,x+.8,y+.58,z,mat(0x355658),parent);
  rect(1.3,.06,.7,x,y+.35,z+1.3,mat(0x6b655d,{roughness:.25}),parent);
  for(const dx of [-.5,.5])rect(.05,.32,.5,x+dx,y+.16,z+1.3,bronze,parent);
}
function planter(x,y,z,parent=roofs){
  rect(.7,.5,.7,x,y+.25,z,stone,parent);
  cylinder(.04,.8,x,y+.8,z,wood,8,parent);
  const crown=mesh(new THREE.IcosahedronGeometry(.48,1),mat(0x487267,{flatShading:true}),parent,x,y+1.25,z);crown.scale.y=1.25;
}
// Three actual levels and a 13.2 m atrium. Upper galleries frame an open void.
const levels=[0,4.4,8.8],top=13.2;
for(const x of [-14.8,-6.2,8.8,14.8]){
  rect(.22,4.4,.22,x,2.2,-10.8,dark);rect(.22,8.8,.22,x,8.8,-10.8,dark,roofs);obstacle(x,-10.8,.22,.22);
}
for(const x of [-14.8,14.8]){
  rect(.22,4.4,.22,x,2.2,-3.7,dark);rect(.22,8.8,.22,x,8.8,-3.7,dark,roofs);obstacle(x,-3.7,.22,.22);
}
for(const y of levels.slice(1)){
  // Rear gallery and two side wings leave the centre open through all three floors.
  slab(30.6,2.9,0,y,-9.65);
  slab(7.3,5.1,-11.65,y,-5.65);slab(5.5,5.1,12.55,y,-5.65);
  rail(15.5,0,y+.12,-8.16);
  rail(5.0,-8.02,y+.12,-5.65,PI/2);rail(5.0,9.78,y+.12,-5.65,PI/2);
  lounge(-11.5,y+.12,-6.5);lounge(12.4,y+.12,-6.5);
  for(const x of [-13,-5,5,13])planter(x,y+.12,-10.1);
}
// Perimeter roof frames a transparent skylight over the three-storey void.
slab(31.2,2.8,0,top,-9.95);slab(31.2,.85,0,top,-3.075);
for(const x of [-10.8,10.8])slab(9.6,5.05,x,top,-6.025);
const skylight=glazing(12,5.05,0,top+.13,-6.025);skylight.rotation.x=-PI/2;
for(const x of [-13.2,13.2]){
 rect(1.2,.35,3.8,x,top+.29,-9.2,stone,roofs);
 rect(1,.3,3.6,x,top+.6,-9.2,mat(0x416a58),roofs);
}
// Broad full-height curtain walls, with open ground-floor entrances toward the pool.
for(let x=-13.5;x<=13.5;x+=3){
  for(const y of levels){glazing(3,4.18,x,y+2.2,-11.15);}
  for(const y of [4.4,8.8])glazing(3,4.18,x,y+2.2,-3.02);
}
for(const x of [-15.18,15.18])for(const y of levels)glazing(8.1,4.18,x,y+2.2,-7.05,PI/2);
// The west salon is a lower glass volume, leaving the three-storey main atrium legible.
slab(9.7,9.2,-10.35,4.4,4.8);
for(const z of [1.5,4.5,7.5])glazing(3,4.15,-15.18,2.2,z,PI/2);
for(const x of [-14.8,-6]){rect(.18,4.4,.18,x,2.2,9.1,dark);obstacle(x,9.1,.18,.18);}
for(const x of [-13.5,-10.5])glazing(3,3.95,x,2.2,9.3);
// A visible staircase joins the upper galleries; it does not obstruct ground-floor workstations.
for(let flight=0;flight<2;flight++){
 const y=4.4+flight*2.2;
 for(let i=0;i<11;i++)rect(1.45,.16,.30,flight?6.5:4.8,y+i*.2,-10.5+i*.26,stone,roofs);
}
// Double-height glass boardroom; preserve the tested entrance and meeting seats.
const hall=new THREE.Group();hall.name='glass-boardroom';estate.add(hall);
rect(5.7,.08,6,12.3,.03,-2,stone,hall);
rect(5.7,3.1,.2,12.3,1.55,-5,dark,hall);obstacle(12.3,-5,5.7,.2);
for(const z of [-3.8,-.4])for(const x of [8.9,15]){rect(.18,7.4,.18,x,3.7,z,bronze,hall);obstacle(x,z,.18,.18);}
slab(6.3,6.5,12.2,7.4,-1.8);
for(const x of [9,15.15])glazing(5.9,3.95,x,5.25,-1.85,PI/2);
glazing(5.9,3.95,12.1,5.25,1.15);
H.screens.meet.g.position.set(12.3,1.65,-4.58);H.screens.meet.g.rotation.y=0;H.screens.meet.g.scale.setScalar(1.65);
// Suspended brass rings mark the tall atrium, without opaque decorative roof masses.
for(const [y,r] of [[7.2,1.6],[8.4,2.3],[10.0,1.1]]){
 const light=mesh(new THREE.TorusGeometry(r,.045,6,40),paper,roofs,0,y,-5.8);light.rotation.x=PI/2;
}
// Infinity pool: animated vertex displacement and water caustics; no image plane backdrop.
const pool={x0:-4.8,x1:6.8,z0:4.1,z1:10.1};
rect(12.0,.16,6.4,1,.04,7.1,stone);
const waterUniforms={time:{value:0},day:{value:1}};
const waterMaterial = new THREE.ShaderMaterial({uniforms:waterUniforms,side:THREE.DoubleSide,
  vertexShader:`uniform float time; varying vec2 uvWater; void main(){uvWater=uv;vec3 p=position;p.z+=sin(p.x*3.0+time)*cos(p.y*2.5+time*.7)*.025;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
  fragmentShader:`uniform float time;uniform float day;varying vec2 uvWater;void main(){float c=pow(max(0.0,sin(uvWater.x*60.0+sin(uvWater.y*35.0+time)*2.0+time)),14.0);vec3 col=mix(vec3(.04,.40,.47),vec3(.23,.77,.78),uvWater.y);col+=c*.15;gl_FragColor=vec4(col*(.40+.60*day),1.0);}`});
const water=mesh(new THREE.PlaneGeometry(11.6,6.0,24,16),waterMaterial,estate,1,.16,7.1);water.rotation.x=-PI/2;water.castShadow=false;
obstacle(1,7.1,11.6,6.0);
// Spill lip and narrow cascade down the front edge, clear of the walking surface.
rect(11.6,.10,.12,1,.17,10.17,mat(0x76e0d5));
rect(11.6,1.0,.04,1,-.4,10.23,mat(0x65bec7,{transparent:true,opacity:.5}));
const loungerSpots=[[7.8,5.6],[7.8,8.3],[-6,5.6],[-6,7.9]];
for(const [x,z] of loungerSpots){
  const chair=new THREE.Group();chair.position.set(x,0,z);chair.rotation.y=x>1?-PI/2:PI/2;estate.add(chair);
  rect(1.1,.3,1.5,0,.2,0,wood,chair);rect(.95,.12,1.35,0,.41,0,stone,chair);
  const back=rect(.95,.6,.12,0,.68,-.58,stone,chair);back.rotation.x=.25;
}
for(const x of [-6.8,7.8]){
 cylinder(.035,2.6,x,1.3,9.7,bronze);mesh(new THREE.ConeGeometry(1.4,.30,8),stone,estate,x,2.7,9.7);
 obstacle(x,9.7,.15,.15);
}
// Car court: roads are geometry, with edge paint and parking bays.
rect(6.2,.06,5.6,11.6,.02,8,mat(0x636e76));
for(const x of [8.6,14.6]) rect(.07,.012,5.5,x,.06,8,stone);
for(const z of [5.5,7.7,10.4]) rect(5.9,.012,.06,11.6,.06,z,stone);
for(const x of [9.4,11.6,13.8]) rect(.06,.012,2.2,x,.06,6.6,stone);
rect(6.1,.18,2.8,11.6,2.7,6.65,dark,roofs);
for(const x of [8.6,14.6]){rect(.2,2.7,.2,x,1.35,5.35,wood);obstacle(x,5.35,.2,.2);}
H.estateCars=[];
for(const [i,x] of [10.4,12.7].entries()){
  const car=new THREE.Group();car.name='estate-sports-car';car.position.set(x,0,6.6);estate.add(car);H.estateCars.push(car);
  rect(1.65,.38,2.6,0,.51,0,i?mat(0xf7f1df):orange,car);
  const hood=rect(1.5,.2,.9,0,.69,.8,i?stone:orange,car);hood.rotation.x=-.12;
  rect(1.3,.42,1.12,0,.86,-.12,dark,car);
  rect(1.72,.08,.3,0,.9,-1.2,dark,car);
  for(const side of [-1,1]) for(const z of [-.85,.85]){
    const wheel=mesh(new THREE.CylinderGeometry(.32,.32,.20,12),mat(0x202936),car,side*.84,.33,z);wheel.rotation.z=PI/2;
    const rim=mesh(new THREE.CylinderGeometry(.17,.17,.22,8),stone,car,side*.85,.33,z);rim.rotation.z=PI/2;
  }
  for(const x of [-.55,.55])rect(.35,.07,.035,x,.61,1.31,paper,car);
  obstacle(x,6.6,1.85,2.8);
}

// Minimal sculpture garden, pale stone and sculpted evergreen planting.
rect(4.6,.08,2.6,-10,.025,-.4,mat(0x9cae9b));obstacle(-10,-.4,4.6,2.6);
const sculpture=mesh(new THREE.TorusKnotGeometry(.45,.09,48,6),bronze,estate,-10,1.05,-.4);
rect(.85,.45,.85,-10,.225,-.4,stone);
for(const [x,z] of [[-13.6,-1.8],[-5.8,1],[8.6,-2.4]]){planter(x,0,z,estate);obstacle(x,z,.7,.7);}
H.estate={group:estate,roofs,pool,waterUniforms,levels,height:top,glassPanels};
H.setEstateRoofs=visible=>{
  roofs.visible=!!visible;
  document.body.classList.toggle("estate-exterior",roofs.visible);
  const button=document.getElementById('v-roof');
  button.setAttribute('aria-pressed',String(roofs.visible));button.classList.toggle('act',roofs.visible);
  button.setAttribute('aria-label',roofs.visible?'剖開上層，查看室內':'顯示完整玻璃莊園');
  button.title=button.getAttribute('aria-label');
};
document.getElementById('v-roof').addEventListener('click',()=>H.setEstateRoofs(!roofs.visible));
H.setEstateRoofs(true);
const update=H.updateWorld;
H.updateWorld=(dt,t)=>{update(dt,t);waterUniforms.time.value=H.reduced?0:t;waterUniforms.day.value=H.daylight;};
})();
