// Included only in the Cloudflare build; the local app keeps its existing flow.
const sessionStatus = document.createElement('span');
sessionStatus.setAttribute('role', 'status');
sessionStatus.className = 'cloud-session-status';
const logout = document.createElement('button');
logout.type = 'button';
logout.className = document.querySelector('.top-actions') ? 'button ghost' : 'action';
logout.textContent = '登出';
logout.disabled = true;
logout.setAttribute('aria-label', '登出雲端私人空間');
const container = document.createElement('div');
container.className = 'cloud-session';
container.style.cssText = 'display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;font:inherit';
sessionStatus.style.cssText = 'max-width:12rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.75rem';
container.append(sessionStatus, logout);
(document.querySelector('.top-actions') || document.querySelector('.masthead'))?.append(container);

function login() {
  location.replace('/login');
}

logout.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    const response = await fetch('/auth/logout', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok && response.status !== 401) throw new Error('登出暫時失敗，請再試一次。');
    login();
  } catch (error) {
    sessionStatus.textContent = error.message || '無法連線，請再試一次。';
    logout.disabled = false;
  }
});

try {
  const response = await fetch('/auth/session', { credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) {
    login();
  } else {
    if (!response.ok) throw new Error('暫時無法讀取登入狀態。');
    const session = await response.json();
    const user = session.user;
    if (!user) {
      login();
    } else {
      sessionStatus.textContent = user.username || user.name || user.email || '私人帳戶';
      sessionStatus.title = sessionStatus.textContent;
      logout.disabled = false;
    }
  }
} catch (error) {
  sessionStatus.textContent = error.message || '無法連線至雲端私人空間。';
}
