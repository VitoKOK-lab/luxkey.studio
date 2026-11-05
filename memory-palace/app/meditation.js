import { createMeditationWater } from './meditation-water.js';

// Elapsed time follows the monotonic clock, including when the tab is hidden.
export function createQuietSession(clock = () => performance.now()) {
  let minutes = 3, state = 'ready', elapsed = 0, started = 0;
  function snapshot() {
    const seconds = Math.min(minutes * 60, elapsed + (state === 'running' ? (clock() - started) / 1000 : 0));
    if (seconds >= minutes * 60) { state = 'complete'; elapsed = seconds; }
    return { minutes, state, seconds, remaining: Math.max(0, Math.ceil(minutes * 60 - seconds)) };
  }
  return {
    snapshot,
    reset() { state = 'ready'; elapsed = 0; return snapshot(); },
    setMinutes(value) {
      if (!['ready', 'complete'].includes(snapshot().state) || ![3, 5, 10].includes(value)) return false;
      minutes = value; state = 'ready'; elapsed = 0; return true;
    },
    toggle() {
      const wasRunning = state === 'running';
      const current = snapshot();
      // A late pause click must finish the session, never accidentally restart it.
      if (wasRunning && current.state === 'complete') return current;
      if (current.state === 'running') { elapsed = current.seconds; state = 'paused'; }
      else { if (current.state === 'complete') elapsed = 0; started = clock(); state = 'running'; }
      return snapshot();
    },
  };
}

export function installMeditation({ dialog, beforeOpen, focusFallback, tourFocusFallback }) {
  const find = (id) => dialog.querySelector(`#${id}`);
  const water = createMeditationWater(find('meditation-water'));
  const session = createQuietSession();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const durations = [...dialog.querySelectorAll('[data-minutes]')];
  const scenes = [...dialog.querySelectorAll('[data-quiet-scene]')];
  const start = find('meditation-start');
  const motion = find('meditation-motion');
  let interval = null, still = false, returnFocus = focusFallback, lastState;

  function syncMotion(state) {
    water.setReducedMotion(reduced.matches);
    water.setPaused(still || state === 'paused' || state === 'complete');
    const frozen = state === 'paused' || state === 'complete';
    const moving = !still && !reduced.matches && !frozen;
    motion.setAttribute('aria-pressed', String(moving));
    motion.querySelector('span').textContent = frozen ? '畫面暫停' : moving ? '流動畫面' : '靜態畫面';
    motion.setAttribute('aria-label', frozen ? '畫面已隨靜心暫停' : reduced.matches ? '靜態畫面，遵循系統減少動態效果設定' : moving ? '暫停畫面流動' : '恢復畫面流動');
    motion.disabled = reduced.matches || frozen;
  }

  function update() {
    const { minutes, state, seconds, remaining } = session.snapshot();
    if (state !== 'running') { clearInterval(interval); interval = null; }
    if (document.hidden) return state;
    dialog.dataset.session = state;
    find('meditation-time').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    const phase = (seconds % 10) / 10;
    find('breath-text').textContent = state === 'running' ? phase < .5 ? '慢慢吸氣' : '慢慢吐氣' :
      { ready: '在這裡，停留一下', paused: '讓這一刻，停一停', complete: '把這份平靜，帶回去' }[state];
    find('breath-caption').textContent = { ready: '此刻，沒有需要完成的事', running: '跟著自己的節奏就好', paused: '準備好了，再繼續', complete: '這段時間，只屬於你' }[state];
    find('breath-line').style.transform = `scaleX(${state === 'running' && !reduced.matches && !still ? .3 + .7 * (1 - Math.cos(phase * Math.PI * 2)) / 2 : .5})`;
    find('meditation-progress').style.transform = `scaleX(${seconds / (minutes * 60)})`;
    start.querySelector('span').textContent = { ready: '開始靜心', running: '暫停', paused: '繼續靜心', complete: '再坐一會兒' }[state];
    find('meditation-play-icon').querySelector('path').setAttribute('d', state === 'running' ? 'M8 5v14M16 5v14' : 'm9 5 10 7-10 7z');
    for (const option of durations) {
      option.setAttribute('aria-pressed', String(Number(option.dataset.minutes) === minutes));
      option.disabled = state === 'running' || state === 'paused';
    }
    if (lastState !== state) {
      find('meditation-status').textContent = {
        ready: '不必配合波浪改變呼吸，舒服就好。',
        running: '讓視線輕輕停在水面，呼吸自然就好。',
        paused: '時間與水波都停下了。你可以慢慢來。',
        complete: '靜心完成。可以再坐一會兒，或回到莊園。',
      }[state];
      lastState = state;
    }
    water.setBreath({ phase, running: state === 'running' });
    syncMotion(state);
    return state;
  }

  start.addEventListener('click', () => {
    const { state } = session.toggle();
    clearInterval(interval);
    interval = state === 'running' && !document.hidden ? setInterval(update, 200) : null;
    update();
  });
  for (const option of durations) option.addEventListener('click', () => {
    if (session.setMinutes(Number(option.dataset.minutes))) update();
  });
  for (const option of scenes) option.addEventListener('click', () => {
    water.setMode(option.dataset.quietScene);
    dialog.dataset.landscape = option.dataset.quietScene;
    for (const button of scenes) button.setAttribute('aria-pressed', String(button === option));
  });
  motion.addEventListener('click', () => { still = !still; update(); });
  reduced.addEventListener('change', () => { if (dialog.open) update(); });
  document.addEventListener('visibilitychange', () => {
    if (!dialog.open) return;
    clearInterval(interval); interval = null;
    const state = update();
    if (!document.hidden && state === 'running') interval = setInterval(update, 200);
  });
  find('meditation-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    clearInterval(interval); interval = null;
    water.setActive(false);
    session.reset();
    lastState = undefined;
    if (!document.querySelector('dialog[open]')) {
      const target = returnFocus?.isConnected && returnFocus.getClientRects().length ? returnFocus : focusFallback;
      target?.focus({ preventScroll: true });
    }
  });
  return {
    open(opener) {
      if (dialog.open) return;
      const candidate = opener?.focus ? opener : document.activeElement;
      returnFocus = candidate?.closest('#tour-dialog') ? tourFocusFallback || focusFallback : candidate;
      beforeOpen?.();
      session.reset(); lastState = undefined;
      dialog.showModal();
      update();
      water.setActive(true);
      start.focus({ preventScroll: true });
    },
  };
}
