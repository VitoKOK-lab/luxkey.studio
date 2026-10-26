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


 const result=await page.evaluate(()=>{
 const H=HQ,homes=Object.values(H.ISL.res.houses),f=H.festival;
 const start=H.rides.trains[0].cars[0].position.clone(),arm=f.vendors[0].arm.rotation.x;
 H.reduced=false;H.setSpeed(1);H.updateWorld(2,2);
 const moved=H.rides.trains[0].cars[0].position.distanceTo(start)>5,vendorMoves=f.vendors[0].arm.rotation.x!==arm;
 const pos=H.rides.trains[0].cars[0].position.clone();H.setSpeed(0);H.updateWorld(2,4);
 return {homes:homes.length,allVillas:homes.every(h=>h.g.userData.residence.storeys===2&&h.g.getObjectByName('private-swimming-pool')),species:[...new Set(f.visitors.map(a=>a.species))],vendors:f.vendors.length,food:f.foodDisplays.reduce((n,m)=>n+m.count,0),cabins:H.rides.cabins.length,moved,vendorMoves,paused:H.rides.trains[0].cars[0].position.equals(pos)};
 });
 assert.equal(result.homes,10);assert.ok(result.allVillas);assert.equal(result.species.length,8);assert.equal(result.vendors,6);assert.equal(result.food,216);assert.equal(result.cabins,12);assert.ok(result.moved&&result.vendorMoves&&result.paused);console.log(JSON.stringify(result));
 for(const [name,x,z,r,y] of [['villas',-31,34,48,1],['market',10,35,24,1],['animals',0,29,19,1],['wheel',60,30,54,12],['coaster',0,0,230,5]]){
 await page.evaluate(({x,z,r,y})=>{HQ.focusOn(x,z,r);HQ.goal.ty=y;HQ.goal.phi=.9;HQ.goal.theta=.5;},{x,z,r,y});await frame();await page.screenshot({path:'/tmp/upgrade-'+name+'.png'});
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#v-wheel').click();assert.equal(await page.evaluate(()=>HQ.goal.tx),60);
 await page.locator('#v-coaster').click();assert.equal(await page.evaluate(()=>HQ.goal.tx),0);
 const route=await page.evaluate(()=>{const p=HQ.rides.curve.getPoints(500);return {minX:Math.min(...p.map(v=>v.x)),maxX:Math.max(...p.map(v=>v.x)),minZ:Math.min(...p.map(v=>v.z)),maxZ:Math.max(...p.map(v=>v.z)),upright:HQ.rides.cabins.every(c=>c.g.rotation.z===0)};});
 assert.ok(route.minX< -70&&route.maxX>70&&route.minZ< -65&&route.maxZ>65&&route.upright);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
