/* Four actual 3D swimmers keep their strokes and turns inside the pool. */
(() => {
const H=HQ,PI=Math.PI,swimmers=[];
for(let i=0;i<4;i++){
 const g=new THREE.Group();g.name='pool-swimmer-'+i;H.scene.add(g);
 const s={g,lane:5.15+i*1.2,x:-3.15+i*2.05,direction:i%2?-1:1,speed:.65+i*.08,rest:0,phase:i*PI*.6,rig:null};swimmers.push(s);
 H.loadChar(['character-male-b','character-female-c','character-male-d','character-female-b'][i]).then(gltf=>{
  const root=gltf.scene;root.scale.setScalar(1.85);root.rotation.x=-PI/2;g.add(root);
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
  s.rig={root,arms:['arm-left','arm-right'].map(n=>root.getObjectByName(n)),legs:['leg-left','leg-right'].map(n=>root.getObjectByName(n))};
  s.rig.arms.forEach(a=>a.userData.rest=a.quaternion.clone());s.rig.legs.forEach(a=>a.userData.rest=a.quaternion.clone());
 });
 g.position.set(s.x,.28,s.lane);g.rotation.y=s.direction>0?-PI/2:PI/2;
}
const ring=H.mesh(new THREE.TorusGeometry(.32,.11,8,20),H.mat(0xf2b854),H.scene,6.15,.26,9.5);ring.rotation.x=PI/2;
let clock=0;
function update(dt){
 clock+=dt;
 for(const s of swimmers){
  if(s.rest>0)s.rest=Math.max(0,s.rest-dt);
  else {s.x+=s.direction*s.speed*dt;if(s.x>=5.15||s.x<=-3.15){s.x=H.clamp(s.x,-3.15,5.15);s.direction*=-1;s.rest=1.7;}}
  const yaw=s.direction>0?-PI/2:PI/2,delta=Math.atan2(Math.sin(yaw-s.g.rotation.y),Math.cos(yaw-s.g.rotation.y));s.g.rotation.y+=delta*Math.min(1,dt*3);
  s.g.position.set(s.x,.28+Math.sin(clock*3+s.phase)*.025,s.lane);
  if(s.rig){const stroke=clock*2+s.phase;
   s.rig.arms.forEach((a,i)=>{a.quaternion.copy(a.userData.rest);a.rotateX(s.rest?-.4:stroke+i*PI);});
   s.rig.legs.forEach((a,i)=>{a.quaternion.copy(a.userData.rest);a.rotateX(Math.sin(stroke*2+i*PI)*(s.rest?.04:.22));});
  }
 }
}
H.swimmers=swimmers;H.updateSwimmers=update;
const b=document.createElement('button');b.style.cssText='font-size:12px;white-space:nowrap';b.id='v-pool';b.textContent='泳池';b.title=b.ariaLabel='泳池與泳客';b.onclick=()=>{H.focusOn(1,7.1,22);H.goal.ty=.6;};document.querySelector('.rail').append(b);
const previous=H.updateWorld;H.updateWorld=(dt,t)=>{previous(dt,t);update(H.state.speed>0&&!H.reduced?dt*Math.min(H.state.speed,3):0);};
})();
