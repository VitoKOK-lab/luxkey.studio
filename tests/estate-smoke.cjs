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
     if(x>.1&&x<5.9&&z>4.7&&z<9.3){failures.push({kind:'pool crossing',a,b,x,z});break;}
     if(x>9.45&&x<15.15&&z>-5.125&&z<-4.875){failures.push({kind:'hall wall crossing',a,b,x,z});break;}
    }previous=p;
   }
  }
  return {checked,failures};
 });
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
  const H=HQ,a=H.agents[0];a.c.g.position.set(-1,0,6.5);H.setSpeed(1);H.goTo(a,{x:7,z:8.3});
  let crossed=false;
  for(let i=0;i<800&&a.path.length;i++){H.updateAgents(.05,i*.05,performance.now());const p=a.c.g.position;if(p.x>.1&&p.x<5.9&&p.z>4.7&&p.z<9.3)crossed=true;}
  H.setSpeed(0);return {crossed,arrived:a.path.length===0,distance:Math.hypot(a.c.g.position.x-7,a.c.g.position.z-8.3)};
 });
 assert.ok(!walk.crossed&&walk.arrived&&walk.distance<.1,JSON.stringify(walk));
 await page.waitForTimeout(700);await page.screenshot({path:'/tmp/estate-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{HQ.resetView();});await page.waitForTimeout(700);
 await page.locator('#v-train').click();assert.ok(await page.evaluate(()=>HQ.goal.ty===3));
 await page.locator('#v-airship').click();assert.ok(await page.evaluate(()=>HQ.goal.ty>8));
 await page.locator('#v-roof').click();
 await page.evaluate(()=>{HQ.resetView();HQ.setEstateRoofs(true);document.querySelector('.rail').scrollLeft=0;});await page.waitForTimeout(700);
 const mobile=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.rail button')].map(b=>b.getBoundingClientRect().width)}));
 assert.ok(mobile.document<=mobile.width);assert.ok(mobile.buttons.every(w=>w>=44));
 await page.screenshot({path:'/tmp/estate-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({routes:routes.checked,models:8,agents:8,transport:moving,walk,mobile,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
