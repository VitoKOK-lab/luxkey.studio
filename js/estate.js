/* A.C.E. estate: real low-poly geometry, shared with the existing simulation. */
(() => {
const H = HQ, {scene, mesh, mat, box} = H, PI = Math.PI;
const estate = new THREE.Group(); estate.name = 'ace-estate'; scene.add(estate);
const roofs = new THREE.Group(); roofs.name = 'estate-roofs'; estate.add(roofs);
const wood = mat(0x956b47), dark = mat(0x17363c), tile = mat(0x28565b, {flatShading:true});
const stone = mat(0xf2e7ce), paper = mat(0xffedc8, {emissive:0xffd58a, emissiveIntensity:.12});
const orange = mat(0xf37021), grass = mat(0x8cba80, {flatShading:true});
const rect = (w,h,d,x,y,z,m=stone,parent=estate) => mesh(box(w,h,d),m,parent,x,y,z);
const cylinder = (r,h,x,y,z,m=stone,n=8,parent=estate) => mesh(new THREE.CylinderGeometry(r,r,h,n),m,parent,x,y,z);
const obstacle = (x,z,w,d) => H.block(x-w/2,z-d/2,x+w/2,z+d/2,.15);
// A hipped lower roof plus a gabled upper roof: all surfaces have volume.
function hip(w,d,height,x,y,z,parent=roofs){
  const vertices = [-w/2,0,-d/2, w/2,0,-d/2, w/2,0,d/2, -w/2,0,d/2, -w*.28,height,0, w*.28,height,0];
  const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  g.setIndex([0,4,5,0,5,1,1,5,2,2,5,4,2,4,3,3,4,0,0,1,2,0,2,3]); g.computeVertexNormals();
  const roof = mesh(g,tile,parent,x,y,z);
  rect(w,.18,.2,x,y,z-d/2,dark,parent); rect(w,.18,.2,x,y,z+d/2,dark,parent);
  rect(.2,.18,d,x-w/2,y,z,dark,parent); rect(.2,.18,d,x+w/2,y,z,dark,parent);
  rect(w*.58,.22,.24,x,y+height,z,dark,parent);
  // Tile seams describe the slope without adding hundreds of draw calls.
  const seams=[];
  for(let px=-w*.27;px<=w*.27;px+=.38)for(const side of [-1,1])seams.push(px,.035,side*d/2,px,height+.035,0);
  const lines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(seams,3)),new THREE.LineBasicMaterial({color:0x17363c,transparent:true,opacity:.65}));
  lines.position.set(x,y,z);parent.add(lines);
  return roof;
}
function pavilion(x,z,w,d){
  // Floor remains at y=0, so seats and bridge heights keep working.
  rect(w,.06,d,x,.015,z,mat(0xc69d6b));
  for(const px of [x-w/2+.3,x+w/2-.3]) for(const pz of [z-d/2+.3,z+d/2-.3]){
    rect(.2,3.5,.2,px,1.75,pz,wood); obstacle(px,pz,.2,.2);
  }
  rect(w, .24, .25,x,3.4,z+d/2-.3,wood);
  rect(w, .24, .25,x,3.4,z-d/2+.3,wood);
  hip(w+1,d+1,1.65,x,3.55,z);
  hip(w*.65,d*.55,1.8,x,4.85,z);
}
// Shoji rear wall and west wing; front and cross-court corridors stay open.
for(let x=-14; x<=14; x+=2){
  rect(1.95,3.2,.15,x,1.6,-11,paper);
  for(const dx of [-.95,0,.95]) rect(.055,3.25,.19,x+dx,1.62,-10.99,wood);
  for(const y of [.45,1.2,1.95,2.7,3.22]) rect(2,.05,.2,x,y,-10.98,wood);
}
for(let z=-9;z<=9;z+=2){
  rect(.15,3.2,1.95,-15,1.6,z,paper);
  for(const dz of [-.95,0,.95]) rect(.19,3.25,.055,-14.99,1.62,z+dz,wood);
  for(const y of [.45,1.2,1.95,2.7,3.22]) rect(.2,.05,2,-14.98,y,z,wood);
}
pavilion(-10.3,-7.5,9,6.6); pavilion(1.7,-7.5,14,6.6);
pavilion(-10.3,5,8.8,6.8); pavilion(12.5,-8.7,4.6,4.6);
// Wood slats along the engawa; no raised edge across the walking routes.
for(let x=-14;x<9;x+=.45) rect(.025,.012,1.15,x,.07,-3.4,dark);
for(let z=1.6;z<9;z+=.4) rect(1,.012,.025,-5.5,.07,z,dark);

