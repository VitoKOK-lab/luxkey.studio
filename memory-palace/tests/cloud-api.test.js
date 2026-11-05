import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleApi } from '../cloudflare/api.js';

// Real temporary SQLite, matching the D1 prepared-statement and atomic batch API.
class D1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys=ON');
    this.db.exec(readFileSync(new URL('../cloudflare/migrations/0002-vault.sql', import.meta.url), 'utf8'));
    this.db.exec(readFileSync(new URL('../cloudflare/migrations/0004-ai.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const db = this.db;
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return db.prepare(sql).get(...values) ?? null; },
      async all() { return { results: db.prepare(sql).all(...values) }; },
      async run() { const result = db.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
    };
  }
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      this.db.exec('COMMIT');
      return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
function fixture(t) {
  const DB = new D1();
  t.after(() => DB.db.close());
  async function call(path, { user = 'alice', method = 'GET', data, headers = {} } = {}) {
    const request = new Request(`https://example.test/api${path}`, { method, headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
    const response = await handleApi(request, { DB }, user === null ? null : { id: user });
    return { status: response.status, data: await response.json() };
  }
  return { DB, call };
}
const memory = { title: '家人的旅行', body: '保留原文內容。', room_id: 'hall', locus_id: 'hall-ledger', tags: ['旅行'] };

test('cloud memory CRUD, review, revisions and design remain tenant scoped', async t => {
  const { call } = fixture(t);
  assert.equal((await call('/stats', { user: null })).status, 401);
  assert.equal((await call('/stats')).data.total, 0);
  const created = await call('/memories', { method: 'POST', data: memory });
  assert.equal(created.status, 201);
  const id = created.data.memory.id;
  assert.equal((await call(`/memories/${id}`, { user: 'bob' })).status, 404);
  assert.equal((await call(`/memories/${id}`, { method: 'PATCH', user: 'bob', data: { title: 'stolen' } })).status, 404);
  assert.equal((await call(`/memories/${id}/review`, { method: 'POST', user: 'bob', data: { rating: 'easy' } })).status, 404);
  assert.deepEqual((await call('/memories', { user: 'bob' })).data.memories, []);
  assert.equal((await call('/memories', { method: 'POST', data: memory, user: 'bob' })).status, 201);
  assert.equal((await call('/memories', { method: 'POST', data: memory })).status, 400);
  const reviewed = await call(`/memories/${id}/review`, { method: 'POST', data: { rating: 'easy' } });
  assert.equal(reviewed.data.memory.interval_days, 3);
  assert.equal(reviewed.data.memory.review_count, 1);
  assert.equal((await call('/memories?search=旅行')).data.memories.length, 1);
  assert.equal((await call('/memories?search=%25')).data.memories.length, 0);
  assert.equal((await call(`/memories/${id}`, { method: 'PATCH', data: { status: 'archived' } })).status, 200);
  assert.equal((await call(`/memories/${id}/review`, { method: 'POST', data: { rating: 'good' } })).status, 400);
  assert.equal((await call('/stats')).data.archived, 1);
  const another = await call('/memories', { method: 'POST', data: { ...memory, title: '新記憶' } });
  assert.equal(another.status, 201);
  assert.equal((await call(`/memories/${id}`, { method: 'PATCH', data: { status: 'active' } })).status, 400);
  const exported = (await call('/export')).data;
  assert.equal(exported.memories.length, 2);
  assert.equal(exported.revisions.length, 4);
  assert.ok(exported.revisions.every(row => row.snapshot.title !== 'stolen'));
  const design = (await call('/design')).data.design;
  assert.equal((await call('/design', { method: 'POST', data: { design: { ...design, name: 'Alice莊園' } } })).status, 200);
  assert.equal((await call('/design', { user: 'bob' })).data.design.name, '憶境莊園');
  assert.equal((await call('/design/export')).data.name, 'Alice莊園');
});

test('submitted originals and valid image attachments persist awaiting real Agent', async t => {
  const { call, DB } = fixture(t);
  const image = 'data:image/png;base64,' + Buffer.from('\x89PNG\r\n\x1a\n' + 'a'.repeat(420000), 'latin1').toString('base64');
  const payload = { request_id: 'shared-id', message: '  原文不能被改寫。\n', capture: { text: '  保留前後空白\n', image_data_url: image, source: '截圖' }, placement: { room_id: 'hall', locus_id: 'hall-ledger' } };
  const submitted = await call('/chat', { method: 'POST', data: payload });
  assert.equal(submitted.status, 202);
  const id = submitted.data.job_id;
  assert.equal((await call('/chat', { method: 'POST', data: payload })).data.job_id, id);
  assert.equal((await call('/chat', { method: 'POST', data: { ...payload, message: 'different' } })).status, 400);
  const bobJob = await call('/chat', { method: 'POST', data: { request_id: 'shared-id', message: 'Bob private' }, user: 'bob' });
  assert.equal(bobJob.status, 202);
  assert.notEqual(bobJob.data.job_id, id);
  assert.equal((await call(`/jobs/${id}`)).data.status, 'awaiting_api');
  assert.equal((await call(`/jobs/${id}`, { user: 'bob' })).status, 404);
  assert.equal((await call(`/jobs/${id}/retry`, { method: 'POST', user: 'bob' })).status, 404);
  assert.equal((await call(`/jobs/${id}/retry`, { method: 'POST' })).status, 409);
  const history = (await call('/chat/history')).data.messages;
  assert.equal(history.length, 1);
  assert.equal(history[0].content, payload.message);
  assert.equal(history[0].capture.text, payload.capture.text);
  assert.equal(history[0].capture.has_image, true);
  assert.equal(history[0].capture.image_data_url, undefined);
  const inbox = (await call('/inbox')).data;
  assert.equal(inbox.awaiting_api.length, 1);
  assert.equal(inbox.awaiting_api[0].capture.text, payload.capture.text);
  assert.equal(inbox.pending.length, 0);
  assert.equal((await call('/ai/status')).data.available, false);
  const storedImage = DB.db.prepare('SELECT content FROM cloud_captures WHERE user_id=? AND job_id=? ORDER BY chunk').all('alice', id).map(row => row.content).join('');
  assert.equal(storedImage, image);
  const original = JSON.parse(DB.db.prepare('SELECT input FROM cloud_jobs WHERE user_id=? AND id=?').get('alice', id).input);
  assert.equal(original.message, payload.message);
  assert.ok(DB.db.prepare('SELECT COUNT(*) AS count FROM cloud_captures').get().count > 1);
  assert.equal((await call('/chat/history', { user: 'bob' })).data.messages[0].content, 'Bob private');
  assert.equal((await call('/export')).data.conversations, undefined);
  assert.equal((await call('/stats')).data.total, 0);
});

test('cloud request validation bounds fields, identifiers, MIME and streamed body sizes', async t => {
  const { call } = fixture(t);
  const invalidMemories = [
    { ...memory, user_id: 'bob' }, { ...memory, room_id: 'no-room' },
    { ...memory, locus_id: 'library-book' }, { ...memory, title: 'a'.repeat(161) },
    { ...memory, body: '' }, { ...memory, tags: Array(21).fill('tag') },
    { ...memory, source: '\ud800' }, { ...memory, status: 'deleted' },
  ];
  for (const data of invalidMemories) assert.equal((await call('/memories', { method: 'POST', data })).status, 400);
  assert.equal((await call('/memories?status=bad')).status, 400);
  assert.equal((await call('/memories?room=bad')).status, 400);
  assert.equal((await call('/memories', { method: 'POST', data: memory, headers: { 'Content-Type': 'text/plain' } })).status, 400);
  assert.equal((await call('/memories', { method: 'POST', data: { ...memory, body: 'x'.repeat(300000) } })).status, 400);
  for (const data of [
    { request_id: '../id', message: 'x' }, { request_id: 'id', message: '' },
    { request_id: 'id', message: 'a'.repeat(100001) },
    { request_id: 'id', capture: { image_data_url: 'data:image/png;base64,YmFk' } },
    { request_id: 'id', capture: { image_data_url: 'data:image/svg+xml;base64,PHN2Zz4=' } },
    { request_id: 'id', capture: { image_data_url: 'data:image/png;base64,' + 'A'.repeat(12 * 1024 * 1024) } },
    { request_id: 'id', message: 'x', placement: { room_id: 'hall', locus_id: 'missing' } },
  ]) assert.equal((await call('/chat', { method: 'POST', data })).status, 400);
  const design = (await call('/design')).data.design;
  for (const value of [
    { ...design, user_id: 'bob' }, { ...design, lighting_level: true },
    { ...design, name: 'https://evil.test' }, { ...design, render_style: 'unknown' },
    { ...design, decorations: [{ room_id: 'hall', slot: 'left', item: 'plant', color: '#fff' }] },
  ]) assert.equal((await call('/design', { method: 'POST', data: { design: value } })).status, 400);
  assert.equal((await call('/stats')).data.total, 0);
});
