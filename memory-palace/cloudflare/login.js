const form = document.querySelector('#auth-form');
const loginButton = document.querySelector('#login-mode');
const registerButton = document.querySelector('#register-mode');
const username = document.querySelector('#username');
const password = document.querySelector('#password');
const message = document.querySelector('#form-message');
const submit = document.querySelector('#submit-button');
const submitText = document.querySelector('#submit-text');
const showPassword = document.querySelector('#show-password');
let mode = 'login';
let pending = false;

function setMode(next) {
  if (pending) return;
  mode = next;
  loginButton.setAttribute('aria-pressed', String(mode === 'login'));
  registerButton.setAttribute('aria-pressed', String(mode === 'register'));
  document.querySelector('#form-title').textContent = mode === 'login' ? '歡迎回來' : '建立你的莊園';
  document.querySelector('#form-description').textContent = mode === 'login' ? '登入帳號，接著收藏你的生活。' : '選一個帳號名稱，開始你的雲端收藏。';
  document.querySelector('#register-note').hidden = mode !== 'register';
  password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  submitText.textContent = mode === 'login' ? '進入莊園' : '建立帳號並進入';
  message.textContent = '';
}

loginButton.addEventListener('click', () => setMode('login'));
registerButton.addEventListener('click', () => setMode('register'));
showPassword.addEventListener('click', () => {
  const reveal = password.type === 'password';
  password.type = reveal ? 'text' : 'password';
  showPassword.setAttribute('aria-pressed', String(reveal));
  showPassword.textContent = reveal ? '隱藏密碼' : '顯示密碼';
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (pending || !form.reportValidity()) return;
  pending = true;
  submit.disabled = loginButton.disabled = registerButton.disabled = true;
  form.setAttribute('aria-busy', 'true');
  message.textContent = '';
  submitText.textContent = mode === 'login' ? '正在登入…' : '正在建立莊園…';
  try {
    const response = await fetch(`/auth/${mode}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: username.value, password: password.value}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '暫時無法登入，請稍後再試。');
    // Session credentials remain in the browser's HttpOnly cookie only.
    password.value = '';
    window.location.replace('/');
  } catch (error) {
    message.textContent = error instanceof TypeError ? '連線暫時中斷，請檢查網路後再試。' : error.message;
    pending = false;
    submit.disabled = loginButton.disabled = registerButton.disabled = false;
    form.setAttribute('aria-busy', 'false');
    submitText.textContent = mode === 'login' ? '進入莊園' : '建立帳號並進入';
  }
});
