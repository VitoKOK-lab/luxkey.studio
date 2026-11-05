// Workers currently caps a PBKDF2 invocation at 100,000 iterations. Keep this
// explicit and versioned per account, rather than silently lowering the work.
// https://github.com/cloudflare/workerd/issues/1346
const ITERATIONS = 100_000;
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const RATE_SECONDS = 15 * 60;
const RATE_ATTEMPTS = 15;
const COOKIE = '__Host-mp_session';
const encoder = new TextEncoder();
const dummySalt = new Uint8Array(16);
const dummyHash = new Uint8Array(32);

class AuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  }});
}

function hex(bytes) { return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join(''); }
function unhex(value) {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(value)) throw new Error('Invalid stored credential');
  return Uint8Array.from(value.match(/../g), n => parseInt(n, 16));
}
async function digest(value) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
function randomHex(length) { return hex(crypto.getRandomValues(new Uint8Array(length))); }
function cookieValue(request) {
  const values = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).filter(s => s.startsWith(`${COOKIE}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(COOKIE.length + 1);
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}
function cookie(token, age = SESSION_SECONDS) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
}
function nowSeconds() { return Math.floor(Date.now() / 1000); }

async function derive(password, salt, iterations = ITERATIONS) {
  if (iterations !== ITERATIONS) throw new Error('Unsupported stored credential version');
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt, iterations}, key, 256));
}

async function equalHash(actual, expected) {
  // WebCrypto HMAC verification performs the secret comparison in native code.
  // Unlike a JavaScript byte loop, this also works on runtimes without the
  // Cloudflare-specific timingSafeEqual extension.
  const data = encoder.encode('memory-palace/password-verification/v1');
  const [actualKey, expectedKey] = await Promise.all([
    crypto.subtle.importKey('raw', actual, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']),
    crypto.subtle.importKey('raw', expected, {name: 'HMAC', hash: 'SHA-256'}, false, ['verify']),
  ]);
  const signature = await crypto.subtle.sign('HMAC', actualKey, data);
  return crypto.subtle.verify('HMAC', expectedKey, signature, data);
}

async function bodyJSON(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    throw new AuthError(403, '請從憶境莊園頁面操作。');
  }
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AuthError(415, '請使用 JSON 格式。');
  }
  if (Number(request.headers.get('Content-Length')) > 4096) throw new AuthError(413, '輸入內容太長。');
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, '請填寫帳號與密碼。');
  let size = 0;
  const chunks = [];
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new AuthError(413, '輸入內容太長。'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    return data;
  } catch { throw new AuthError(400, '輸入格式不正確。'); }
}

async function rateLimit(request, env, action, username) {
  const now = nowSeconds();
  // CF-Connecting-IP is assigned by Cloudflare, not a client-provided proxy list.
  // Only hashes go to D1. Username and IP have separate limits, so cycling one
  // identifier cannot bypass the other. Login and registration have separate keys.
  const keys = await Promise.all([
    digest(`${action}:ip:${request.headers.get('CF-Connecting-IP') || 'unknown'}`),
    digest(`${action}:username:${username}`),
  ]);
  const statements = keys.map(key => env.DB.prepare(`
    INSERT INTO auth_rate_limits (key, window_start, attempts) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN window_start <= ? THEN 1 ELSE MIN(attempts + 1, 16) END,
      window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
    RETURNING attempts
  `).bind(key, now, now - RATE_SECONDS, now - RATE_SECONDS));
  // D1 batches are transactional; each increment is a single atomic UPSERT.
  const results = await env.DB.batch(statements);
  if (results.some(result => Number(result.results?.[0]?.attempts || 0) > RATE_ATTEMPTS)) {
    throw new AuthError(429, '嘗試次數較多，請在 15 分鐘後再試。');
  }
  await env.DB.prepare('DELETE FROM auth_rate_limits WHERE window_start < ?').bind(now - RATE_SECONDS * 2).run();
}

async function newSession(env, user, extraStatements = []) {
  const token = randomHex(32);
  const now = nowSeconds();
  await env.DB.batch([
    ...extraStatements,
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(await digest(token), user.id, now + SESSION_SECONDS, now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
  ]);
  return json({user}, extraStatements.length ? 201 : 200, {'Set-Cookie': cookie(token)});
}

/** Returns only the verified tenant identity. Database failures must fail closed. */
export async function getUser(request, env) {
  const token = cookieValue(request);
  if (!token) return null;
  const user = await env.DB.prepare(`
    SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(await digest(token), nowSeconds()).first();
  return user ? {id: user.id, username: user.username} : null;
}

export async function handleAuth(request, env) {
  const path = new URL(request.url).pathname;
  const match = /^\/auth\/(register|login|logout|session)$/.exec(path);
  try {
    if (!match) return json({error: '找不到此操作。'}, 404);
    const action = match[1];
    if (request.method !== (action === 'session' ? 'GET' : 'POST')) {
      return json({error: '不支援此操作方式。'}, 405, {Allow: action === 'session' ? 'GET' : 'POST'});
    }
    if (action === 'session') {
      const user = await getUser(request, env);
      return json({user}, user ? 200 : 401);
    }
    const data = await bodyJSON(request);
    if (action === 'logout') {
      const token = cookieValue(request);
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(token)).run();
      return json({user: null}, 200, {'Set-Cookie': cookie('', 0)});
    }
    const username = typeof data.username === 'string' ? data.username.normalize('NFKC').trim().toLowerCase() : '';
    const password = typeof data.password === 'string' ? data.password : '';
    // Charge even invalid attempts. Bound identifiers before hashing or querying.
    await rateLimit(request, env, action, username.slice(0, 128));
    if (!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(username)) {
      throw new AuthError(400, '帳號請使用 3～40 個英文字母、數字、底線或連字號，並以字母或數字開頭。');
    }
    if (password.length < 12 || password.length > 128) throw new AuthError(400, '密碼需為 12～128 個字元。');
    if (action === 'register') {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await derive(password, salt);
      const user = {id: crypto.randomUUID(), username};
      try {
        return await newSession(env, user, [env.DB.prepare(`
          INSERT INTO users (id, username, password_salt, password_hash, password_iterations, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(user.id, username, hex(salt), hex(hash), ITERATIONS, nowSeconds())]);
      } catch (error) {
        // Check the unique constraint outcome without exposing D1 details. The
        // unique index, rather than a preflight lookup, resolves signup races.
        const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
        if (exists) throw new AuthError(409, '此帳號目前無法使用，請選擇另一個名稱。');
        throw error;
      }
    }
    const stored = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    const actual = await derive(password, stored ? unhex(stored.password_salt) : dummySalt, stored?.password_iterations ?? ITERATIONS);
    const matches = await equalHash(actual, stored ? unhex(stored.password_hash) : dummyHash);
    if (!matches || !stored) throw new AuthError(401, '帳號或密碼不正確。');
    return await newSession(env, {id: stored.id, username: stored.username});
  } catch (error) {
    if (error instanceof AuthError) return json({error: error.message}, error.status, error.status === 429 ? {'Retry-After': String(RATE_SECONDS)} : {});
    // Never return database messages, password material, tokens, or stack traces.
    return json({error: '目前無法完成操作，請稍後再試。'}, 503);
  }
}
