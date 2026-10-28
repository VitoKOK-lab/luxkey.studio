/* 22 × 15 m interior; a quiet, planted site rather than floating terrain. */
(() => {
const {box,round,cyl,ell,mesh,m,scene}=A,T=THREE,P=Math.PI;
const grass=A.texture('grain','#63794d');grass.repeat.set(35,35);
box(220,.2,220,0,-.28,0,A.mat(0xffffff,{map:grass,roughness:1,envMapIntensity:.12}));
round(49,.12,42,2,0,-.1,1,m.concrete);round(46,.1,39,1.5,0,-.045,1,A.mat(0x617c48,{roughness:1}));
// Entrance drive and long architectural stepping stones.
round(18,.035,9,1,-12,.015,14.5,A.mat(0x686e64,{roughness:.95}));
for(let i=0;i<7;i++)box(3.5,.055,1.05,1,.035,8.7+i*1.5,m.stone);
box(22,.24,15,0,.12,0,m.stone);A.floorArea=330;
// Large-format stone joints, deliberately subtle.
const grout=A.mat(0xb5b2a5);for(let x=-9;x<=9;x+=3)box(.013,.004,15,x,.243,0,grout);for(let z=-6;z<=6;z+=3)box(22,.004,.013,0,.243,z,grout);
box(22,4.4,.26,0,2.44,-7.5,m.white);box(.28,4.4,15,-11,2.44,0,m.white);
// Bronze fins create a shaded west wall with carefully spaced reveals.
for(let z=-7;z<=7;z+=.4)box(.17,4.4,.085,-11.2,2.44,z,m.wood);
box(22.6,.25,.45,0,4.5,7.5,m.dark);box(.45,.25,15.4,11,4.5,0,m.dark);box(22.6,.25,.45,0,4.5,-7.5,m.dark);
function glass(w,h,d,x,y,z){const g=box(w,h,d,x,y,z,m.glass);g.castShadow=false;return g;}
for(const x of [-10.8,-7.3,-3.6,3.6,7.3,10.8]){box(.075,4.2,.12,x,2.35,7.5,m.dark);}
for(const [x,w]of [[-9.1,3.3],[-5.45,3.5],[5.45,3.5],[9.1,3.3]])glass(w,4,.035,x,2.3,7.5);
for(const z of [-7.35,-3.75,0,3.75,7.35])box(.12,4.2,.075,11,2.35,z,m.dark);
for(const z of [-5.55,-1.85,1.85,5.55])glass(.035,4,3.55,11,2.3,z);
// Open front entry, reflecting pool and cantilevered blade.
for(const x of [-1.9,1.9])box(.16,4.2,.16,x,2.35,7.5,m.bronze);
box(5.6,.16,3,0,4.28,8.3,m.white);box(4.5,.035,.08,0,4.18,9.5,m.light);
A.roof=new T.Group();A.roof.name='可切換的實體屋頂';scene.add(A.roof);A.roof.visible=true;
for(const [w,d,x,z]of [[23.2,5.8,0,-5.3],[23.2,5.8,0,5.3],[7.6,4.8,-7.8,0],[7.6,4.8,7.8,0]])box(w,.3,d,x,4.65,z,m.white,A.roof);
const skylight=box(8,.05,4.8,0,4.69,0,m.glass,A.roof);skylight.castShadow=false;
for(const x of [-8,-3,3,8]){box(.045,.055,12.5,x,4.35,0,m.light,A.roof);A.point(x,3.5,0,2,11);}
// Rear feature wall and built-in storage.
box(6,3.5,.2,6.8,2.05,-7.3,m.wood);A.label('A.C.E.  ATELIER',4,.8,6.8,2.8,-7.16);
for(let x=-9.9;x<1;x+=1.2){box(1.16,.8,.65,x,.65,-7,m.wood);box(1.2,.05,.72,x,1.08,-7,m.stone);}
const coffee=new T.Group();scene.add(coffee);box(.65,.5,.45,-7.9,1.35,-6.9,m.dark,coffee);box(.5,.08,.5,-7.9,1.12,-6.9,m.bronze,coffee);cyl(.07,.12,-7.9,1.19,-6.65,m.white,coffee);A.label('COFFEE',.6,.2,-7.9,1.43,-6.66);
for(let i=0;i<5;i++){cyl(.065,.1,-6.9+i*.22,1.15,-6.8,m.white);}
// Twelve individual workstations around six shared tables.
A.desks=[];
const screenTex=(()=>{const c=document.createElement('canvas');c.width=512;c.height=320;const g=c.getContext('2d');g.fillStyle='#142e2a';g.fillRect(0,0,512,320);g.fillStyle='#c1b48d';g.font='28px Georgia';g.fillText('Create something meaningful.',30,60);for(let i=0;i<6;i++){g.fillStyle=i%2?'#456057':'#315248';g.fillRect(30,100+i*27,230-i*18,7);}g.fillStyle='#9b9271';g.fillRect(325,100,150,160);g.fillStyle='#d4c8a1';g.beginPath();g.arc(400,180,52,0,P*2);g.fill();const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;return new T.MeshBasicMaterial({map:t});})();
function chair(x,z,ry,color=m.fabric){const g=new T.Group();g.position.set(x,.24,z);g.rotation.y=ry;scene.add(g);round(.56,.12,.55,.1,0,.48,0,color,g);round(.56,.56,.1,.1,0,.78,-.26,color,g);cyl(.035,.4,0,.24,0,m.dark,g);for(let i=0;i<5;i++){const a=i*P*2/5;const b=box(.04,.04,.32,Math.sin(a)*.14,.07,Math.cos(a)*.14,m.dark,g);b.rotation.y=a;cyl(.05,.045,Math.sin(a)*.29,.055,Math.cos(a)*.29,m.black,g);}for(const x of [-.3,.3])box(.045,.08,.35,x,.7,0,m.dark,g);return g;}
A.chair=chair;
for(const x of [-8,-4,0])for(const z of [-4.25,-.9]){
 round(2.65,.09,1.5,.08,x,1.02,z,m.wood);for(const dx of [-1.14,1.14])box(.065,.73,1.25,x+dx,.63,z,m.dark);
 for(const s of [-1,1]){
  const dz=z+s*.35;box(.64,.39,.035,x,1.42,dz,m.dark);const scr=mesh(new T.PlaneGeometry(.6,.34),screenTex,scene,x,1.42,dz+s*.024);scr.rotation.y=s===1?0:P;
  cyl(.025,.2,x,1.15,dz,m.dark);round(.22,.025,.18,.03,x,1.075,dz,m.dark);
  round(.42,.018,.16,.015,x,1.077,z+s*.6,m.white);round(.07,.025,.1,.025,x+.34,1.08,z+s*.59,m.dark);
  chair(x,z+s*1.08,s===-1?0:P);A.desks.push({x,z:z+s*1.08,rotation:s===-1?0:P});
  cyl(.055,.13,x-.8,1.13,z+s*.5,m.white);box(.26,.02,.36,x+.8,1.08,z+s*.38,m.fabric);
 }
}
// Meeting room: clear partition, long rounded table, leather seats.
box(.07,2.8,6,2.3,1.65,-4.2,m.glass).castShadow=false;box(.05,.05,6,2.3,3.1,-4.2,m.bronze);
round(4.9,.1,2,.65,6.3,1.04,-3.8,m.stone);for(const x of [4.7,7.9])box(.22,.75,1.25,x,.62,-3.8,m.wood);
for(const x of [4.7,6.3,7.9])for(const s of [-1,1])chair(x,-3.8+s*1.4,s===-1?0:P,A.mat(0x785e43,{roughness:.8}));
for(const x of [4.8,6.4,8]){box(.35,.03,.24,x,1.11,-3.8,m.dark);cyl(.04,.22,x+.4,1.19,-3.8,m.glass);}
// Hospitality lounge: curved sofas, wool carpet and a bronze sculptural coffee table.
round(6.5,.018,4,.6,-6, .259,4.2,A.mat(0xb6b3a2,{roughness:1}));
function sofa(x,z,ry){const g=new T.Group();g.position.set(x,.24,z);g.rotation.y=ry;scene.add(g);round(3.2,.33,.95,.25,0,.4,0,m.fabric,g);round(3.25,.6,.26,.12,0,.75,-.43,m.fabric,g);for(const x of [-1.5,1.5])round(.23,.45,1,.1,x,.58,0,m.fabric,g);for(const x of [-1,0,1])round(.87,.08,.72,.1,x,.6,.03,A.mat(0xd5cdbc),g);return g;}
sofa(-6,2.7,0);sofa(-8.2,4.7,P/2);round(2.4,.08,1.1,.5,-5.5,.67,4.5,m.stone);cyl(.32,.36,-5.5,.46,4.5,m.bronze);box(.45,.04,.33,-5.8,.74,4.5,m.dark);cyl(.08,.1,-5,.78,4.5,m.white);
round(3.6,1,1.3,.4,5.8,.75,4.7,m.stone);box(3.4,.05,1.4,5.8,1.29,4.7,m.wood);A.label('A.C.E.',1.7,.6,5.8,.85,5.37,'#4e5a46');box(.6,.4,.04,6.5,1.6,4.65,m.dark);A.point(6,2,4,1.6,7);
// An abstract bronze ribbon in the entrance court.
const sculpture=new T.Group();sculpture.position.set(-2.5,.15,11.5);scene.add(sculpture);cyl(.8,.18,0,.09,0,m.stone,sculpture);const ribbon=mesh(new T.TorusKnotGeometry(.48,.085,128,16,2,3),m.bronze,sculpture,0,1,0);ribbon.scale.y=1.5;
// Pool: recessed basin, ceramic mosaic, coping, underwater light and animated surface.
A.pool={x:16,z:-.5,width:6,length:12};
round(8,.13,14,.25,16,.05,-.5,m.stone);const tile=A.texture('stone','#328b87');tile.repeat.set(8,16);
box(6,.06,12,16,.126,-.5,A.mat(0xffffff,{map:tile,roughness:.4}));
for(const x of [12.9,19.1])box(.22,.18,12.4,x,.17,-.5,m.white);for(const z of [-6.6,5.6])box(6.4,.18,.22,16,.17,z,m.white);
const waterGeo=new T.PlaneGeometry(6,12,64,100);waterGeo.rotateX(-P/2);
const waterMat=new T.ShaderMaterial({transparent:true,uniforms:{time:{value:0},night:{value:0}},vertexShader:'varying vec2 vUv;uniform float time;void main(){vUv=uv;vec3 p=position;p.y+=sin(p.x*4.+time)*sin(p.z*2.8+time*.8)*.015;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',fragmentShader:'varying vec2 vUv;uniform float time;uniform float night;void main(){float a=sin(vUv.x*83.+vUv.y*27.+time*.7);float b=sin(vUv.x*21.-vUv.y*97.+time*.5);float d=sin(vUv.x*149.+vUv.y*151.-time*.4);float c=pow(max(0.,.5+a*.25+b*.17+d*.08),14.);vec3 base=mix(vec3(.045,.42,.40),vec3(.025,.19,.23),night);vec3 col=base+c*vec3(.07,.14,.12);float edge=smoothstep(.0,.12,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y)));col+=vec3(.12,.22,.17)*(1.-edge);gl_FragColor=vec4(col,.83);}'});
const water=mesh(waterGeo,waterMat,scene,16,.165,-.5);water.castShadow=false;A.updates.push(t=>waterMat.uniforms.time.value=t);A.waterMaterial=waterMat;
for(const z of [-4.8,0,4.5]){const l=A.point(16,.5,z,1.2,5);l.color.set(0x65dfdb);}
for(const z of [-4,0,4]){const g=new T.Group();g.position.set(21,.2,z);scene.add(g);round(1,.12,2.25,.1,0,.28,0,m.wood,g);round(.86,.13,1.75,.12,0,.4,.15,m.fabric,g);const back=round(.86,.13,.8,.12,0,.63,-.75,m.fabric,g);back.rotation.x=-.5;for(const x of [-.38,.38])box(.06,.28,1.9,x,.14,0,m.dark,g);cyl(.28,.5,-1,.25,.4,m.stone,g);}
// Side terrace slats, low garden walls and grazing-light bollards.
for(let i=0;i<22;i++)box(.12,.06,12,11.35+i*.04,.22,-.5,m.wood);
for(const x of [-23,23])box(.25,.7,36,x,.35,0,m.stone);box(46,.7,.25,0,.35,-18,m.stone);
for(const [x,z]of [[-20,7],[-20,-8],[21,10],[9,15],[-7,18]]){box(.14,.8,.14,x,.4,z,m.dark);box(.15,.07,.15,x,.77,z,m.light);A.point(x,.7,z,.7,5);}
})();
