/* Carefully proportioned people, planted gardens, companion animals and coachbuilt cars. */
(() => {
const T=THREE,{box,round,ell,cyl,mesh,m,scene}=A,P=Math.PI;
function limb(a,b,r,mat,parent){const va=new T.Vector3(...a),vb=new T.Vector3(...b),o=mesh(new T.CylinderGeometry(r*.85,r,va.distanceTo(vb),12),mat,parent);o.position.copy(va).add(vb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),vb.sub(va).normalize());return o;}
// Olive-like branching trunks and individually oriented leaves use a single instanced draw.
const leaves=new T.InstancedMesh(new T.SphereGeometry(1,7,5),A.mat(0x57714c,{roughness:.9,envMapIntensity:.15}),2400);leaves.castShadow=true;scene.add(leaves);const dummy=new T.Object3D();let leafIndex=0;
function tree(x,z,size=1){const trunk=A.mat(0x70644e,{roughness:1});cyl(.13*size,3.4*size,x,1.7*size,z,trunk,scene,.23*size);
 for(let j=0;j<5;j++){const a=j*P*2/5,tip=[x+Math.cos(a)*1.3*size,(3.3+j*.16)*size,z+Math.sin(a)*1.3*size];limb([x,1.9*size,z],tip,.075*size,trunk,scene);}
 for(let j=0;j<240;j++){const a=A.rand()*P*2,r=Math.sqrt(A.rand())*2.2*size,y=(3.6+(A.rand()-.5)*1.8)*size;dummy.position.set(x+Math.cos(a)*r,y,z+Math.sin(a)*r);dummy.rotation.set(A.rand()*P,A.rand()*P,A.rand()*P);dummy.scale.set((.22+A.rand()*.18)*size,.045*size,.1*size);dummy.updateMatrix();leaves.setMatrixAt(leafIndex,dummy.matrix);leaves.setColorAt(leafIndex,new T.Color().setHSL(.24+A.rand()*.05,.22,.22+A.rand()*.15));leafIndex++;}
 A.shadow(x,z,2.5*size);
}
for(const [x,z,s]of [[-20,-11,1.4],[-16,-14,1.2],[-20,4,1.2],[-21,11,1],[3,-13,1.25],[19,-12,1.5],[22,13,1.1],[10,16,1],[-7,19,.8],[-16,19,.9]])tree(x,z,s);
function plant(x,z,y=0,s=1){cyl(.32*s,.65*s,x,y+.325*s,z,m.stone,scene,.25*s);const green=A.mat(0x365238);for(let j=0;j<10;j++){const a=j*2.4,h=(.7+A.rand()*.6)*s;limb([x,y+.6*s,z],[x+Math.cos(a)*.35*s,y+h,z+Math.sin(a)*.35*s],.012*s,green,scene);const l=ell(x+Math.cos(a)*.35*s,y+h,z+Math.sin(a)*.35*s,.13*s,.32*s,.025*s,green);l.rotation.set(.5,a,.4);}}
for(const [x,z,s]of [[10,6,1.3],[3,1,1.1],[-10,-6,1.1],[-9,6.3,.9],[9,-6.6,1],[-3,10,1],[12,8,1]])plant(x,z,.24,s);
const blade=new T.InstancedMesh(new T.ConeGeometry(.035,.5,3),A.mat(0x53613d),900);scene.add(blade);for(let i=0;i<900;i++){const side=i%3,x=side===0?-14+A.rand()*1.5:side===1?5+A.rand()*4:-21+A.rand()*42,z=side===0?-10+A.rand()*18:side===1?13+A.rand()*3:-16+A.rand();dummy.position.set(x,.2,z);dummy.rotation.set((A.rand()-.5)*.5,A.rand()*P,(A.rand()-.5)*.5);dummy.scale.set(1,.7+A.rand(),1);dummy.updateMatrix();blade.setMatrixAt(i,dummy.matrix);}
// Small flowering beds, kept clear of the drive and entrance walk.
for(let i=0;i<65;i++){const x=6+A.rand()*3,z=12.5+A.rand()*2;ell(x,.15,z,.18,.18,.18,m.leaf);ell(x,.36,z,.055,.065,.055,A.mat([0xddd9ca,0xc8b6b5,0xb9b8d0][i%3]));}
function person(id,x,z,rotation,seated=true){
 const g=new T.Group();g.name='同事 '+(id+1);g.position.set(x,.24,z);g.rotation.y=rotation;scene.add(g);
 const skin=A.mat([0xc68d6c,0xe4b995,0xa87355,0xd2a080][id%4],{roughness:.65}),cloth=A.mat([0x314b45,0xe0d9c9,0x526272,0x99816c,0x424440,0xb9b4a3][id%6],{roughness:.9}),pants=A.mat(0x343d39),hair=A.mat([0x30291f,0x493829,0x63503b][id%3]);
 const hip=seated?.58:.85,shoulder=hip+.45,head=hip+.77;
 ell(0,hip+.24,0,.21,.3,.13,cloth,g);ell(0,hip,0,.18,.12,.13,pants,g);
 cyl(.055,.12,0,head-.18,0,skin,g);ell(0,head,0,.115,.15,.105,skin,g);
 const cap=mesh(new T.SphereGeometry(.122,24,16,0,P*2,0,id%3===1?1.9:1.5),hair,g,0,head+.025,-.012);cap.scale.set(1,1.15,1);
 if(id%3===1)ell(0,head-.04,-.095,.115,.19,.055,hair,g);
 for(const s of [-1,1]){ell(s*.113,head-.01,0,.023,.04,.018,skin,g);ell(s*.041,head+.025,.096,.012,.008,.007,m.black,g);const brow=box(.03,.006,.008,s*.041,head+.053,.096,hair,g);brow.rotation.z=s*.08;}
 ell(0,head-.005,.109,.02,.028,.025,skin,g);box(.035,.006,.012,0,head-.064,.095,A.mat(0x955d4a),g);
 for(const s of [-1,1]){
 const knee=seated?[s*.12,.29,.35]:[s*.12,.43,.02],ankle=[s*.12,.08,seated?.4:.01];limb([s*.12,hip,0],knee,.075,pants,g);limb(knee,ankle,.057,pants,g);ell(s*.12,.045,seated?.47:.08,.075,.045,.15,m.black,g);
 const elbow=[s*.29,shoulder-.23,.10],hand=[s*.22,seated?.83:hip+.06,seated?.40:.18];limb([s*.2,shoulder,0],elbow,.065,cloth,g);limb(elbow,hand,.045,skin,g);ell(...hand,.05,.028,.07,skin,g);
 }
 if(id%4===0){for(const s of [-1,1]){const lens=mesh(new T.TorusGeometry(.033,.004,6,18),m.dark,g,s*.04,head+.025,.11);lens.scale.y=.8;}box(.02,.004,.006,0,head+.025,.11,m.dark,g);}
 A.shadow(x,z,.45,scene,.247);A.staff.push({g,id,head:cap});return g;
}
for(let i=0;i<8;i++){const d=A.desks[i];person(i,d.x,d.z,d.rotation);}
person(8,4.7,-2.4,P);person(9,7.9,-5.2,0);person(10,-6.2,-5.9,P,false);person(11,5.7,3.3,0,false);
// A relaxed dog and a sleeping cat: articulated organic forms, collars and facial detail.
function animal(type,x,z,ry){const g=new T.Group();g.name=type==='dog'?'庭院的狗':'休息區的貓';g.position.set(x,type==='dog'?.07:.86,z);g.rotation.y=ry;scene.add(g);
const dog=type==='dog',fur=A.mat(dog?0xb99361:0x8a8980,{roughness:1}),white=A.mat(0xd7c9a6,{roughness:1}),dark=m.black;
ell(0,.38,0,dog?.23:.15,dog?.26:.14,dog?.48:.3,fur,g);ell(0,dog?.72:.43,.4,dog?.18:.13,dog?.21:.13,dog?.16:.12,fur,g);ell(0,dog?.65:.4,.55,dog?.12:.08,.09,.13,white,g);ell(0,dog?.69:.41,.66,.05,.035,.025,dark,g);
for(const s of [-1,1]){ell(s*(dog?.10:.07),dog?.76:.47,.55,.022,.024,.012,dark,g);const ear=ell(s*(dog?.17:.11),dog?.7:.56,.38,dog?.085:.05,dog?.2:.10,.05,fur,g);ear.rotation.z=s*.25;for(const z of [-.25,.28]){ell(s*(dog?.16:.1),.17,z,.065,.18,.065,fur,g);ell(s*(dog?.16:.1),.035,z+.04,.075,.045,.11,fur,g);}}
const tail=new T.Group();tail.position.set(0,.46,-.4);g.add(tail);A.line([[0,0,0],[.1,.15,-.2],[.24,.27,-.32],[.34,.3,-.25]],dog?.065:.035,fur,tail);
if(dog){const collar=mesh(new T.TorusGeometry(.14,.022,8,28),A.mat(0x465d54),g,0,.59,.38);collar.rotation.x=.5;cyl(.035,.012,0,.5,.49,m.bronze,g);}
A.animals.push({g,tail});return g;}
animal('dog',-3.8,12,.7);animal('cat',-7.1,2.7,1.4);
// Hand-built luxury fastbacks: sculpted paint, glazing, lamps, wheel spokes and brake discs.
function car(x,z,ry,color){const g=new T.Group();g.name='Grand touring coupe';g.position.set(x,0,z);g.rotation.y=ry;scene.add(g);
const paint=new T.MeshPhysicalMaterial({color,metalness:.4,roughness:.24,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:.6}),glass=new T.MeshPhysicalMaterial({color:0x203638,metalness:.6,roughness:.08,clearcoat:1}),chrome=A.mat(0xbfc6c1,{metalness:1,roughness:.15});
round(2.02,.42,4.8,.4,0,.65,0,paint,g);round(1.94,.15,4.5,.32,0,.89,-.04,paint,g);
const cabin=ell(0,1.05,-.25,.86,.55,1.43,glass,g);box(1.45,.06,1.6,0,1.5,-.36,paint,g);
for(const s of [-1,1]){box(.045,.43,.055,s*.82,1.22,-.15,chrome,g);box(.045,.025,3.1,s*.98,.94,-.1,chrome,g);box(.15,.06,.04,s*1.01,.91,.05,chrome,g);ell(s*1.1,1.04,.58,.14,.065,.2,paint,g);}
round(1.55,.12,.12,.04,0,.77,2.38,m.black,g);for(let i=0;i<14;i++)box(.025,.12,.025,-.65+i*.1,.78,2.46,chrome,g);
for(const s of [-1,1]){round(.56,.06,.08,.025,s*.62,.91,2.24,m.light,g);round(.7,.055,.06,.025,s*.55,.9,-2.33,A.mat(0x802a25,{emissive:0xa52c22,emissiveIntensity:.5}),g);}
for(const s of [-1,1])for(const zz of [-1.45,1.48]){
 const wheel=cyl(.41,.24,s*1,.44,zz,m.black,g);wheel.rotation.z=P/2;
 const rim=cyl(.31,.255,s*1.01,.44,zz,chrome,g);rim.rotation.z=P/2;
 const hub=cyl(.1,.27,s*1.02,.44,zz,m.dark,g);hub.rotation.z=P/2;
 for(let i=0;i<10;i++){const a=i*P/5,spoke=box(.015,.03,.5,s*1.15,.44,zz,m.dark,g);spoke.rotation.x=a;}
 const brake=cyl(.23,.018,s*1.155,.44,zz,A.mat(0x777a74,{metalness:.9}),g);brake.rotation.z=P/2;
}
A.shadow(0,0,2.4,g,.036);A.cars.push(g);return g;}
car(-11.8,14.4,.12,0x344743);car(-17.3,14.2,.12,0xe0dcd0);
A.updates.push(t=>{for(const [i,a]of A.animals.entries())a.tail.rotation.z=Math.sin(t*1.4+i)*.13;for(const s of A.staff)s.head.rotation.y=Math.sin(t*.25+s.id)*.035;});
})();
