import { getUser, handleAuth } from './auth.js';
import { handleApi } from './api.js';

const privatePages = new Set(['/', '/index.html', '/renders.html']);
const safeMethods = new Set(['GET', 'HEAD']);
const policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const json = (error, status) => new Response(JSON.stringify({error}), {
  status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
});

function secured(response, sensitive = false) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('Content-Security-Policy', policy);
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Strict-Transport-Security', 'max-age=31536000');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (sensitive) {
    headers.set('Cache-Control','no-store');
    headers.set('Vary','Cookie');
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export function originAllowed(request) {
  const origin = request.headers.get('Origin');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return false;
  if (origin && origin !== new URL(request.url).origin) return false;
  return safeMethods.has(request.method) || origin === new URL(request.url).origin;
}

async function writeAllowed(db,userId) {
  const window = Math.floor(Date.now()/60000);
  await db.prepare('DELETE FROM cloud_write_limits WHERE window_start < ?').bind(window-1440).run();
  const row = await db.prepare(`INSERT INTO cloud_write_limits(user_id,window_start,attempts)
    VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET
    attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,
    window_start=excluded.window_start
    WHERE window_start<>excluded.window_start OR attempts<60 RETURNING attempts`).bind(userId,window).first();
  return Boolean(row);
}

export function createWorker({userFor=getUser, auth=handleAuth, api=handleApi}={}) {
  return {async fetch(request,env) {
    const url=new URL(request.url);
    const path=url.pathname;
    const isApi=path==='/api' || path.startsWith('/api/');
    const isAuth=path==='/auth' || path.startsWith('/auth/') && !['/auth/login.js','/auth/login.css'].includes(path);
    const sensitive=isApi || isAuth || privatePages.has(path) || ['/login','/login.html'].includes(path);
    try {
      let response;
      if ((isApi || isAuth) && !originAllowed(request)) return secured(json('請從憶境莊園頁面操作。',403),true);
      if (isAuth) response=await auth(request,env);
      else if (isApi || privatePages.has(path)) {
        const user=await userFor(request,env);
        if (!user) response=isApi ? json('請先登入你的記憶莊園。',401) : new Response(null,{status:302,headers:{Location:'/login'}});
        else if (isApi) {
          if (!safeMethods.has(request.method) && !await writeAllowed(env.DB,user.id)) {
            response=json('操作較頻繁，請稍候一分鐘再試。',429);
            response.headers.set('Retry-After','60');
          } else response=await api(request,env,user);
        } else if (!safeMethods.has(request.method)) response=json('不支援這個操作。',405);
        else {
          if (path==='/') url.pathname='/index.html';
          response=await env.ASSETS.fetch(new Request(url,request));
        }
      } else if (!safeMethods.has(request.method)) response=json('不支援這個操作。',405);
      else {
        if (path==='/login') url.pathname='/login.html';
        response=await env.ASSETS.fetch(new Request(url,request));
      }
      return secured(response,sensitive);
    } catch {
      // Do not log request bodies, credentials, searches, captures or DB contents.
      return secured(json('雲端莊園暫時無法處理，請稍後再試。',503),true);
    }
  }};
}

export default createWorker();
