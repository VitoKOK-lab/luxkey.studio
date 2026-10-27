const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),run=promisify(execFile);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Drive application frames explicitly; browser input/animation APIs still work normally.
 await page.addInitScript(()=>{const raf=window.requestAnimationFrame;window.requestAnimationFrame=fn=>{if(fn.name==='frame'){window.appFrame=fn;return 0;}return raf(fn);};});
 if(process.env.HTTPS_PROXY)await page.route('https://**/*',async r=>{try{const {stdout}=await run('curl',['-fsS','--max-time','30',r.request().url()],{encoding:'buffer',maxBuffer:10000000});const type=r.request().resourceType(),path=new URL(r.request().url()).pathname;await r.fulfill({body:stdout,contentType:type==='document'?'text/html':type==='script'?'text/javascript':path.endsWith('.json')?'application/json':'application/octet-stream'});}catch{await r.abort();}});
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:8899/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>HQ.agents.every(a=>a.rig)&&HQ.kenneyAssets.loaded===8&&HQ.swimmers.every(s=>s.rig)&&HQ.tennis.sparring.rig&&HQ.sanctuary.vito.children.length,null,{polling:100});
 console.log('Assets loaded');
 const frame=()=>page.evaluate(()=>{HQ.reduced=true;HQ.setSpeed(0);window.appFrame(performance.now());});
 await frame();



 await page.evaluate(()=>HQ.tennisClub.crowdReady);assert.equal(await page.evaluate(()=>HQ.tennisClub.spectators.length),12);
 await page.locator('#v-tennis-club').click();
 for(const [name,min] of [['day',720],['night',1320]]){
 await page.evaluate(min=>{HQ.state.simMin=min;},min);await frame();await frame();
 const lamps=await page.evaluate(()=>HQ.tennisClub.lights.map(l=>l.intensity));assert.ok(lamps.every(i=>name==='day'?i===0:i>2));
 await page.screenshot({path:'/tmp/tennis-'+name+'.png'});
 }
 await page.evaluate(()=>{HQ.enterView('tennis');});await frame();const facing=await page.evaluate(()=>{const d=HQ.camera.getWorldDirection(new THREE.Vector3()),to=HQ.ISL.fun.court.B.p.clone().add(new THREE.Vector3(0,1.2,0)).sub(HQ.camera.position).normalize();return d.dot(to);});assert.ok(facing>.99);await page.screenshot({path:'/tmp/tennis-player.png'});await page.locator('#view-exit').click();
 const check=await page.evaluate(()=>{const H=HQ;H.reduced=false;H.setSpeed(1);const before=H.tennis.rally.hits;for(let i=0;i<100;i++)H.updateWorld(.1,i*.1);const hits=H.tennis.rally.hits-before;const r=H.tennisClub.rackets[0].rotation.z;H.setSpeed(0);H.updateWorld(1,12);return {hits,paused:H.tennisClub.rackets[0].rotation.z===r};});assert.ok(check.hits>5&&check.paused);await page.setViewportSize({width:390,height:844});await page.locator('#v-tennis-club').click();assert.equal(await page.evaluate(()=>HQ.goal.tx),42.5);assert.deepEqual(errors,[]);console.log('Tennis club: 12 seated guests, day/night lights, player view, rally and pause passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
