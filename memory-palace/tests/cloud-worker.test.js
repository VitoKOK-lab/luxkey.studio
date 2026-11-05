import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorker} from '../cloudflare/worker.js';

const request=(path,options={})=>new Request('https://palace.example'+path,options);
const assets={fetch:async req=>new Response(new URL(req.url).pathname)};

test('private pages and API fail closed while shared world assets remain public',async()=>{
  let apiCalls=0;
  const worker=createWorker({userFor:async()=>null,api:async()=>{apiCalls++;return new Response('private');}});
  const env={ASSETS:assets};
  for(const path of ['/','/index.html','/renders.html']) {
    const r=await worker.fetch(request(path),env);
    assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'/login');
    assert.equal(r.headers.get('Cache-Control'),'no-store');
  }
  assert.equal((await worker.fetch(request('/api/export'),env)).status,401);
  assert.equal(apiCalls,0);
  assert.equal(await (await worker.fetch(request('/assets/scene-manifest.json'),env)).text(),'/assets/scene-manifest.json');
  assert.equal(await (await worker.fetch(request('/login'),env)).text(),'/login.html');
});

test('cross-origin mutation and API reads are refused before auth or storage',async()=>{
  const worker=createWorker({userFor:()=>{throw new Error('must not read');},auth:()=>{throw new Error('must not auth');}});
  for(const path of ['/auth/login','/api/chat']) {
    for(const headers of [{},{Origin:'https://other.example'},{Origin:'https://palace.example','Sec-Fetch-Site':'cross-site'}]) {
      assert.equal((await worker.fetch(request(path,{method:'POST',headers}),{})).status,403);
    }
  }
  assert.equal((await worker.fetch(request('/api/export',{headers:{Origin:'https://other.example'}}),{})).status,403);
});

test('account write limit uses atomic SQLite increments and isolates users',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(readFileSync(new URL('../cloudflare/migrations/0003-write-limits.sql',import.meta.url),'utf8'));
  const DB={prepare(sql){let values=[];return {bind(...args){values=args;return this;},async run(){return db.prepare(sql).run(...values);},async first(){return db.prepare(sql).get(...values);}};}};
  const worker=createWorker({userFor:async req=>({id:req.headers.get('X-Test-User')||'alice'}),api:async()=>new Response('{}')});
  const call=(id='alice')=>worker.fetch(request('/api/design',{method:'POST',headers:{Origin:'https://palace.example','X-Test-User':id}}),{DB});
  for(let i=0;i<60;i++) assert.equal((await call()).status,200);
  const blocked=await call();assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'60');
  assert.equal((await call('bob')).status,200);
  db.prepare('UPDATE cloud_write_limits SET window_start=window_start-1 WHERE user_id=?').run('alice');
  assert.equal((await call()).status,200);
});

test('cookies survive security headers and backend errors never leak private internals',async()=>{
  const worker=createWorker({auth:async()=>new Response('{}',{headers:{'Set-Cookie':'test=value; Secure; HttpOnly'}}),userFor:async()=>{throw new Error('private SQL detail');}});
  const login=await worker.fetch(request('/auth/session'),{});
  assert.match(login.headers.get('Set-Cookie'),/HttpOnly/);
  assert.match(login.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  const failed=await worker.fetch(request('/api/export'),{});
  assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private SQL detail/);
  assert.equal(failed.headers.get('Cache-Control'),'no-store');
});