// A Gothic conference pavilion around the original meeting seats.
const hall = new THREE.Group(); hall.name='gothic-hall'; estate.add(hall);
rect(5.7,.08,6.0,12.3,.03,-2,stone,hall);
rect(5.7,4.4,.25,12.3,2.2,-5,stone,hall); obstacle(12.3,-5,5.7,.25);
function pointedArch(x,y,z,w,h,parent){
  const curve=new THREE.CurvePath();
  curve.add(new THREE.LineCurve3(new THREE.Vector3(-w/2,0,0),new THREE.Vector3(-w/2,h*.5,0)));
  curve.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-w/2,h*.5,0),new THREE.Vector3(-w/2,h*.8,0),new THREE.Vector3(0,h,0)));
  curve.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,h,0),new THREE.Vector3(w/2,h*.8,0),new THREE.Vector3(w/2,h*.5,0)));
  curve.add(new THREE.LineCurve3(new THREE.Vector3(w/2,h*.5,0),new THREE.Vector3(w/2,0,0)));
  return mesh(new THREE.TubeGeometry(curve,16,.10,5,false),stone,parent,x,y,z);
}
// Open arches allow entry from the central court and the south.
for(const z of [-3.8,-.4]){
  for(const x of [8.9,15]){ rect(.24,4.2,.24,x,2.1,z,stone,hall); obstacle(x,z,.24,.24); }
}
pointedArch(12.3,0,1,5.2,5.6,hall);
for(const x of [9.7,14.9]){
  rect(.5,4.8,.5,x,2.4,-4.8,stone,hall);
  mesh(new THREE.ConeGeometry(.65,2.2,4),tile,roofs,x,6,-4.8).rotation.y=PI/4;
  cylinder(.07,.7,x,7.4,-4.8,orange,6,roofs);
}
hip(6.0,6.4,2.2,12.3,4.5,-2);
const rose = new THREE.Group(); rose.position.set(12.3,4.15,1.02); hall.add(rose);
mesh(new THREE.TorusGeometry(.85,.12,6,24),wood,rose);
mesh(new THREE.CircleGeometry(.76,24),mat(0xf7b863,{emissive:0xf37021,emissiveIntensity:.5}),rose,0,0,-.015);
for(let i=0;i<8;i++){ const spoke=rect(.06,1.6,.07,0,0,.02,dark,rose);spoke.rotation.z=i*PI/4; }
// The existing dynamic meeting screen is now the hall's large projection screen.
H.screens.meet.g.position.set(12.3,1.65,-4.58); H.screens.meet.g.rotation.y=0; H.screens.meet.g.scale.setScalar(1.65);

