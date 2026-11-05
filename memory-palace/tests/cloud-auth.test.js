import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {getUser, handleAuth} from '../cloudflare/auth.js';

// Real temporary SQLite exercises unique constraints, parameter binding, expiry,
// and transactional UPSERT behavior; it never touches the personal vault.
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../cloudflare/migrations/0001-auth.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return statement.get(...args) || null; },
        async all() { return {results: statement.all(...args)}; },
        async run() { const info = statement.run(...args); return {meta: {changes: info.changes}}; },
        batchRun() {
          if (statement.columns().length) return {results: statement.all(...args)};
          const info = statement.run(...args);
          return {results: [], meta: {changes: info.changes}};
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = statements.map(s => s.batchRun()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return {env: {DB}, sqlite};
}

const password = 'a long private passphrase';
function request(action, data = {}, options = {}) {
  const headers = {'Content-Type': 'application/json', Origin: 'https://palace.example', 'CF-Connecting-IP': '192.0.2.10', ...options.headers};
  return new Request(`https://palace.example/auth/${action}`, {
    method: options.method || (action === 'session' ? 'GET' : 'POST'), headers,
    ...((options.method || (action === 'session' ? 'GET' : 'POST')) !== 'GET' ? {body: JSON.stringify(data)} : {}),
  });
}
function sessionCookie(response) { return response.headers.get('Set-Cookie').split(';')[0]; }
async function register(env, username = 'alice', ip = '192.0.2.10') {
  const response = await handleAuth(request('register', {username, password}, {headers: {'CF-Connecting-IP': ip}}), env);
  assert.equal(response.status, 201, await response.clone().text());
  return {response, user: (await response.json()).user, cookie: sessionCookie(response)};
}

test('registration stores salted hashes and cookie-only sessions, normalizes account names', async () => {
  const {env, sqlite} = fixture();
  try {
    const first = await register(env, '  ＡLICE  ');
    assert.equal(first.user.username, 'alice');
    assert.deepEqual(Object.keys(first.user).sort(), ['id', 'username']);
    assert.match(first.response.headers.get('Set-Cookie'), /__Host-mp_session=[a-f0-9]{64}; Path=\/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax/);
    const second = await register(env, 'bob');
    assert.notEqual(first.user.id, second.user.id);
    const rows = sqlite.prepare('SELECT * FROM users ORDER BY username').all();
    assert.equal(rows[0].password_iterations, 100_000);
    assert.notEqual(rows[0].password_salt, rows[1].password_salt);
    assert.notEqual(rows[0].password_hash, rows[1].password_hash);
    assert.equal(rows[0].password_hash.includes(password), false);
    const rawToken = first.cookie.split('=')[1];
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?').get(rawToken).count, 0);
    const alice = await getUser(request('session', {}, {headers: {Cookie: first.cookie}}), env);
    const bob = await getUser(request('session', {}, {headers: {Cookie: second.cookie}}), env);
    assert.equal(alice.id, first.user.id);
    assert.equal(bob.id, second.user.id);
    assert.notEqual(alice.id, bob.id);
  } finally { sqlite.close(); }
});

test('login returns generic wrong/unknown errors and fresh sessions; expiry and logout revoke access', async () => {
  const {env, sqlite} = fixture();
  try {
    await register(env);
    const bad = await handleAuth(request('login', {username: 'alice', password: 'incorrect passphrase'}), env);
    const unknown = await handleAuth(request('login', {username: 'nobody', password: 'incorrect passphrase'}), env);
    assert.equal(bad.status, 401);
    assert.deepEqual(await bad.json(), await unknown.json());
    const login = await handleAuth(request('login', {username: 'ALICE', password}), env);
    assert.equal(login.status, 200);
    const cookie = sessionCookie(login);
    assert.ok(await getUser(request('session', {}, {headers: {Cookie: cookie}}), env));
    const logout = await handleAuth(request('logout', {}, {headers: {Cookie: cookie}}), env);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
    assert.equal(await getUser(request('session', {}, {headers: {Cookie: cookie}}), env), null);
    const again = await handleAuth(request('login', {username: 'alice', password}), env);
    sqlite.prepare('UPDATE sessions SET expires_at = ?').run(Math.floor(Date.now() / 1000) - 1);
    assert.equal(await getUser(request('session', {}, {headers: {Cookie: sessionCookie(again)}}), env), null);
    const expired = await handleAuth(request('session', {}, {headers: {Cookie: sessionCookie(again)}}), env);
    assert.equal(expired.status, 401);
  } finally { sqlite.close(); }
});

test('simultaneous registrations resolve unique-name races without partial sessions', async () => {
  const {env, sqlite} = fixture();
  try {
    const responses = await Promise.all(Array.from({length: 4}, () => handleAuth(request('register', {username: 'same_name', password}), env)));
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409, 409, 409]);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
  } finally { sqlite.close(); }
});

