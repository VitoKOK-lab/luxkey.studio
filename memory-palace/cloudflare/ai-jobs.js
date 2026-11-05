import manifest from './catalog.json' with { type: 'json' };
import { runClaude, ClaudeError } from './claude.js';

const rooms = manifest.rooms;
const catalog = new Map(rooms.map(room => [room.id, room]));
const stewards = new Set(['hall', 'library', 'gallery', 'garden', 'observatory', 'quiet-room']);
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
const stamp = () => new Date().toISOString();
const uuid = () => crypto.randomUUID().replaceAll('-', '');
const encode = JSON.stringify;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const genericFailure = 'AI 處理未完成。原始內容仍保留在收件匣，可稍後重試。';
const waiting = '原始內容已保留，等待完成雲端 Claude 設定。';
const stale = '上次 AI 處理已逾時；原始內容仍保留，可重試。';
const sql = (db, query, ...values) => db.prepare(query).bind(...values);
const all = async (db, query, ...values) => (await sql(db, query, ...values).all()).results;
const get = (db, owner, id) => sql(db, 'SELECT * FROM cloud_jobs WHERE user_id=? AND id=?', owner, id).first();
const view = row => row ? { job_id: row.id, conversation_id: row.conversation_id, status: row.status, ...(row.error ? { error: row.error } : {}), ...(row.result ? { result: JSON.parse(row.result) } : {}) } : null;
function ownerOf(user) {
  if (!user || typeof user.id !== 'string' || !idPattern.test(user.id)) throw new Error('Authenticated account required');
  return user.id;
}
function field(value, maximum, required = false) {
  if (typeof value !== 'string' || !value.isWellFormed() || [...value].length > maximum || (required && !value.trim())) throw new Error('記憶欄位格式或長度不正確。');
  return value.trim();
}
const cap = (value, maximum) => /^\d+$/.test(String(value ?? '')) ? Math.max(1, Math.min(maximum, Number(value))) : maximum;
async function hash(value) {
  const normalized = value.normalize('NFC').replaceAll(/\s+/g, ' ').trim();
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The attempt token fences a late provider response after its 120-second lease. */
export async function recoverStaleJobs(env, user) {
  const owner = ownerOf(user);
  return sql(env.DB, "UPDATE cloud_jobs SET status='failed',error=?,attempt_token=NULL,lease_expires_at=NULL,updated_at=? WHERE user_id=? AND status='processing' AND (lease_expires_at IS NULL OR lease_expires_at<=?)", stale, stamp(), owner, Date.now()).run();
}
export const recoverStale = recoverStaleJobs;
export async function listPending(env, user) {
  return (await all(env.DB, 'SELECT candidate FROM cloud_ai_pending WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100', ownerOf(user))).map(row => JSON.parse(row.candidate));
}

async function context(db, owner, job, input) {
  const history = await all(db, "SELECT id,input,result FROM cloud_jobs WHERE user_id=? AND conversation_id=? AND sequence<? AND status='completed' ORDER BY sequence DESC LIMIT 12", owner, job.conversation_id, job.sequence);
  const sources = [
    { job_id: job.id, kind: 'capture_text', text: input.capture?.text || '', source: input.capture?.source || '貼上文字' },
    { job_id: job.id, kind: 'message', text: input.message || '', source: 'AI 對話' },
  ];
  const messages = [];
  for (const turn of history.reverse()) {
    const previous = JSON.parse(turn.input);
    const message = (previous.message || '').slice(-4000);
    const capture = (previous.capture?.text || '').slice(-3500);
    messages.push({ role: 'user', content: message + (capture ? '\n[擷取文字]\n' + capture : '') });
    if (turn.result) messages.push({ role: 'assistant', content: (JSON.parse(turn.result).reply || '').slice(0, 2000) });
    sources.push({ job_id: turn.id, kind: 'message', text: message, source: 'AI 對話' }, { job_id: turn.id, kind: 'capture_text', text: capture, source: previous.capture?.source || '貼上文字' });
  }
  // Score within SQL so older relevant memories remain discoverable without loading a vault.
  const query = ((input.message || '').slice(-1500) + ' ' + (input.capture?.text || '').slice(0, 1000)).toLocaleLowerCase();
  const terms = [...new Set(query.match(/[a-z0-9_]{2,}|[\u3400-\u9fff]{2}/g) || [])].slice(0, 8);
  const score = terms.length ? terms.map(() => "(instr(lower(json_extract(content,'$.title')||' '||json_extract(content,'$.body')),?)>0)").join('+') : 'CAST(0 AS INTEGER)';
  const relevant = (await all(db, `SELECT content FROM cloud_memories WHERE user_id=? AND status='active' ORDER BY (${score}) DESC,created_at DESC LIMIT 18`, owner, ...terms)).map(row => JSON.parse(row.content));
  const active = await all(db, "SELECT room_id,locus_id FROM cloud_memories WHERE user_id=? AND status='active'", owner);
  const occupied = new Set(active.map(row => `${row.room_id}:${row.locus_id}`));
  const payload = {
    message: input.message, capture: { ...input.capture }, messages,
    relevant_memories: relevant.map(memory => ({ id: memory.id, title: memory.title, body: memory.body.slice(0, 1200), cue: memory.cue, room_id: memory.room_id, locus_id: memory.locus_id })),
    catalog: rooms.map(room => ({ ...room, loci: room.loci.map(locus => ({ ...locus, available: !occupied.has(`${room.id}:${locus.id}`) })) })),
    ...(input.placement ? { placement: input.placement } : {}),
  };
  if (input.capture?.has_image) {
    const chunks = await all(db, 'SELECT content FROM cloud_captures WHERE user_id=? AND job_id=? ORDER BY chunk', owner, job.id);
    payload.capture.image_data_url = chunks.map(row => row.content).join('');
    if (!payload.capture.image_data_url) throw new Error('Missing original image');
  }
  return { payload, sources, relevant };
}

function checkedOutput(output) {
  if (!object(output) || !['remember', 'recall', 'chat'].includes(output.intent) || !Array.isArray(output.memories) || output.memories.length > 30 || !Array.isArray(output.recall_ids) || output.recall_ids.length > 40) throw new Error('Invalid AI output');
  return { reply: field(output.reply, 16000, true), intent: output.intent, clarification: field(output.clarification || '', 4000), steward_id: stewards.has(output.steward_id) ? output.steward_id : 'hall' };
}
function pendingCandidate(candidate, job, reason, fingerprint) {
  // Invalid model fields are never rendered as a stored fact. The original job remains intact.
  const safe = {};
  if (object(candidate)) for (const key of ['title', 'body', 'summary', 'mnemonic', 'cue', 'room_id', 'locus_id', 'source_quote']) {
    if (typeof candidate[key] === 'string') safe[key] = candidate[key].slice(0, key === 'source_quote' || key === 'body' ? 20000 : 2000);
  }
  return { title: safe.title || '待確認的記憶建議', proposed_candidate: safe, unverified: true, id: uuid(), job_id: job.id, conversation_id: job.conversation_id, fingerprint, reason, status: 'pending', created_at: stamp() };
}
async function plan(db, owner, job, input, output, base, sources, relevant, forcePending = false) {
  const activeRows = await all(db, "SELECT room_id,locus_id FROM cloud_memories WHERE user_id=? AND status='active'", owner);
  const occupied = new Set(activeRows.map(row => `${row.room_id}:${row.locus_id}`));
  const hashes = await Promise.all(output.memories.map((candidate, index) => hash(typeof candidate?.source_quote === 'string' && candidate.source_quote.trim() ? candidate.source_quote : `invalid:${job.id}:${index}`)));
  const existing = hashes.length ? await all(db, 'SELECT s.fingerprint,m.content FROM cloud_ai_sources s JOIN cloud_memories m ON m.user_id=s.user_id AND m.id=s.memory_id WHERE s.user_id=? AND s.fingerprint IN (SELECT value FROM json_each(?))', owner, encode(hashes)) : [];
  const duplicates = new Map(existing.map(row => [row.fingerprint, JSON.parse(row.content)]));
  const oldPending = hashes.length ? await all(db, 'SELECT fingerprint,candidate FROM cloud_ai_pending WHERE user_id=? AND fingerprint IN (SELECT value FROM json_each(?))', owner, encode(hashes)) : [];
  const pendingByHash = new Map(oldPending.map(row => [row.fingerprint, JSON.parse(row.candidate)]));
  const result = { ...base, memories: [], retrieved: [], duplicates: [], pending: [], conversation_id: job.conversation_id, job_id: job.id };
  const saves = [];
  const seen = new Set();
  let preferred = input.placement;
  for (let index = 0; index < (base.intent === 'remember' && !base.clarification ? output.memories.length : 0); index++) {
    const candidate = output.memories[index];
    const fingerprint = hashes[index];
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    if (duplicates.has(fingerprint)) { result.duplicates.push(duplicates.get(fingerprint)); continue; }
    let reason;
    let validated;
    try {
      if (!object(candidate)) throw new Error('擷取的記憶格式不正確。');
      const quote = field(candidate.source_quote, 20000, true);
      // Do not normalize an exact quote when grounding: whitespace is part of the source.
      const rawQuote = candidate.source_quote;
      const source = sources.find(item => item.text && item.text.includes(rawQuote));
      if (!source) throw new Error('找不到可核對的使用者來源原文；請確認圖片文字或補充原文。');
      const room = preferred?.room_id || candidate.room_id;
      if (!catalog.has(room)) throw new Error('擷取的記憶缺少有效房間。');
      const title = field(candidate.title, 160, true);
      let mnemonic = field(candidate.mnemonic, 2000, true);
      if (preferred && (candidate.room_id !== room || candidate.locus_id !== preferred.locus_id) && !mnemonic.includes('{locus}')) mnemonic = `在{locus}前，想像這個畫面。${mnemonic}`;
      const summary = field(candidate.summary || '', 1200);
      const cue = field(candidate.cue, 1000, true);
      const modelBody = field(candidate.body || '', 20000);
      if (!Array.isArray(candidate.tags) || candidate.tags.length > 20) throw new Error('記憶標籤格式不正確。');
      const tags = [...new Set(candidate.tags.map(tag => field(tag, 40, true)))];
      if (typeof candidate.locus_id !== 'string' || (candidate.locus_id && !catalog.get(room).loci.some(locus => locus.id === candidate.locus_id)) && !preferred) throw new Error('擷取的記憶錨點不正確。');
      const locus = preferred ? catalog.get(room).loci.find(item => item.id === preferred.locus_id) : catalog.get(room).loci.find(item => !occupied.has(`${room}:${item.id}`));
      if (!locus) reason = '房間的回想路線已滿，請指定其他空位。';
      else if (occupied.has(`${room}:${locus.id}`)) reason = '你指定的錨點已有記憶，請選擇其他空位。';
      else if (candidate.locus_id && candidate.locus_id !== locus.id && !mnemonic.includes('{locus}') && !preferred) reason = '預定錨點已變動，回想畫面需要重新確認。';
      const instant = stamp();
      validated = { id: uuid(), title, body: modelBody && rawQuote.includes(modelBody) ? modelBody : rawQuote, summary, cue, tags, room_id: room, locus_id: locus?.id || '', source: source.source, source_quote: rawQuote, provenance: { job_id: job.id, source_job_id: source.job_id, kind: source.kind, source: source.source }, mnemonic: mnemonic.replaceAll('{locus}', locus?.label || '{locus}'), status: 'active', created_at: instant, updated_at: instant, next_review: instant, review_count: 0, interval_days: 0 };
      if (base.intent !== 'remember' || base.clarification) reason = '尚需確認收錄意圖或補充釐清內容。';
      if (forcePending) reason = '錨點剛剛有其他變動，內容已保留待安放。';
    } catch (error) { reason = error.message; }
    if (reason) {
      const pending = pendingByHash.get(fingerprint) || { ...pendingCandidate(candidate, job, reason, fingerprint), ...(validated ? { ...validated, id: uuid(), status: 'pending', job_id: job.id, conversation_id: job.conversation_id, fingerprint, reason } : {}) };
      result.pending.push(pending);
    } else {
      saves.push({ fingerprint, memory: validated });
      result.memories.push(validated);
      occupied.add(`${validated.room_id}:${validated.locus_id}`);
    }
    // Explicit placement belongs to the first nonduplicate candidate, even if pending.
    preferred = null;
  }
  const relevantIds = new Set(relevant.map(memory => memory.id));
  const recall = [...new Set(output.recall_ids)].filter(id => typeof id === 'string' && idPattern.test(id) && relevantIds.has(id));
  if (recall.length) result.retrieved = (await all(db, "SELECT content FROM cloud_memories WHERE user_id=? AND status='active' AND id IN (SELECT value FROM json_each(?))", owner, encode(recall))).map(row => {
    const memory = JSON.parse(row.content);
    return { id: memory.id, title: memory.title, body: memory.body.slice(0, 1200), cue: memory.cue, tags: memory.tags, source: memory.source, status: memory.status, room_id: memory.room_id, locus_id: memory.locus_id, excerpt: memory.body.length > 1200 };
  });
  if (base.clarification) result.reply = base.clarification;
  if (result.pending.length) result.reply += `\n有 ${result.pending.length} 段已保留在待確認／待安放區。`;
  if (result.duplicates.length) result.reply += `\n有 ${result.duplicates.length} 段原文已收錄，沿用既有記憶。`;
  if (new TextEncoder().encode(encode(result)).byteLength > 1500000 || new TextEncoder().encode(encode(saves)).byteLength > 1500000) throw new Error('AI result exceeds storage bound');
  return { result, saves };
}

async function commit(db, owner, job, token, planned) {
  const guard = "EXISTS (SELECT 1 FROM cloud_jobs WHERE user_id=? AND id=? AND status='processing' AND attempt_token=? AND lease_expires_at>?)";
  const values = [owner, job.id, token, Date.now()];
  const saveJSON = encode(planned.saves);
  const batch = [
    sql(db, `INSERT INTO cloud_memories(user_id,id,content,room_id,locus_id,status,next_review,created_at) SELECT ?,json_extract(value,'$.memory.id'),json_extract(value,'$.memory'),json_extract(value,'$.memory.room_id'),json_extract(value,'$.memory.locus_id'),'active',json_extract(value,'$.memory.next_review'),json_extract(value,'$.memory.created_at') FROM json_each(?) WHERE ${guard}`, owner, saveJSON, ...values),
    sql(db, `INSERT INTO cloud_revisions(user_id,memory_id,action,recorded_at,snapshot) SELECT ?,json_extract(value,'$.memory.id'),'created:ai',?,json_extract(value,'$.memory') FROM json_each(?) WHERE ${guard}`, owner, stamp(), saveJSON, ...values),
    sql(db, `INSERT INTO cloud_ai_sources(user_id,fingerprint,memory_id) SELECT ?,json_extract(value,'$.fingerprint'),json_extract(value,'$.memory.id') FROM json_each(?) WHERE ${guard}`, owner, saveJSON, ...values),
    sql(db, `DELETE FROM cloud_ai_pending WHERE user_id=? AND fingerprint IN (SELECT json_extract(value,'$.fingerprint') FROM json_each(?)) AND ${guard}`, owner, saveJSON, ...values),
    sql(db, `INSERT INTO cloud_ai_pending(user_id,id,fingerprint,job_id,candidate,created_at) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.fingerprint'),json_extract(value,'$.job_id'),value,json_extract(value,'$.created_at') FROM json_each(?) WHERE ${guard} ON CONFLICT(user_id,fingerprint) DO NOTHING`, owner, encode(planned.result.pending), ...values),
    sql(db, "UPDATE cloud_jobs SET status='completed',result=?,error=NULL,attempt_token=NULL,lease_expires_at=NULL,updated_at=? WHERE user_id=? AND id=? AND status='processing' AND attempt_token=? AND lease_expires_at>?", encode(planned.result), stamp(), ...values),
  ];
  return db.batch(batch);
}

/** Claim, quota charge and account concurrency checks occur in one D1 transaction. */
export async function processJob(env, user, id, { infer = runClaude } = {}) {
  const owner = ownerOf(user);
  if (typeof id !== 'string' || !idPattern.test(id)) return null;
  const db = env.DB;
  await recoverStaleJobs(env, user);
  const initial = await get(db, owner, id);
  if (!initial || !['awaiting_api', 'queued', 'failed'].includes(initial.status)) return view(initial);
  const day = stamp().slice(0, 10);
  const scope = `user:${owner}`;
  const token = uuid();
  const lease = Date.now() + 120000;
  const claims = await db.batch([
    sql(db, 'INSERT INTO cloud_ai_quota(scope,day,attempts) VALUES (?,?,0) ON CONFLICT(scope,day) DO NOTHING', scope, day),
    sql(db, "INSERT INTO cloud_ai_quota(scope,day,attempts) VALUES ('global',?,0) ON CONFLICT(scope,day) DO NOTHING", day),
    sql(db, "UPDATE cloud_jobs SET status='processing',error=NULL,attempt_token=?,lease_expires_at=?,updated_at=? WHERE user_id=? AND id=? AND status IN ('awaiting_api','queued','failed') AND NOT EXISTS(SELECT 1 FROM cloud_jobs WHERE user_id=? AND status='processing') AND (SELECT attempts FROM cloud_ai_quota WHERE scope=? AND day=?)<? AND (SELECT attempts FROM cloud_ai_quota WHERE scope='global' AND day=?)<?", token, lease, stamp(), owner, id, owner, scope, day, cap(env.PALACE_AI_DAILY_LIMIT, 30), day, cap(env.PALACE_AI_GLOBAL_DAILY_LIMIT, 300)),
    sql(db, "UPDATE cloud_ai_quota SET attempts=attempts+1 WHERE day=? AND scope IN (?,'global') AND EXISTS(SELECT 1 FROM cloud_jobs WHERE user_id=? AND id=? AND attempt_token=?)", day, scope, owner, id, token),
  ]);
  if (!claims[2].meta.changes) {
    // Leave competing processing jobs untouched; make retryable quota/concurrency refusal explicit.
    await sql(db, "UPDATE cloud_jobs SET status='failed',error=?,updated_at=? WHERE user_id=? AND id=? AND status IN ('awaiting_api','queued','failed')", '目前已有 AI 工作處理中，或今日 AI 額度已用完。原文已保留，可稍後重試。', stamp(), owner, id).run();
    return view(await get(db, owner, id));
  }
  const job = await get(db, owner, id);
  try {
    const input = JSON.parse(job.input);
    const ctx = await context(db, owner, job, input);
    const output = await infer(env, { user, ...ctx.payload });
    const base = { ...checkedOutput(output), provider: 'anthropic', model: env.PALACE_CLAUDE_MODEL || 'claude-sonnet-4-6' };
    // A concurrent manual placement can occupy a locus after inference. Retry planning once,
    // then retain every candidate as pending if placements continue to change.
    for (let attempt = 0; attempt < 3; attempt++) {
      const planned = await plan(db, owner, job, input, output, base, ctx.sources, ctx.relevant, attempt === 2);
      try { await commit(db, owner, job, token, planned); break; }
      catch (error) {
        if (attempt === 2 || !String(error.message).includes('UNIQUE constraint failed')) throw error;
      }
    }
  } catch (error) {
    const unconfigured = error?.code === 'not_configured' || error?.name === 'ProviderNotConfigured';
    await sql(db, "UPDATE cloud_jobs SET status=?,error=?,attempt_token=NULL,lease_expires_at=NULL,updated_at=? WHERE user_id=? AND id=? AND status='processing' AND attempt_token=?", unconfigured ? 'awaiting_api' : 'failed', unconfigured ? waiting : error instanceof ClaudeError ? error.safeMessage : genericFailure, stamp(), owner, id, token).run();
  }
  return view(await get(db, owner, id));
}
