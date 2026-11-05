import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { processJob, recoverStaleJobs, listPending } from '../cloudflare/ai-jobs.js';

// D1 batch is a serialized, atomic SQLite transaction, including competing requests.
class D1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    for (const migration of ['0002-vault.sql', '0003-write-limits.sql', '0004-ai.sql']) {
      let source;
      try { source = readFileSync(new URL(`../cloudflare/migrations/${migration}`, import.meta.url), 'utf8'); } catch { continue; }
      this.db.exec(source);
    }
    this.queue = Promise.resolve();
  }
  prepare(query) {
    const db = this.db;
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return db.prepare(query).get(...values) ?? null; },
      async all() { return { results: db.prepare(query).all(...values) }; },
      async run() { return { meta: { changes: Number(db.prepare(query).run(...values).changes) } }; },
    };
  }
  batch(statements) {
    const result = this.queue.then(async () => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        this.db.exec('COMMIT');
        return results;
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    });
    this.queue = result.catch(() => {});
    return result;
  }
}
const alice = { id: 'alice' };
const bob = { id: 'bob' };
const quote = '今天我在花園看見一隻藍色蝴蝶。';
const candidate = (source = quote, extra = {}) => ({ title: '花園蝴蝶', body: source, summary: '看見蝴蝶', mnemonic: '想像藍蝴蝶繞著{locus}飛舞。', cue: '藍蝴蝶', room_id: 'hall', locus_id: '', tags: ['日常'], source_quote: source, ...extra });
const output = (memories = [candidate()], extra = {}) => ({ reply: '我理解這段經歷。', intent: 'remember', steward_id: 'hall', memories, recall_ids: [], clarification: '', observed_image_text: '', ...extra });
function fixture(t, options = {}) {
  const DB = new D1();
  const env = { DB, ...options };
  t.after(() => DB.db.close());
  let sequence = 0;
  const job = ({ owner = 'alice', message = quote, capture = {}, conversation = 'palace', placement, status = 'awaiting_api' } = {}) => {
    const id = `job${++sequence}`;
    const instant = new Date().toISOString();
    DB.db.prepare('INSERT INTO cloud_jobs(user_id,id,request_id,conversation_id,input,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(owner, id, `request${sequence}`, conversation, JSON.stringify({ message, capture, ...(placement ? { placement } : {}) }), status, instant, instant);
    return id;
  };
  const count = table => DB.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const state = id => DB.db.prepare('SELECT * FROM cloud_jobs WHERE id=?').get(id);
  return { DB, env, job, count, state };
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('grounded extraction saves distinct source, mnemonic, revision and provider result atomically', async t => {
  const { env, job, count, state } = fixture(t);
  const id = job({ message: `  ${quote}\n`, capture: { text: '保留的擷取原文', source: '截取對話' } });
  let received;
  const done = await processJob(env, alice, id, { infer: async (_env, input) => { received = input; return output([candidate(quote, { body: '捏造的個人事實' })]); } });
  assert.equal(done.status, 'completed');
  assert.equal(done.result.memories[0].body, quote);
  assert.equal(done.result.memories[0].source_quote, quote);
  assert.equal(done.result.memories[0].provenance.kind, 'message');
  assert.match(done.result.memories[0].mnemonic, /管家的接待簿/);
  assert.equal(received.message, `  ${quote}\n`);
  assert.equal(JSON.parse(state(id).input).message, `  ${quote}\n`);
  assert.equal(count('cloud_revisions'), 1);
  assert.equal(count('cloud_ai_sources'), 1);
  assert.equal(done.result.provider, 'anthropic');
  assert.equal(done.result.model, 'claude-sonnet-4-6');
  assert.equal((await processJob(env, alice, id, { infer: () => { throw new Error('must not repeat'); } })).status, 'completed');
  assert.equal(count('cloud_memories'), 1);
});

test('duplicate invocation and simultaneous account jobs issue only one provider call', async t => {
  const { env, job, count, state } = fixture(t);
  const a = job(); const b = job();
  const entered = deferred(); const release = deferred();
  let calls = 0;
  const infer = async () => { calls++; entered.resolve(); await release.promise; return output(); };
  const running = processJob(env, alice, a, { infer });
  await entered.promise;
  assert.equal((await processJob(env, alice, a, { infer })).status, 'processing');
  assert.equal((await processJob(env, alice, b, { infer })).status, 'failed');
  release.resolve();
  await running;
  assert.equal(calls, 1);
  assert.equal(count('cloud_memories'), 1);
  assert.equal(state(b).status, 'failed');
  assert.equal(env.DB.db.prepare("SELECT attempts FROM cloud_ai_quota WHERE scope='user:alice'").get().attempts, 1);
});

test('expired attempt is fenced from writes after a successful replacement', async t => {
  const { env, job, count, DB } = fixture(t);
  const id = job(); const entered = deferred(); const release = deferred();
  const first = processJob(env, alice, id, { infer: async () => { entered.resolve(); await release.promise; return output([candidate(quote, { title: '舊請求' })]); } });
  await entered.promise;
  DB.db.prepare('UPDATE cloud_jobs SET lease_expires_at=0 WHERE id=?').run(id);
  await recoverStaleJobs(env, alice);
  const replacement = await processJob(env, alice, id, { infer: async () => output([candidate(quote, { title: '重試成功' })]) });
  assert.equal(replacement.status, 'completed');
  release.resolve();
  const late = await first;
  assert.equal(late.result.memories[0].title, '重試成功');
  assert.equal(count('cloud_memories'), 1);
  assert.equal(count('cloud_revisions'), 1);
});

test('provider failures are safe and retryable while originals remain unchanged', async t => {
  const { env, job, state, count } = fixture(t);
  const id = job({ message: '  原始訊息\n' });
  const before = state(id).input;
  const failure = await processJob(env, alice, id, { infer: async () => { throw new Error('secret API_KEY and raw provider payload'); } });
  assert.equal(failure.status, 'failed');
  assert.doesNotMatch(failure.error, /secret|API_KEY|payload/);
  assert.equal(state(id).input, before);
  assert.equal(count('cloud_memories'), 0);
  const retry = await processJob(env, alice, id, { infer: async () => output([], { intent: 'chat', reply: '你想從今天哪件小事聊起？' }) });
  assert.equal(retry.status, 'completed');
  assert.equal(retry.result.intent, 'chat');
});

test('invalid source and model-only image transcription persist as pending clarification', async t => {
  const { env, job, count, DB } = fixture(t);
  const id = job({ message: '', capture: { has_image: true, source: '截圖' } });
  DB.db.prepare('INSERT INTO cloud_captures VALUES (?,?,?,?)').run('alice', id, 0, 'data:image/png;base64,iVBORw0KGgo=');
  const result = await processJob(env, alice, id, { infer: async () => output([candidate('我家住在台北。')], { observed_image_text: '我家住在台北。' }) });
  assert.equal(result.status, 'completed');
  assert.equal(result.result.memories.length, 0);
  assert.equal(result.result.pending.length, 1);
  assert.match(result.result.pending[0].reason, /來源原文/);
  assert.equal(result.result.pending[0].source_quote, undefined);
  assert.equal(result.result.pending[0].body, undefined);
  assert.equal(result.result.pending[0].proposed_candidate.source_quote, '我家住在台北。');
  assert.equal((await listPending(env, alice)).length, 1);
  assert.equal((await listPending(env, bob)).length, 0);
  assert.equal(count('cloud_memories'), 0);
});

test('explicit occupied locus is never overwritten and invalid candidate is not dropped', async t => {
  const { env, job, count } = fixture(t);
  await processJob(env, alice, job(), { infer: async () => output() });
  const secondQuote = '這週決定開始學習陶藝。';
  const id = job({ message: secondQuote, placement: { room_id: 'hall', locus_id: 'hall-ledger' } });
  const result = await processJob(env, alice, id, { infer: async () => output([candidate(secondQuote), candidate('缺少來源', { title: 'x'.repeat(161), room_id: 'missing' })]) });
  assert.equal(result.result.pending.length, 2);
  assert.match(result.result.pending[0].reason, /指定的錨點已有記憶/);
  assert.equal(count('cloud_memories'), 1);
  assert.equal((await listPending(env, alice)).length, 2);
});

test('source deduplication and recall ids stay isolated to the authenticated account', async t => {
  const { env, job, count } = fixture(t);
  const saved = await processJob(env, alice, job(), { infer: async () => output() });
  const aliceMemory = saved.result.memories[0].id;
  const repeated = await processJob(env, alice, job(), { infer: async () => output() });
  assert.equal(repeated.result.duplicates[0].id, aliceMemory);
  assert.equal(repeated.result.memories.length, 0);
  const bobId = job({ owner: 'bob' });
  let payload;
  const b = await processJob(env, bob, bobId, { infer: async (_env, input) => { payload = input; return output([candidate()], { recall_ids: [aliceMemory] }); } });
  assert.deepEqual(payload.relevant_memories, []);
  assert.deepEqual(payload.messages, []);
  assert.deepEqual(b.result.retrieved, []);
  assert.equal(b.result.memories.length, 1);
  assert.equal(await processJob(env, alice, bobId, { infer: () => { throw new Error('wrong owner'); } }), null);
  assert.equal(count('cloud_memories'), 2);
});

test('only bounded same-conversation user history can ground later facts', async t => {
  const { env, job } = fixture(t);
  await processJob(env, alice, job({ message: quote }), { infer: async () => output([], { intent: 'chat', reply: '助理自己聲稱我喜歡登山。' }) });
  const current = job({ message: '請記住剛才的蝴蝶', conversation: 'palace' });
  let seen;
  const follow = await processJob(env, alice, current, { infer: async (_env, input) => { seen = input; return output(); } });
  assert.equal(follow.result.memories.length, 1);
  assert.equal(seen.messages[0].role, 'user');
  const invalid = await processJob(env, alice, job({ message: '請記住它', conversation: 'other' }), { infer: async () => output([candidate('我喜歡登山。')]) });
  assert.equal(invalid.result.pending.length, 1);
});

test('atomic UTC account and global daily quotas stop provider calls', async t => {
  const { env, job, DB } = fixture(t, { PALACE_AI_DAILY_LIMIT: '1', PALACE_AI_GLOBAL_DAILY_LIMIT: '2' });
  let calls = 0;
  const infer = async () => { calls++; return output([], { intent: 'chat' }); };
  await processJob(env, alice, job(), { infer });
  assert.equal((await processJob(env, alice, job(), { infer })).status, 'failed');
  await processJob(env, bob, job({ owner: 'bob' }), { infer });
  const third = { id: 'carol' };
  assert.equal((await processJob(env, third, job({ owner: 'carol' }), { infer })).status, 'failed');
  assert.equal(calls, 2);
  assert.equal(DB.db.prepare("SELECT attempts FROM cloud_ai_quota WHERE scope='global' AND day=?").get(new Date().toISOString().slice(0, 10)).attempts, 2);
});

test('manual placement racing final batch rolls back all writes and replans safely', async t => {
  const { env, job, DB, count } = fixture(t);
  const original = DB.batch.bind(DB);
  let collided = false;
  DB.batch = async statements => {
    // Claim is four statements; final save is six. Insert a legitimate manual memory
    // after planning but before the final transaction gets its exclusive lock.
    if (statements.length === 6 && !collided) {
      collided = true;
      const instant = new Date().toISOString();
      const data = { id: 'manual', title: '手動保存', body: '原來的記憶', room_id: 'hall', locus_id: 'hall-ledger', status: 'active', next_review: instant, created_at: instant };
      DB.db.prepare('INSERT INTO cloud_memories(user_id,id,content,room_id,locus_id,status,next_review,created_at) VALUES (?,?,?,?,?,?,?,?)').run('alice', data.id, JSON.stringify(data), data.room_id, data.locus_id, data.status, instant, instant);
    }
    return original(statements);
  };
  const result = await processJob(env, alice, job(), { infer: async () => output() });
  assert.equal(result.status, 'completed');
  assert.equal(result.result.memories[0].locus_id, 'hall-lantern');
  assert.equal(count('cloud_memories'), 2);
  assert.equal(count('cloud_revisions'), 1);
});

test('chat opt-out and clarification never persist model memory proposals', async t => {
  const { env, job, count } = fixture(t);
  const chat = await processJob(env, alice, job(), { infer: async () => output([candidate()], { intent: 'chat', reply: '可以，我們只聊聊。' }) });
  assert.deepEqual(chat.result.memories, []);
  assert.deepEqual(chat.result.pending, []);
  const clarify = await processJob(env, alice, job(), { infer: async () => output([candidate()], { clarification: '這是你自己的經歷嗎？' }) });
  assert.equal(clarify.result.reply, '這是你自己的經歷嗎？');
  assert.equal(count('cloud_memories'), 0);
  assert.equal(count('cloud_ai_pending'), 0);
});

test('recall reads current active state after inference', async t => {
  const { env, job, DB } = fixture(t);
  const saved = await processJob(env, alice, job(), { infer: async () => output() });
  const id = saved.result.memories[0].id;
  const recalled = await processJob(env, alice, job({ message: '回想蝴蝶' }), { infer: async () => {
    DB.db.prepare("UPDATE cloud_memories SET status='archived' WHERE user_id='alice' AND id=?").run(id);
    return output([], { intent: 'recall', recall_ids: [id] });
  } });
  assert.deepEqual(recalled.result.retrieved, []);
});