test('rate limits are atomic for both IP and username and expire after fifteen minutes', async () => {
  const {env, sqlite} = fixture();
  try {
    // Invalid submissions still consume the IP allowance, without costly KDFs.
    const attempts = await Promise.all(Array.from({length: 18}, (_, index) => handleAuth(request('login', {username: `person_${index}`, password: 'short'}), env)));
    assert.equal(attempts.filter(r => r.status === 400).length, 15);
    assert.equal(attempts.filter(r => r.status === 429).length, 3);
    assert.equal(attempts.find(r => r.status === 429).headers.get('Retry-After'), '900');
    // Username limit persists while callers rotate IP addresses.
    const rotating = [];
    for (let i = 0; i < 16; i++) rotating.push(await handleAuth(request('register', {username: 'same_account', password: 'short'}, {headers: {'CF-Connecting-IP': `192.0.2.${i + 20}`}}), env));
    assert.equal(rotating.filter(r => r.status === 429).length, 1);
    const allKeys = sqlite.prepare('SELECT key FROM auth_rate_limits').all();
    assert.ok(allKeys.every(row => /^[a-f0-9]{64}$/.test(row.key)));
    sqlite.prepare('UPDATE auth_rate_limits SET window_start = ?').run(Math.floor(Date.now() / 1000) - 901);
    const afterWindow = await handleAuth(request('login', {username: 'fresh_account', password: 'short'}), env);
    assert.equal(afterWindow.status, 400);
  } finally { sqlite.close(); }
});

test('auth rejects CSRF, unsafe methods, oversized bodies and invalid credentials', async () => {
  const {env, sqlite} = fixture();
  try {
    for (const origin of ['https://evil.example', 'null', '']) {
      assert.equal((await handleAuth(request('register', {username: 'alice', password}, {headers: {Origin: origin}}), env)).status, 403);
    }
    assert.equal((await handleAuth(request('register', {}, {method: 'GET'}), env)).status, 405);
    assert.equal((await handleAuth(request('login', {}, {headers: {'Content-Type': 'text/plain'}}), env)).status, 415);
    assert.equal((await handleAuth(request('register', {username: 'alice', password: 'x'.repeat(5000)}), env)).status, 413);
    assert.equal((await handleAuth(request('register', {username: "alice'; DROP TABLE users;--", password}), env)).status, 400);
    assert.equal((await handleAuth(request('register', {username: 'alice', password: 'x'.repeat(129)}), env)).status, 400);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
    const anonymous = await handleAuth(request('session'), env);
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get('Cache-Control'), 'no-store');
  } finally { sqlite.close(); }
});

test('only exact auth paths can dispatch account or session actions', async () => {
  const {env, sqlite} = fixture();
  try {
    for (const path of ['/auth/extra/register', '/auth/register/', '/other/login', '/auth/extra/session', '/auth/session/']) {
      const response = await handleAuth(new Request(`https://palace.example${path}`, {
        method: 'POST', headers: {Origin: 'https://palace.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({username: 'alice', password}),
      }), env);
      assert.equal(response.status, 404, path);
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM auth_rate_limits').get().count, 0);
  } finally { sqlite.close(); }
});

test('database failures return generic errors and getUser fails closed', async () => {
  const env = {DB: {prepare() { throw new Error('sensitive internal details'); }, batch() { throw new Error('sensitive internal details'); }}};
  const response = await handleAuth(request('login', {username: 'alice', password}), env);
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('sensitive'), false);
  await assert.rejects(() => getUser(request('session', {}, {headers: {Cookie: `__Host-mp_session=${'a'.repeat(64)}`}}), env));
});
