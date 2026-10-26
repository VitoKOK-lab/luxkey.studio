const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),run=promisify(execFile);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Drive application frames explicitly; browser input/animation APIs still work normally.
 await page.addInitScript(()=>{const raf=window.requestAnimationFrame;window.requestAnimationFrame=fn=>{if(fn.name==='frame'){window.appFrame=fn;return 0;}return raf(fn);};});
 if(process.env.HTTPS_PROXY)await page.route('https://**/*',async r=>{try{const {stdout}=await run('curl',['-fsS','--max-time','30',r.request().url()],{encoding:'buffer',maxBuffer:10000000});await r.fulfill({body:stdout});}catch{await r.abort();}});
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:8899/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>HQ.agents.every(a=>a.rig)&&HQ.kenneyAssets.loaded===8&&HQ.swimmers.every(s=>s.rig)&&HQ.tennis.sparring.rig&&HQ.sanctuary.vito.children.length,null,{polling:100});
 console.log('Assets loaded');
 const frame=()=>page.evaluate(()=>{HQ.reduced=true;HQ.setSpeed(0);window.appFrame(performance.now());});
 await frame();

 const travel=await page.evaluate(()=>{
  const H=HQ,I=H.ISL.res;H.scene.updateMatrixWorld(true);
  const doors=Object.values(I.houses).map(h=>{const p=h.g.localToWorld(new THREE.Vector3(0,0,1.9));return {error:Math.hypot(p.x-h.door.x,p.z-h.door.z),inside:Math.abs(h.door.x-I.c[0])<I.ax&&Math.abs(h.door.z-I.c[2])<I.az};});
  H.state.meeting=null;H.setSpeed(1);
  for(const a of H.agents){a.tasks=[];a.path=[];a.activity='desk';a.offMain=false;a.route=null;a.life=null;a.gy=0;a.c.g.visible=true;a.c.g.position.set(a.home.x,0,a.home.z);}
  const random=Math.random;try{Math.random=()=>0;H.lifeTick(1200);}finally{Math.random=random;}
  const departing=H.agents.filter(a=>a.activity==='commute').length;let unsupported=0;
  function check(){for(const a of H.agents){const p=a.c.g.position;
   if(Math.abs(p.x)<=16&&Math.abs(p.z)<=12){if(Math.abs(a.gy)>.06)unsupported++;continue;}
   if(Math.abs(p.x-I.c[0])<=I.ax&&Math.abs(p.z-I.c[2])<=I.az&&Math.abs(a.gy-I.y)<.12)continue;
   const path=[new THREE.Vector3(I.exit.x,0,I.exit.z),...I.bridge];let distance=Infinity;
   for(let j=0;j<path.length-1;j++){const b=path[j],v=path[j+1].clone().sub(b),t=H.clamp(p.clone().sub(b).dot(v)/v.lengthSq(),0,1);distance=Math.min(distance,p.distanceTo(b.clone().addScaledVector(v,t)));}
   if(distance>.08)unsupported++;
  }}
  for(let i=0;i<1600&&H.agents.some(a=>a.path.length);i++){H.updateAgents(.05,i*.05,performance.now());check();}
  const home=H.agents.every(a=>a.activity==='home'&&!a.c.g.visible&&a.c.g.position.distanceTo(I.houses[a.name].door)<.01);
  H.agents.forEach(a=>H.goHome(a));
  for(let i=0;i<1600&&H.agents.some(a=>a.path.length);i++){H.updateAgents(.05,i*.05,performance.now());check();}
  const office=H.agents.every(a=>!a.offMain&&a.c.g.position.y===0&&Math.hypot(a.c.g.position.x-a.home.x,a.c.g.position.z-a.home.z)<.01);
  const a=H.agents[0];a.c.g.position.set(15.25,0,5.25);a.gy=0;a.offMain=true;a.route=[...I.bridge];a.route.island=I;a.route.exit=I.exit;H.goHome(a);
  const lawn=a.path.every(p=>Math.abs(p.x)<=16&&Math.abs(p.z)<=12);
  H.setSpeed(0);return {doors,departing,home,office,lawn,unsupported};
 });
 assert.equal(travel.departing,8);assert.ok(travel.home&&travel.office&&travel.lawn,JSON.stringify(travel));assert.equal(travel.unsupported,0);assert.ok(travel.doors.every(d=>d.inside&&d.error<1e-6));
 await page.locator('#b-views').click({force:true});await page.locator('#view-employee').selectOption('1');await page.locator('[data-view="employee"]').click({force:true});await frame();
 assert.match(await page.locator('#view-identity').textContent(),/Rin/);
 assert.ok(await page.locator('#view-hud').isVisible());
 await page.locator('#view-switch').click({force:true});await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>HQ.view.mode),'employee');
 await page.locator('#view-exit').click({force:true});assert.equal(await page.locator('#view-hud').isVisible(),false);
 for(const mode of ['train','train-south']){
  await page.locator(mode==='train'?'#v-train-north':'#v-train-south').click({force:true});assert.equal(await page.evaluate(()=>HQ.state.speed),1);await frame();
  const ride=await page.evaluate(()=>{
   const H=HQ,s=H.transport.services[H.view.mode==='train'?0:1],c=s.coaches[4],inside=()=>{H.updateView();const p=c.worldToLocal(H.camera.position.clone()),b=c.userData.cabin;return p.y>b.floor&&p.y<b.ceiling&&Math.abs(p.x)<b.halfWidth&&Math.abs(p.z)<b.halfLength;};
   const before=H.camera.position.clone(),initial=inside();H.reduced=false;H.setSpeed(1);H.updateWorld(1,1);const after=inside(),moved=H.camera.position.distanceTo(before)>1;H.setSpeed(0);return {initial,after,moved,name:c.name};
  });assert.ok(ride.initial&&ride.after&&ride.moved,JSON.stringify(ride));
  await frame();assert.match(await page.locator('#view-identity').textContent(),/第 5 節車廂內/);
  await page.screenshot({path:`/tmp/estate-cabin-${mode}.png`});await page.locator('#view-exit').click({force:true});
 }
 const space=await page.evaluate(()=>{
  const H=HQ,before=H.astronauts.map(a=>a.g.position.clone());H.reduced=false;H.setSpeed(1);H.updateWorld(3,5);
  const moved=H.astronauts.every((a,i)=>a.g.position.distanceTo(before[i])>.1),clear=H.astronauts.every(a=>Math.abs(a.g.position.x)>20&&a.g.position.y>4);
  H.setSpeed(0);const parked=H.astronauts.map(a=>a.g.position.clone());H.updateWorld(3,8);return {count:H.astronauts.length,moved,clear,paused:H.astronauts.every((a,i)=>a.g.position.equals(parked[i]))};
 });assert.equal(space.count,4);assert.ok(space.moved&&space.clear&&space.paused,JSON.stringify(space));
 await page.locator('#v-astronauts').click({force:true});await frame();await page.screenshot({path:'/tmp/estate-astronaut.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#b-views').click({force:true});await page.locator('[data-view="employee"]').click({force:true});await frame();
 const hud=await page.locator('#view-hud').boundingBox();assert.ok(hud.y<30&&hud.x>=0&&hud.x+hud.width<=390);assert.ok(await page.locator('#view-exit').isVisible());
 await page.screenshot({path:'/tmp/estate-view-hud-mobile.png'});
 await page.locator('#view-switch').click({force:true});await page.locator('[data-view="train"]').click({force:true});await frame();await page.locator('#view-exit').click({force:true});assert.equal(await page.evaluate(()=>HQ.view),null);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({travel,space,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
