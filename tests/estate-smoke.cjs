/* Run against a static server. No npm dependencies are added to the application. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 // curl retains the managed environment's proxy, credentials and TLS trust.
 if(process.env.HTTPS_PROXY)await page.route('https://**/*',async route=>{
  try{const {stdout}=await run('curl',['--fail','--silent','--show-error','--max-time','30',route.request().url()],{encoding:'buffer',maxBuffer:10000000});await route.fulfill({body:stdout});}
  catch{await route.abort('failed');}
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:8899/index.html',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.HQ?.agents?.length===8&&HQ.agents.every(a=>a.rig)&&HQ.assetsReady&&HQ.kenneyAssets?.loaded===8);
 const routes=await page.evaluate(()=>{
  const H=HQ;H.setSpeed(0);
  const spots=[...H.agents.map(a=>a.home),H.neon.home,...H.breakSpots,...H.meetChairs,...H.allHands,H.ISL.res.exit,H.ISL.fun.exit];
  const failures=[];let checked=0;
  for(const a of spots)for(const b of spots){
   const path=H.findPath(a.x,a.z,b.x,b.z);checked++;
   if(!path.length){failures.push({kind:'unreachable',a,b});continue;}
   let previous=a;
   for(const p of path){
    const n=Math.max(1,Math.ceil(Math.hypot(p.x-previous.x,p.z-previous.z)/.1));
    for(let i=0;i<=n;i++){
     const x=previous.x+(p.x-previous.x)*i/n,z=previous.z+(p.z-previous.z)*i/n;
     if(x>-4.8&&x<6.8&&z>4.1&&z<10.1){failures.push({kind:'pool crossing',a,b,x,z});break;}
     if(x>9.45&&x<15.15&&z>-5.125&&z<-4.875){failures.push({kind:'hall wall crossing',a,b,x,z});break;}
    }previous=p;
   }
  }
  return {checked,failures};
 });
 const architecture=await page.evaluate(()=>{
  const H=HQ,curve=H.transport.railCurve,points=Array.from({length:720},(_,i)=>curve.getPointAt(i/720));
  const inside=(x,z)=>{let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[i],b=points[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)hit=!hit;
  }return hit;};
  return {levels:H.estate.levels,height:H.estate.height,glass:H.estate.glassPanels.length,poolArea:(H.estate.pool.x1-H.estate.pool.x0)*(H.estate.pool.z1-H.estate.pool.z0),
   encloses:[inside(0,0),...Object.values(H.ISL).map(i=>inside(i.c[0],i.c[2]))],
   railLength:H.transport.railLength,closed:curve.getPoint(0).distanceTo(curve.getPoint(1)),stations:H.transport.stations.map(s=>s.id),coaches:H.transport.train.length};
 });
 assert.deepEqual(architecture.levels,[0,4.4,8.8]);assert.ok(architecture.height>=13&&architecture.glass>=50&&architecture.poolArea>=69);
 assert.ok(architecture.encloses.every(Boolean));assert.ok(architecture.railLength>350&&architecture.closed<.001);assert.equal(architecture.stations.length,5);assert.equal(architecture.coaches,5);
 const clarity=await page.evaluate(()=>{
  const H=HQ;let straight=0,minAirDistance=Infinity;
  for(let i=0;i<720;i++){
   const t=H.transport.railCurve.getTangentAt(i/720);if(Math.max(Math.abs(t.x),Math.abs(t.z))>.999)straight++;
   const p=H.transport.airCurve.getPointAt(i/720);minAirDistance=Math.min(minAirDistance,Math.max(Math.abs(p.x),Math.abs(p.z)));
  }
  return {straight:straight/720,minAirDistance,railHidden:!H.transport.railway.visible,shipHidden:!H.transport.ship.visible,decorHidden:H.airDecor.every(o=>!o.visible),screen:HQ.screens.broadcast.g.position.toArray()};
 });
 assert.ok(clarity.straight>.85&&clarity.minAirDistance>=60);assert.ok(clarity.railHidden&&clarity.shipHidden&&clarity.decorHidden);
 assert.deepEqual(clarity.screen,[0,6.45,-2.7]);
 await page.locator('#v-screen').click();assert.equal(await page.locator('#broadcast-dialog').evaluate(d=>d.open),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#broadcast-dialog').evaluate(d=>d.open),false);
 // Verify that clicking the physical 3D screen opens the same readable display.
 const screenPoint=await page.evaluate(()=>{const p=HQ.screens.broadcast.g.position.clone().project(HQ.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
 await page.mouse.click(screenPoint.x,screenPoint.y);assert.equal(await page.locator('#broadcast-dialog').evaluate(d=>d.open),true);
 await page.locator('#broadcast-close').click();
 assert.equal(routes.failures.length,0,JSON.stringify(routes.failures.slice(0,5)));
 assert.equal(await page.evaluate(()=>HQ.estate.roofs.visible),true);
 await page.locator('#v-roof').click();assert.equal(await page.evaluate(()=>HQ.estate.roofs.visible),false);
 await page.locator('#v-roof').click();assert.equal(await page.evaluate(()=>HQ.estate.roofs.visible),true);
 await page.locator('#depts [data-dept="sales"]').click();assert.equal(await page.evaluate(()=>HQ.estate.roofs.visible),false);
 await page.evaluate(()=>{HQ.openCard(0);});assert.equal(await page.locator('#card').isVisible(),true);
 await page.evaluate(()=>{HQ.closeCard();HQ.resetView();HQ.setEstateRoofs(true);});
 const moving=await page.evaluate(()=>{
  const H=HQ;H.reduced=false;H.setSpeed(1);
  const train=H.transport.train[0].position.clone(),boat=H.transport.ship.position.clone();H.updateWorld(1,10);
  const moved=train.distanceTo(H.transport.train[0].position)>0&&boat.distanceTo(H.transport.ship.position)>0;
  H.setSpeed(0);const parked=H.transport.ship.position.clone();H.updateWorld(1,11);
  const paused=parked.distanceTo(H.transport.ship.position)===0;
  H.reduced=true;return {moved,paused,triangles:H.renderer.info.render.triangles,calls:H.renderer.info.render.calls};
 });
 assert.ok(moving.moved&&moving.paused);
 // Exercise an actual character walking a detour around the pool.
 const walk=await page.evaluate(()=>{
  const H=HQ,a=H.agents[0];a.c.g.position.set(-6,0,5.6);H.setSpeed(1);H.goTo(a,{x:7.8,z:8.3});
  let crossed=false;
  for(let i=0;i<800&&a.path.length;i++){H.updateAgents(.05,i*.05,performance.now());const p=a.c.g.position;if(p.x>-4.8&&p.x<6.8&&p.z>4.1&&p.z<10.1)crossed=true;}
  H.setSpeed(0);return {crossed,arrived:a.path.length===0,distance:Math.hypot(a.c.g.position.x-7.8,a.c.g.position.z-8.3)};
 });
 assert.ok(!walk.crossed&&walk.arrived&&walk.distance<.1,JSON.stringify(walk));
 await page.evaluate(()=>{HQ.setDept('all');HQ.setEstateRoofs(true);});await page.waitForTimeout(700);await page.screenshot({path:'/tmp/estate-desktop.png'});
 await page.locator('#v-train').click();await page.waitForFunction(()=>HQ.transport.railway.visible&&HQ.transport.ship.visible);await page.waitForTimeout(700);await page.screenshot({path:'/tmp/estate-world.png'});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{HQ.resetView();});await page.waitForTimeout(700);
 await page.locator('#v-train').click();assert.ok(await page.evaluate(()=>HQ.goal.radius>=215));
 await page.locator('#v-airship').click();assert.ok(await page.evaluate(()=>HQ.goal.ty>8));
 await page.locator('#v-roof').click();
 await page.evaluate(()=>{HQ.resetView();HQ.setEstateRoofs(true);document.querySelector('.rail').scrollLeft=0;});await page.waitForTimeout(700);
 const mobile=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.rail button')].map(b=>b.getBoundingClientRect().width)}));
 assert.ok(mobile.document<=mobile.width);assert.ok(mobile.buttons.every(w=>w>=44));
 await page.screenshot({path:'/tmp/estate-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({architecture,clarity,routes:routes.checked,models:8,agents:8,transport:moving,walk,mobile,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