// Infinity pool: animated vertex displacement and water caustics; no image plane backdrop.
rect(5.8,.16,4.6,3,.04,7,stone);
const waterUniforms={time:{value:0},day:{value:1}};
const waterMaterial = new THREE.ShaderMaterial({uniforms:waterUniforms,side:THREE.DoubleSide,
  vertexShader:`uniform float time; varying vec2 uvWater; void main(){uvWater=uv;vec3 p=position;p.z+=sin(p.x*3.0+time)*cos(p.y*2.5+time*.7)*.025;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
  fragmentShader:`uniform float time;uniform float day;varying vec2 uvWater;void main(){float c=pow(max(0.0,sin(uvWater.x*60.0+sin(uvWater.y*35.0+time)*2.0+time)),14.0);vec3 col=mix(vec3(.04,.40,.47),vec3(.23,.77,.78),uvWater.y);col+=c*.15;gl_FragColor=vec4(col*(.40+.60*day),1.0);}`});
const water=mesh(new THREE.PlaneGeometry(5.25,4.05,16,12),waterMaterial,estate,3,.16,7);water.rotation.x=-PI/2;water.castShadow=false;
obstacle(3,7,5.8,4.6);
// Spill lip and narrow cascade down the front edge, clear of the walking surface.
rect(5.25,.12,.12,3,.17,9.16,mat(0x76e0d5));
for(let i=0;i<12;i++) rect(.2,.7,.08,.55+i*.44,-.26,9.21,mat(0x70cec8,{transparent:true,opacity:.65}));
const loungerSpots = [[7,5.8],[7,8.3],[-1,6.5]];
for(const [x,z] of loungerSpots){
  const chair=new THREE.Group();chair.position.set(x,0,z);chair.rotation.y=x>3?-PI/2:PI/2;estate.add(chair);
  rect(1.1,.3,1.5,0,.2,0,wood,chair);rect(.95,.12,1.35,0,.41,0,mat(0xfff1dc),chair);
  const back=rect(.95,.6,.12,0,.68,-.58,mat(0xfff1dc),chair);back.rotation.x=.25;
}
cylinder(.04,2.8,7.8,1.4,7,dark);
mesh(new THREE.ConeGeometry(1.6,.65,8),mat(0xf37021),estate,7.8,3,7);
obstacle(7.8,7,.15,.15);

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

// Pocket zen garden, stones, koi pond and stone lanterns.
rect(4.6,.08,2.6,-10,.025,-.4,mat(0xd5d6ad));obstacle(-10,-.4,4.6,2.6);
for(let i=0;i<6;i++){
  const ring=mesh(new THREE.RingGeometry(.25+i*.12,.27+i*.12,32),mat(0xb5b996),estate,-10,.072,-.5);ring.rotation.x=-PI/2;
}
for(const [x,z,s] of [[-10.4,-.5,.5],[-9.4,-.2,.35],[-11,0,.25]]){const rock=mesh(new THREE.DodecahedronGeometry(s,0),mat(0x7b8d8d,{flatShading:true}),estate,x,s*.5,z);rock.scale.y=.75;}
const pond=mesh(new THREE.CylinderGeometry(.7,.8,.06,20),mat(0x56a8a6),estate,-8.5,.10,-.5);pond.scale.z=1.2;
for(const x of [-13.6,-6.5]){
  cylinder(.16,.6,x,.3,.1,stone);rect(.46,.38,.46,x,.8,.1,paper);hip(.7,.7,.3,x,1.02,.1,estate);obstacle(x,.1,.5,.5);
}
// Low-poly maples frame the estate, leaving all bridge exits free.
for(const [x,z] of [[-13.6,-1.8],[-5.4,7.8],[8.6,-2.4]]){
  cylinder(.1,1.8,x,.9,z,wood,6);
  for(const [dx,dy,dz,r] of [[0,2,0,.8],[-.45,1.7,.1,.55],[.45,1.8,-.1,.55]])mesh(new THREE.IcosahedronGeometry(r,0),mat(0xe69c48,{flatShading:true}),estate,x+dx,dy,z+dz);
  obstacle(x,z,.35,.35);
}
H.estate={group:estate,roofs,pool:{x0:.1,x1:5.9,z0:4.7,z1:9.3},waterUniforms};
H.setEstateRoofs=visible=>{
  roofs.visible=!!visible;
  const button=document.getElementById('v-roof');
  button.setAttribute('aria-pressed',String(roofs.visible));button.classList.toggle('act',roofs.visible);
  button.setAttribute('aria-label',roofs.visible?'隱藏屋頂，查看室內':'顯示莊園屋頂');
  button.title=button.getAttribute('aria-label');
};
document.getElementById('v-roof').addEventListener('click',()=>H.setEstateRoofs(!roofs.visible));
H.setEstateRoofs(true);
const update=H.updateWorld;
H.updateWorld=(dt,t)=>{update(dt,t);waterUniforms.time.value=H.reduced?0:t;waterUniforms.day.value=H.daylight;};
})();
