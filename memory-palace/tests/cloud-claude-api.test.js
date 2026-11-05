import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleApi} from '../cloudflare/api.js';

class D1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys=ON');
    for (const name of ['0002-vault.sql', '0004-ai.sql']) this.db.exec(readFileSync(new URL(`../cloudflare/migrations/${name}`, import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const db = this.db; let values = [];
    return {bind(...args) { values = args; return this; },
      async first() { return db.prepare(sql).get(...values) ?? null; },
      async all() { return {results: db.prepare(sql).all(...values)}; },
      async run() { return {meta: {changes: Number(db.prepare(sql).run(...values).changes)}}; }};
  }
  async batch(statements) {
    this.db.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.db.exec('COMMIT'); return results; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
function fixture(t, responder) {
  const DB = new D1();
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(init.headers['x-api-key'], 'fake-server-only-key');
    const payload = JSON.parse(init.body);
    requests.push(payload);
    return responder(payload);
  };
  t.after(() => {globalThis.fetch = originalFetch; DB.db.close();});
  const env = {DB, ANTHROPIC_API_KEY: 'fake-server-only-key', PALACE_AI_ALLOWED_USERS: '*', PALACE_CLAUDE_MODEL: 'claude-sonnet-4-6'};
  async function call(path, {user = 'alice', method = 'GET', data} = {}) {
    const response = await handleApi(new Request(`https://example.test/api${path}`, {method,
      headers: data === undefined ? {} : {'Content-Type': 'application/json'},
      ...(data === undefined ? {} : {body: JSON.stringify(data)})}), env, {id: user, username: user});
    return {status: response.status, data: await response.json()};
  }
  return {DB, env, call, requests};
}
const answer = (changes = {}) => ({reply: '我會根據你提供的原文整理，並以想像場景輔助回想。', intent: 'remember', steward_id: 'hall', memories: [], recall_ids: [], clarification: '', observed_image_text: '', ...changes});
const modelResponse = result => Response.json({stop_reason: 'end_turn', content: [{type: 'text', text: JSON.stringify(result)}]});
const quote = '今天和爸爸在公園散步。';
const candidate = (changes = {}) => ({title: '和爸爸散步', body: '想像不存在的旅行事實。', summary: '和爸爸在公園散步', mnemonic: '想像在{locus}前，一片綠葉跳起舞。', cue: '綠葉散步', room_id: 'hall', locus_id: 'hall-ledger', tags: ['家人'], source_quote: quote, ...changes});

test('real Claude transport flows through API jobs, verifies originals, and preserves mnemonic separately', {concurrency: false}, async t => {
  const {call, requests} = fixture(t, () => modelResponse(answer({memories: [candidate()]})));
  const submitted = await call('/chat', {method: 'POST', data: {request_id: 'real-transport', message: quote, placement: {room_id: 'hall', locus_id: 'hall-ledger'}}});
  assert.equal(submitted.status, 202);
  assert.equal(submitted.data.status, 'queued');
  const queued = (await call(`/jobs/${submitted.data.job_id}`)).data;
  assert.equal(queued.requires_processing, true);
  assert.equal((await call(`/jobs/${submitted.data.job_id}/process`, {method: 'POST'})).status, 202);
  const job = (await call(`/jobs/${submitted.data.job_id}`)).data;
  assert.equal(job.status, 'completed');
  const memories = (await call('/memories')).data.memories;
  assert.equal(memories.length, 1);
  assert.equal(memories[0].body, quote);
  assert.equal(memories[0].room_id, 'hall');
  assert.equal(memories[0].locus_id, 'hall-ledger');
  assert.equal(memories[0].source_quote ?? memories[0].metadata?.source_quote, quote);
  assert.doesNotMatch(memories[0].body, /想像|不存在/);
  assert.match(memories[0].mnemonic ?? memories[0].metadata?.mnemonic ?? '', /想像/);
  assert.equal((await call(`/jobs/${submitted.data.job_id}/process`, {method: 'POST'})).status, 202);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, 'claude-sonnet-4-6');
  assert.equal(requests[0].output_config.format.type, 'json_schema');
  assert.equal(JSON.parse(requests[0].messages[0].content[0].text).message, quote);
  const repeated = await call('/chat', {method: 'POST', data: {request_id: 'real-transport', message: quote, placement: {room_id: 'hall', locus_id: 'hall-ledger'}}});
  assert.equal(repeated.data.job_id, submitted.data.job_id);
  assert.equal(requests.length, 1);
  assert.equal((await call(`/jobs/${submitted.data.job_id}`, {user: 'bob'})).status, 404);
  assert.deepEqual((await call('/memories', {user: 'bob'})).data.memories, []);
});

test('fabricated quotes and model-observed screenshot text never become verified memories', {concurrency: false}, async t => {
  const {call} = fixture(t, () => modelResponse(answer({memories: [candidate({source_quote: '完全沒有提供的原文'})], observed_image_text: '完全沒有提供的原文'})));
  const submitted = await call('/chat', {method: 'POST', data: {request_id: 'fabricated-quote', message: quote}});
  assert.equal(submitted.status, 202);
  assert.equal(submitted.data.status, 'queued');
  assert.equal((await call(`/jobs/${submitted.data.job_id}/process`, {method: 'POST'})).status, 202);
  const job = (await call(`/jobs/${submitted.data.job_id}`)).data;
  assert.ok(['completed', 'failed'].includes(job.status));
  assert.deepEqual((await call('/memories')).data.memories, []);
  const history = (await call('/chat/history')).data.messages;
  assert.equal(history.find(turn => turn.role === 'user').content, quote);
});

test('Claude input and recall are account scoped across actual API calls', {concurrency: false}, async t => {
  let foreignId;
  const {call, requests} = fixture(t, payload => {
    const context = JSON.parse(payload.messages[0].content.find(block => block.type === 'text').text);
    assert.ok(context.relevant_memories.every(memory => memory.id !== foreignId));
    assert.doesNotMatch(JSON.stringify(context), /Bob private source/);
    return modelResponse(answer({intent: 'recall', recall_ids: [foreignId], reply: '沒有找到可核對的記憶。'}));
  });
  const created = await call('/memories', {user: 'bob', method: 'POST', data: {title: 'Bob private source', body: 'Bob private source', room_id: 'hall', locus_id: 'hall-ledger', tags: []}});
  foreignId = created.data.memory.id;
  const submitted = await call('/chat', {method: 'POST', data: {request_id: 'recall-other-account', message: '請幫我回想散步的記憶'}});
  assert.equal(submitted.status, 202);
  assert.equal(submitted.data.status, 'queued');
  assert.equal((await call(`/jobs/${submitted.data.job_id}/process`, {method: 'POST'})).status, 202);
  const job = (await call(`/jobs/${submitted.data.job_id}`)).data;
  assert.equal(job.status, 'completed');
  assert.deepEqual(job.result.retrieved, []);
  assert.equal(requests.length, 1);
});

test('upstream private failures remain safe and retry retains the original request', {concurrency: false}, async t => {
  let attempts = 0;
  const {call, requests} = fixture(t, () => ++attempts === 1 ? new Response('sensitive vendor detail', {status: 429}) : modelResponse(answer({intent: 'chat', memories: []})));
  const submitted = await call('/chat', {method: 'POST', data: {request_id: 'safe-retry', message: quote}});
  assert.equal(submitted.data.status, 'queued');
  assert.equal(requests.length, 0);
  assert.equal((await call(`/jobs/${submitted.data.job_id}/process`, {method: 'POST'})).status, 202);
  const before = (await call(`/jobs/${submitted.data.job_id}`)).data;
  assert.equal(before.status, 'failed');
  assert.doesNotMatch(JSON.stringify(before), /sensitive vendor|fake-server-only-key/);
  assert.equal((await call(`/jobs/${submitted.data.job_id}/retry`, {method: 'POST'})).status, 202);
  const after = (await call(`/jobs/${submitted.data.job_id}`)).data;
  assert.equal(after.status, 'completed');
  assert.equal(requests.length, 2);
  assert.equal((await call('/chat/history')).data.messages.find(turn => turn.role === 'user').content, quote);
});
