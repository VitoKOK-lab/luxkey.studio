import manifest from './catalog.json' with { type: 'json' };
import { claudeStatus } from './claude.js';
import { processJob, recoverStaleJobs } from './ai-jobs.js';

const { rooms, design_catalog: designCatalog, default_design: defaultDesign } = manifest;
const loci = new Map(rooms.map(room => [room.id, room.loci.map(locus => locus.id)]));
const mutable = new Set(['title', 'body', 'room_id', 'locus_id', 'cue', 'tags', 'source', 'status']);
const identifier = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_BODY = 262144;
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_CHAT_BODY = 12 * 1024 * 1024;
const waitingMessage = '原始內容已保留，等待連接你的 AI Agent。';
class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new ApiError(message, status); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const defaulted = (value, fallback) => value === undefined ? fallback : value;
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID().replaceAll('-', '');
function json(value, status = 200, filename) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (filename) headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  return new Response(JSON.stringify(value), { status, headers });
}
function text(value, label, maximum, required = false, raw = false) {
  if (typeof value !== 'string') fail(`${label}必須是文字。`);
  if (!value.isWellFormed()) fail(`${label}包含無效字元。`);
  const clean = value.trim();
  if (required && !clean) fail(`請填寫${label}。`);
  if ([...(raw ? value : clean)].length > maximum) fail(`${label}最多 ${maximum} 個字。`);
  return raw ? value : clean;
}
function exact(value, keys, message) {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(message);
}
async function body(request, maximum = MAX_BODY) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') fail('請求內容必須是 application/json。');
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || +length > maximum || +length === 0)) fail('請求為空或超過大小限制。');
  const reader = request.body?.getReader();
  if (!reader) fail('請求為空或超過大小限制。');
  let count = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    count += value.byteLength;
    if (count > maximum) { await reader.cancel(); fail('請求為空或超過大小限制。'); }
    chunks.push(value);
  }
  if (!count) fail('請求為空或超過大小限制。');
  let value;
  try {
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { fail('JSON 格式不正確。'); }
  if (!object(value)) fail('請提供 JSON 物件。');
  return value;
}
function memoryInput(payload, previous) {
  for (const key of Object.keys(payload)) if (!mutable.has(key)) fail('包含不支援的欄位：' + key);
  const data = { ...previous, ...payload };
  data.title = text(defaulted(data.title, ''), '記憶標題', 160, true);
  data.body = text(defaulted(data.body, ''), '記憶內容', 20000, true);
  data.room_id = defaulted(data.room_id, 'hall');
  if (!loci.has(data.room_id)) fail('這個房間不存在。');
  if (previous && previous.room_id !== data.room_id && !Object.hasOwn(payload, 'locus_id')) data.locus_id = null;
  if (data.locus_id == null || data.locus_id === '') data.locus_id = loci.get(data.room_id)[0];
  if (!loci.get(data.room_id).includes(data.locus_id)) fail('請選擇這個房間裡的記憶錨點。');
  data.cue = text(defaulted(data.cue, ''), '聯想線索', 1000);
  data.source = text(defaulted(data.source, '手動記錄'), '來源', 512);
  data.tags = defaulted(data.tags, []);
  if (!Array.isArray(data.tags) || data.tags.length > 20) fail('標籤需要是陣列，最多 20 個。');
  data.tags = [...new Set(data.tags.map(tag => text(tag, '標籤', 40, true)))];
  data.status = defaulted(data.status, 'active');
  if (!['active', 'archived'].includes(data.status)) fail('狀態必須是 active 或 archived。');
  return data;
}
function designInput(value) {
  const required = ['schema_version', 'architecture_id', 'name', 'theme', 'decorations'];
  if (!object(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => ![...required, 'render_style', 'lighting_level'].includes(key))) fail('設計欄位不正確。');
  if (value.schema_version !== 1) fail('設計版本不支援。');
  if (value.architecture_id !== designCatalog.architecture_id) fail('莊園建築版本不支援。');
  const name = text(value.name, '莊園名稱', 60, true);
  if (/(https?:\/\/|www\.)/i.test(name)) fail('莊園名稱不能包含網址。');
  if (!designCatalog.themes.some(theme => theme.id === value.theme)) fail('莊園主題不在支援清單中。');
  const render_style = defaulted(value.render_style, 'original');
  if (!designCatalog.render_styles.some(style => style.id === render_style)) fail('場景風格不在支援清單中。');
  const lighting_level = defaulted(value.lighting_level, 1);
  if (typeof lighting_level !== 'number' || !Number.isFinite(lighting_level) || lighting_level < 0.7 || lighting_level > 1.5) fail('燈光亮度需為 70% 至 150%。');
  if (!Array.isArray(value.decorations) || value.decorations.length > 48) fail('裝飾需為陣列，最多 48 件。');
  const seen = new Set();
  const decorations = value.decorations.map(decoration => {
    exact(decoration, ['room_id', 'slot', 'item', 'color'], '裝飾欄位不正確。');
    if (!loci.has(decoration.room_id)) fail('裝飾房間不存在。');
    if (!['left', 'right'].includes(decoration.slot)) fail('裝飾位置不支援。');
    if (!designCatalog.items.some(item => item.id === decoration.item)) fail('裝飾品項不支援。');
    if (typeof decoration.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(decoration.color)) fail('裝飾顏色必須是 #RRGGBB。');
    const key = `${decoration.room_id}:${decoration.slot}`;
    if (seen.has(key)) fail('同一房間的位置不能重複放置裝飾。');
    seen.add(key);
    return { ...decoration, color: decoration.color.toUpperCase() };
  });
  return { schema_version: 1, architecture_id: designCatalog.architecture_id, name, theme: value.theme, render_style, lighting_level, decorations };
}
function imageInput(value) {
  if (typeof value !== 'string' || value.length > Math.floor(MAX_IMAGE * 4 / 3) + 48) fail('圖片最多 8 MiB。');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) fail('請附上 PNG、JPEG 或 WebP 圖片。');
  let decoded;
  try { decoded = atob(match[2]); } catch { fail('圖片編碼不正確。'); }
  if (decoded.length > MAX_IMAGE) fail('圖片最多 8 MiB。');
  const valid = match[1] === 'png' ? decoded.startsWith('\x89PNG\r\n\x1a\n') : match[1] === 'jpeg' ? decoded.startsWith('\xff\xd8\xff') : decoded.startsWith('RIFF') && decoded.slice(8, 12) === 'WEBP';
  if (!valid) fail('圖片內容與標示的格式不符。');
  return value;
}
function chatInput(payload) {
  if (Object.keys(payload).some(key => !['request_id', 'conversation_id', 'message', 'capture', 'placement'].includes(key))) fail('對話包含不支援的欄位。');
  const requestId = payload.request_id;
  const conversationId = payload.conversation_id || 'palace';
  if (typeof requestId !== 'string' || !identifier.test(requestId) || typeof conversationId !== 'string' || !identifier.test(conversationId)) fail('對話或請求識別碼格式不正確。');
  const message = text(defaulted(payload.message, ''), '訊息', 100000, false, true);
  const capture = defaulted(payload.capture, {});
  if (!object(capture) || Object.keys(capture).some(key => !['text', 'source', 'image_data_url'].includes(key))) fail('擷取內容格式不正確。');
  const clean = {};
  if (Object.hasOwn(capture, 'text')) clean.text = text(capture.text, '擷取文字', 100000, false, true);
  if (Object.hasOwn(capture, 'source')) clean.source = text(capture.source, '擷取來源', 512);
  const image = Object.hasOwn(capture, 'image_data_url') ? imageInput(capture.image_data_url) : null;
  if (image) clean.has_image = true;
  if (!message.trim() && !clean.text?.trim() && !image) fail('請輸入訊息、貼上文字或附上圖片。');
  const input = { message, capture: clean };
  if (Object.hasOwn(payload, 'placement')) {
    exact(payload.placement, ['room_id', 'locus_id'], '指定的錨點格式不正確。');
    if (!loci.get(payload.placement.room_id)?.includes(payload.placement.locus_id)) fail('指定的錨點不存在。');
    input.placement = { room_id: payload.placement.room_id, locus_id: payload.placement.locus_id };
  }
  return { requestId, conversationId, input, image };
}
const encode = value => JSON.stringify(value);
async function fingerprint(input, image) {
  const bytes = new TextEncoder().encode(encode(input) + '\n' + (image ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

/** Auth and same-origin mutation protection are enforced by the calling Worker. */
export async function handleApi(request, env, user) {
  try {
    if (!user || typeof user.id !== 'string' || !user.id) fail('請先登入莊園。', 401);
    const owner = user.id;
    const db = env.DB;
    const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
    const first = (sql, ...args) => stmt(sql, ...args).first();
    const all = async (sql, ...args) => (await stmt(sql, ...args).all()).results;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    async function getMemory(id) {
      const row = await first('SELECT content, version FROM cloud_memories WHERE user_id=? AND id=?', owner, id);
      if (!row) fail('找不到這段記憶。', 404);
      return { data: JSON.parse(row.content), version: row.version };
    }
    async function list(search = '', room = '', status = 'active', due = false) {
      if (!['active', 'archived', 'all'].includes(status)) fail('狀態篩選不正確。');
      if (room && !loci.has(room)) fail('這個房間不存在。');
      search = text(search, '搜尋文字', 500);
      const clauses = ['user_id=?'];
      const args = [owner];
      if (status !== 'all') { clauses.push('status=?'); args.push(status); }
      if (room) { clauses.push('room_id=?'); args.push(room); }
      if (due) { clauses.push('next_review<=?'); args.push(now()); }
      const result = (await all(`SELECT content FROM cloud_memories WHERE ${clauses.join(' AND ')} ORDER BY next_review ASC, created_at DESC`, ...args)).map(row => JSON.parse(row.content));
      const terms = search.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      return result.filter(memory => terms.every(term => `${memory.title} ${memory.body} ${memory.cue} ${encode(memory.tags)} ${memory.source}`.toLocaleLowerCase().includes(term)));
    }
    async function stats() {
      const counts = await all('SELECT status, room_id, COUNT(*) AS count FROM cloud_memories WHERE user_id=? GROUP BY status, room_id', owner);
      const result = { total: 0, active: 0, archived: 0, due: 0, rooms: Object.fromEntries(rooms.map(room => [room.id, 0])) };
      for (const row of counts) { result.total += row.count; result[row.status] += row.count; if (row.status === 'active') result.rooms[row.room_id] = row.count; }
      result.due = (await first("SELECT COUNT(*) AS count FROM cloud_memories WHERE user_id=? AND status='active' AND next_review<=?", owner, now())).count;
      return result;
    }
    async function getDesign() {
      const row = await first("SELECT value FROM cloud_settings WHERE user_id=? AND key='estate_design_v1'", owner);
      return row ? designInput(JSON.parse(row.value)) : structuredClone(defaultDesign);
    }
    async function getJob(id) {
      const job = await first('SELECT * FROM cloud_jobs WHERE user_id=? AND id=?', owner, id);
      if (!job) fail('找不到這筆對話工作。', 404);
      return job;
    }
    async function saveMemory(data, action, previous) {
      const serialized = encode(data);
      let writes;
      if (!previous) {
        writes = [stmt('INSERT INTO cloud_memories(user_id,id,content,room_id,locus_id,status,next_review,created_at) VALUES (?,?,?,?,?,?,?,?)', owner, data.id, serialized, data.room_id, data.locus_id, data.status, data.next_review, data.created_at), stmt('INSERT INTO cloud_revisions(user_id,memory_id,action,recorded_at,snapshot) VALUES (?,?,?,?,?)', owner, data.id, action, now(), serialized)];
      } else {
        writes = [stmt('UPDATE cloud_memories SET content=?,room_id=?,locus_id=?,status=?,next_review=?,version=version+1 WHERE user_id=? AND id=? AND version=?', serialized, data.room_id, data.locus_id, data.status, data.next_review, owner, data.id, previous.version), stmt('INSERT INTO cloud_revisions(user_id,memory_id,action,recorded_at,snapshot) SELECT user_id,id,?,?,content FROM cloud_memories WHERE user_id=? AND id=? AND version=? AND content=? AND changes()=1', action, now(), owner, data.id, previous.version + 1, serialized)];
      }
      let results;
      try { results = await db.batch(writes); }
      catch (error) {
        if (String(error.message).includes('UNIQUE constraint failed: cloud_memories.user_id, cloud_memories.room_id, cloud_memories.locus_id')) fail('這個錨點已有記憶。請選擇空位，或先封存原本的記憶。');
        throw error;
      }
      if (previous && results[0].meta.changes === 0) fail('這段記憶剛剛已更新，請重新載入後再試。', 409);
      return data;
    }
    if (method === 'GET' && path === '/api/health') return json({ ok: true, mode: 'cloud' });
    if (method === 'GET' && path === '/api/ai/status') {
      const status = claudeStatus(env,user);
      if (status.available) {
        const success = await first("SELECT updated_at FROM cloud_jobs WHERE user_id=? AND status='completed' AND json_extract(result,'$.provider')='anthropic' AND json_extract(result,'$.model')=? ORDER BY updated_at DESC LIMIT 1",owner,status.model);
        if (success) {
          status.connection_verified = true;
          status.last_success_at = success.updated_at;
          status.message = 'Claude 管家已可使用 · 對話、截圖與相關記憶由 Anthropic 處理';
        }
      }
      return json(status);
    }
    if (method === 'GET' && path === '/api/memories') return json({ memories: await list(url.searchParams.get('search') ?? '', url.searchParams.get('room') ?? '', url.searchParams.get('status') ?? 'active', url.searchParams.get('due') === 'true') });
    if (method === 'GET' && path === '/api/stats') return json(await stats());
    if (method === 'GET' && path === '/api/design') return json({ design: await getDesign(), catalog: designCatalog });
    if (method === 'GET' && path === '/api/design/export') return json(await getDesign(), 200, 'memory-palace-design.json');
    if (method === 'POST' && path === '/api/design') {
      const payload = await body(request);
      exact(payload, ['design'], '設計儲存請求只能包含 design 欄位。');
      const design = designInput(payload.design);
      await stmt("INSERT INTO cloud_settings(user_id,key,value) VALUES (?,'estate_design_v1',?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value", owner, encode(design)).run();
      return json({ design });
    }
    if (method === 'POST' && path === '/api/memories') {
      const instant = now();
      const data = { ...memoryInput(await body(request)), id: uuid(), created_at: instant, updated_at: instant, next_review: instant, review_count: 0, interval_days: 0 };
      return json({ memory: await saveMemory(data, 'created') }, 201);
    }
    const memoryMatch = /^\/api\/memories\/([^/]+)(\/review)?$/.exec(path);
    if (memoryMatch && ['GET', 'PATCH', 'POST'].includes(method)) {
      const previous = await getMemory(memoryMatch[1]);
      if (method === 'GET' && !memoryMatch[2]) return json({ memory: previous.data });
      if (method === 'PATCH' && !memoryMatch[2]) {
        const data = memoryInput(await body(request), previous.data);
        data.updated_at = now();
        const action = data.status === previous.data.status ? 'updated' : data.status === 'archived' ? 'archived' : 'restored';
        return json({ memory: await saveMemory(data, action, previous) });
      }
      if (method === 'POST' && memoryMatch[2]) {
        const payload = await body(request);
        exact(payload, ['rating'], '回訪請求只能包含 rating 欄位。');
        if (!['again', 'good', 'easy'].includes(payload.rating)) fail('回想評價必須是 again、good 或 easy。');
        if (previous.data.status !== 'active') fail('請先將這段記憶從封存中還原。');
        const data = { ...previous.data };
        const old = data.interval_days;
        const days = payload.rating === 'again' ? 0 : payload.rating === 'good' ? Math.max(1, Math.min(365, old * 2 + 1)) : Math.max(3, Math.min(365, old * 3 + 3));
        Object.assign(data, { review_count: data.review_count + 1, interval_days: days, updated_at: now(), next_review: new Date(Date.now() + (payload.rating === 'again' ? 600000 : days * 86400000)).toISOString() });
        return json({ memory: await saveMemory(data, `review:${payload.rating}`, previous) });
      }
    }
    if (method === 'POST' && path === '/api/chat') {
      const { requestId, conversationId, input, image } = chatInput(await body(request, MAX_CHAT_BODY));
      const hash = await fingerprint(input, image);
      // The fingerprint covers exact originals, including the separately stored image.
      const encoded = encode({ ...input, _fingerprint: hash });
      const existing = await first('SELECT id,conversation_id,input,status FROM cloud_jobs WHERE user_id=? AND request_id=?', owner, requestId);
      if (existing) {
        if (existing.conversation_id !== conversationId || JSON.parse(existing.input)._fingerprint !== hash) fail('這個請求識別碼已用於不同的訊息。');
        return json({ job_id: existing.id, status: existing.status }, 202);
      }
      const id = uuid();
      const instant = now();
      const ready = claudeStatus(env,user).available;
      const status = ready ? 'queued' : 'awaiting_api';
      const writes = [stmt("INSERT INTO cloud_jobs(user_id,id,request_id,conversation_id,input,status,error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", owner, id, requestId, conversationId, encoded, status, ready ? null : waitingMessage, instant, instant)];
      if (image) for (let offset = 0, chunk = 0; offset < image.length; offset += 500000, chunk++) writes.push(stmt('INSERT INTO cloud_captures(user_id,job_id,chunk,content) VALUES (?,?,?,?)', owner, id, chunk, image.slice(offset, offset + 500000)));
      try { await db.batch(writes); }
      catch (error) {
        // A concurrent repeat can win the UNIQUE request key; return the same job.
        const winner = await first('SELECT id,conversation_id,input,status FROM cloud_jobs WHERE user_id=? AND request_id=?', owner, requestId);
        if (!winner) throw error;
        if (winner.conversation_id !== conversationId || JSON.parse(winner.input)._fingerprint !== hash) fail('這個請求識別碼已用於不同的訊息。');
        return json({ job_id: winner.id, status: winner.status }, 202);
      }
      return json({ job_id: id, status }, 202);
    }
    if (method === 'GET' && path === '/api/chat/history') {
      await recoverStaleJobs(env, user);
      const conversationId = url.searchParams.get('conversation_id') || 'palace';
      if (!identifier.test(conversationId)) fail('對話識別碼格式不正確。');
      const jobs = await all('SELECT * FROM cloud_jobs WHERE user_id=? AND conversation_id=? ORDER BY sequence DESC LIMIT 60', owner, conversationId);
      const messages = [];
      for (const job of jobs.reverse()) {
        const input = JSON.parse(job.input);
        const entry = { role: 'user', content: input.message, capture: input.capture, job_id: job.id, status: job.status, created_at: job.created_at };
        if (input.placement) entry.placement = input.placement;
        if (job.error) entry.error = job.error;
        messages.push(entry);
        if (job.result) { const result = JSON.parse(job.result); messages.push({ role: 'assistant', content: result.reply, result, job_id: job.id, created_at: job.updated_at }); }
      }
      return json({ conversation_id: conversationId, messages });
    }
    if (method === 'GET' && path === '/api/inbox') {
      await recoverStaleJobs(env, user);
      const jobs = await all("SELECT * FROM cloud_jobs WHERE user_id=? AND status IN ('awaiting_api','failed') ORDER BY sequence DESC LIMIT 100", owner);
      const pending = await all('SELECT candidate FROM cloud_ai_pending WHERE user_id=? ORDER BY created_at DESC LIMIT 100', owner);
      const result = { pending: pending.map(row => JSON.parse(row.candidate)), awaiting_api: [], failed: [] };
      for (const job of jobs) {
        const input = JSON.parse(job.input);
        delete input._fingerprint;
        result[job.status === 'failed' ? 'failed' : 'awaiting_api'].push({ ...input, id: job.id, job_id: job.id, created_at: job.created_at, reason: job.error || waitingMessage });
      }
      return json(result);
    }
    const jobMatch = /^\/api\/jobs\/([^/]+)(\/(?:retry|process))?$/.exec(path);
    if (jobMatch && ['GET', 'POST'].includes(method)) {
      await recoverStaleJobs(env, user);
      const job = await getJob(jobMatch[1]);
      if (method === 'POST' && jobMatch[2] === '/process') {
        if (job.status !== 'queued') return json({job_id:job.id},202);
        if (!claudeStatus(env,user).available) {
          await stmt("UPDATE cloud_jobs SET status='awaiting_api',error=?,updated_at=? WHERE user_id=? AND id=? AND status='queued'",waitingMessage,now(),owner,job.id).run();
        } else await processJob(env,user,job.id);
        return json({job_id:job.id},202);
      }
      if (method === 'POST' && jobMatch[2] === '/retry') {
        if (!claudeStatus(env, user).available) fail('Claude 尚未開放或設定；原始內容已保留。', 409);
        if (!['failed', 'awaiting_api'].includes(job.status)) fail('只有等待連線或處理失敗的內容可以重試。', 409);
        await processJob(env, user, job.id);
        return json({ job_id: job.id }, 202);
      }
      if (method === 'GET' && !jobMatch[2]) return json({ job_id: job.id, conversation_id: job.conversation_id, status: job.status, requires_processing: job.status === 'queued', ...(job.error ? { error: job.error } : {}), ...(job.result ? { result: JSON.parse(job.result) } : {}) });
    }
    if (method === 'GET' && path === '/api/butler') {
      const query = text(url.searchParams.get('query') ?? '', '管家問題', 500);
      const memories = (await list(query, '', 'active', !query)).slice(0, 8);
      const summary = await stats();
      const titles = new Map();
      for (const memory of await list()) {
        const key = memory.title.replaceAll(/\s+/g, '').toLocaleLowerCase();
        if (!titles.has(key)) titles.set(key, []);
        titles.get(key).push({ id: memory.id, title: memory.title });
      }
      const duplicates = [...titles.values()].filter(group => group.length > 1);
      const message = query ? `找到 ${memories.length} 段符合搜尋文字的記憶。` : summary.active === 0 ? (claudeStatus(env,user).available ? '歡迎回家。跟管家聊聊今天的一個片刻，讓記憶找到自己的位置。' : '歡迎回家。你的雲端莊園目前是空的，提交的內容會先保留在收件匣，等待連接 AI Agent。') : `目前有 ${summary.due} 段記憶等待回訪。`;
      return json({ mode: 'cloud', message, memories, duplicates, suggested_room: 'hall', stats: summary });
    }
    if (method === 'GET' && path === '/api/export') {
      const memories = (await all('SELECT content FROM cloud_memories WHERE user_id=? ORDER BY created_at', owner)).map(row => JSON.parse(row.content));
      const revisions = (await all('SELECT revision_id,memory_id,action,recorded_at,snapshot FROM cloud_revisions WHERE user_id=? ORDER BY revision_id', owner)).map(row => ({ ...row, snapshot: JSON.parse(row.snapshot) }));
      return json({ version: 1, exported_at: now(), memories, revisions }, 200, 'memory-palace-export.json');
    }
    return json({ error: '這個 API 路徑不存在。' }, 404);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    // Do not include SQL, original captures, request URLs, or secrets in logs/errors.
    return json({ error: '莊園暫時無法處理這個請求，請稍後重試。' }, 500);
  }
}
