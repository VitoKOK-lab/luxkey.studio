export function installStyleControls({ getAppearance, previewStyle, previewLighting, saveAppearance }) {
  const opener = document.getElementById('style-open');
  const dialog = document.getElementById('style-dialog');
  const form = document.getElementById('style-form');
  const options = document.getElementById('style-options');
  const lighting = document.getElementById('style-lighting');
  const level = document.getElementById('lighting-level');
  const value = document.getElementById('lighting-value');
  const reset = document.getElementById('lighting-reset');
  const status = document.getElementById('style-status');
  const cancel = document.getElementById('style-cancel');
  const save = document.getElementById('style-save');
  const percent = new Intl.NumberFormat('zh-Hant', { style: 'percent', maximumFractionDigits: 2 });
  let names = new Map();
  let loadStatus = '正在讀取本機外觀設定…';
  let saving = false;
  let selectedLevel;

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }

  function showCurrent() {
    if (!names.size) return setStatus(loadStatus);
    const { render_style, lighting_level } = getAppearance();
    form.elements.render_style.value = render_style;
    showLighting(lighting_level);
    save.disabled = false;
    setStatus(`目前風格 · ${names.get(render_style)}`);
  }

  function showLighting(nextLevel) {
    // Preserve imported values between slider steps until the user adjusts the slider.
    selectedLevel = nextLevel;
    level.value = nextLevel * 100;
    value.textContent = percent.format(nextLevel);
    level.setAttribute('aria-valuetext', value.textContent);
  }

  function preview(action) {
    try {
      action();
      save.disabled = false;
      setStatus(`預覽中 · ${names.get(form.elements.render_style.value)}`);
    } catch (error) {
      save.disabled = true;
      setStatus(error.message || '無法預覽外觀設定。', true);
    }
  }

  function changeLighting(nextLevel) {
    showLighting(nextLevel);
    preview(() => previewLighting(nextLevel));
  }

  opener.disabled = false;
  opener.addEventListener('click', () => {
    showCurrent();
    dialog.showModal();
    (options.querySelector(':checked') || cancel).focus();
  });
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => {
    if (saving) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    if (!names.size) return;
    const { render_style, lighting_level } = getAppearance();
    previewStyle(render_style);
    previewLighting(lighting_level);
  });
  options.addEventListener('change', ({ target }) => preview(() => previewStyle(target.value)));
  level.addEventListener('input', () => changeLighting(level.valueAsNumber / 100));
  reset.addEventListener('click', () => changeLighting(Number(level.defaultValue) / 100));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    const render_style = form.elements.render_style.value;
    saving = true;
    options.disabled = lighting.disabled = cancel.disabled = save.disabled = true;
    setStatus('正在儲存外觀設定…');
    try {
      await saveAppearance({ render_style, lighting_level: selectedLevel });
      dialog.close();
    } catch (error) {
      setStatus(error.message || '無法儲存外觀設定，請再試一次。', true);
    } finally {
      saving = false;
      options.disabled = lighting.disabled = cancel.disabled = save.disabled = false;
    }
  });

  return {
    setOptions(styles) {
      names = new Map(styles.map(({ id, name }) => [id, name]));
      options.replaceChildren(...styles.map(({ id, name, description }) => {
        const label = document.createElement('label');
        label.className = 'style-choice';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'render_style';
        radio.value = id;
        const swatch = document.createElement('span');
        swatch.className = 'style-swatch';
        swatch.dataset.style = id;
        swatch.setAttribute('aria-hidden', 'true');
        const title = document.createElement('strong');
        title.textContent = name;
        const subtitle = document.createElement('span');
        subtitle.className = 'style-description';
        subtitle.textContent = description;
        label.append(radio, swatch, title, subtitle);
        return label;
      }));
      options.disabled = lighting.disabled = false;
      if (dialog.open) showCurrent();
    },
    setLoadError() {
      loadStatus = '無法讀取本機外觀設定，請重新載入莊園。';
      if (dialog.open) setStatus(loadStatus, true);
    },
    setBlocked(blocked) {
      opener.disabled = blocked;
    },
  };
}
