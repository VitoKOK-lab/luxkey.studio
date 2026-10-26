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
 // Every requested perspective is reached through the actual dialog buttons.
 for(const mode of ['employee','train','train-south','ufo','tennis']){
  await page.locator('#b-views').click({force:true});await page.locator(`[data-view="${mode}"]`).click({force:true});await frame();
  const state=await page.evaluate(()=>({mode:HQ.view.mode,camera:HQ.camera.position.toArray(),matrix:HQ.camera.matrixWorld.elements,exit:!document.getElementById('view-exit').hidden}));
  assert.equal(state.mode,mode);assert.ok(state.exit&&state.matrix.every(Number.isFinite));
  if(mode==='employee'||mode==='train')await page.screenshot({path:`/tmp/estate-view-${mode}.png`});
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>HQ.view),null);
 }
 // The private-island button first reveals the garden, then explicitly enters meditation.
 await page.locator('#b-sanctuary').click({force:true});await frame();
 assert.equal(await page.locator('#view-dialog').evaluate(d=>d.open),false);
 assert.ok(await page.evaluate(()=>HQ.goal.tx<-90&&HQ.goal.tz<-70));
 await page.screenshot({path:'/tmp/estate-sanctuary.png'});
 await page.locator('#meditation-start').click({force:true});await frame();
 assert.equal(await page.evaluate(()=>HQ.view.mode),'meditation');assert.equal(await page.locator('#meditation-hint').isVisible(),true);
 await page.locator('#view-exit').click({force:true});assert.equal(await page.evaluate(()=>HQ.view),null);
 const orbit=await page.evaluate(()=>{
  const H=HQ,now=performance.now();H.idleOrbit.enabled=true;H.idleOrbit.lastInput=now-13000;
  let before=H.goal.theta;H.updateIdleOrbit(.05,now);const moved=H.goal.theta>before;
  document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));before=H.goal.theta;H.updateIdleOrbit(.05,performance.now());const interrupted=H.goal.theta===before;
  H.enterView('train');H.idleOrbit.lastInput=now-13000;before=H.goal.theta;H.updateIdleOrbit(.05,now);const immersive=H.goal.theta===before;H.exitView();
  H.idleOrbit.enabled=false;before=H.goal.theta;H.updateIdleOrbit(.05,now);return {moved,interrupted,immersive,disabled:H.goal.theta===before};
 });assert.ok(Object.values(orbit).every(Boolean),JSON.stringify(orbit));
 const simulation=await page.evaluate(()=>{
  const H=HQ;H.reduced=false;H.setSpeed(1);const first=H.swimmers.map(s=>s.g.position.clone());const hits=H.tennis.rally.hits;
  let swimming=true,boardingWhileMoving=false;const seen=new Set();
  for(let i=0;i<1200;i++){
   H.updateWorld(.25,i*.25);
   for(const s of H.swimmers){const p=s.g.position;if(p.x< -3.16||p.x>5.16||p.z<4.1||p.z>10.1)swimming=false;}
   for(const a of H.festival.visitors){seen.add(a.state);if(a.service&&a.state==='walking'&&!a.service.dwell)boardingWhileMoving=true;}
  }
  const moved=H.swimmers.some((s,i)=>s.g.position.distanceTo(first[i])>.1),stats={...H.festival.stats};
  const seated=H.festival.visitors.filter(a=>a.state==='aboard');
  const seats=seated.map(a=>a.service.id+':'+a.coach+':'+a.seat);
  H.setSpeed(0);const parked=H.swimmers.map(s=>s.g.position.clone()),train=H.transport.train[0].position.clone();H.updateWorld(1,301);
  return {stats,states:[...seen],total:H.festival.visitors.length,swimming,moved,boardingWhileMoving,uniqueSeats:new Set(seats).size===seats.length,paused:parked.every((p,i)=>p.distanceTo(H.swimmers[i].g.position)<1e-6)&&train.distanceTo(H.transport.train[0].position)<1e-6,tennisHits:H.tennis.rally.hits-hits,dragons:H.dragons.length};
 });
 console.log(JSON.stringify(simulation));
 assert.equal(simulation.total,312);assert.ok(simulation.stats.arrivals>=72&&simulation.stats.boarded>=36&&simulation.stats.departures>=2);
 for(const key of ['watched','market','circus'])assert.ok(simulation.stats[key]>0,key);
 assert.ok(simulation.swimming&&simulation.moved&&simulation.paused&&simulation.uniqueSeats&&!simulation.boardingWhileMoving);
 assert.ok(simulation.tennisHits>100&&simulation.dragons===3);
 await page.locator('#b-festival').click({force:true});await frame();await page.screenshot({path:'/tmp/estate-festival.png'});
 await page.evaluate(()=>HQ.openFestival());assert.equal(await page.locator('#festival-dialog').evaluate(d=>d.open),true);await page.locator('#festival-close').click({force:true});
 await page.locator('#v-pool').click({force:true});await frame();await page.screenshot({path:'/tmp/estate-pool.png'});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>HQ.resetView());await frame();
 await page.locator('#b-views').click({force:true});await page.locator('[data-view="train"]').click({force:true});await frame();
 assert.equal(await page.locator('#view-exit').isVisible(),true);await page.locator('#view-exit').click({force:true});await frame();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/estate-experiences-mobile.png'});
 assert.deepEqual(errors,[]);console.log('Perspective, sanctuary, festival, swimming and mobile checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
