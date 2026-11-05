const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitingStates = new Set(['awaiting_api', 'blocked']);
const runningStates = new Set(['queued', 'running']);

export function installChat({ $, el, button, api, toast, locationName, openDetail, walkMemory, syncVault, onView, localCommand }) {
  const form = $('chat-form');
  const input = $('chat-input');
  const log = $('chat-log');
  const send = $('chat-send');
  const chatTab = $('chat-tab');
  const collectionTab = $('collection-tab');
  const captureDialog = $('capture-dialog');
  const picker = $('capture-file');
  let capture = null;
  let placement = null;
  const placementBadge = el('div', 'placement-badge');
  placementBadge.hidden = true;
  form.prepend(placementBadge);
  let activeJob = null;
  let conversation;
  let tts = false;
  let status = { available: false };
  const statusButtons = new Set();

  function showChat(preferChat = true) {
    $('chat-view').hidden = !preferChat;
    $('collection-view').hidden = preferChat;
    chatTab.setAttribute('aria-pressed', preferChat);
    collectionTab.setAttribute('aria-pressed', !preferChat);
    const panel = document.querySelector('.butler-panel');
    if (panel.classList.contains('collapsed')) $('panel-toggle').click();
    onView?.(preferChat);
  }

  function setBusy(busy) {
    send.disabled = busy;
    send.setAttribute('aria-busy', busy);
  }

  function bottom() {
    log.scrollTop = log.scrollHeight;
  }

  function message(role, content, meta = '') {
    const item = el('article', `chat-message ${role}`);
    item.append(el('small', 'chat-author', role === 'user' ? '你' : '莊園管家'));
    if (content) item.append(el('p', 'chat-copy', content));
    if (meta) item.append(el('p', 'chat-meta', meta));
    log.append(item);
    bottom();
    return item;
  }

  function receipt(meta, content) {
    const item = message('assistant', content, meta);
    item.classList.add('chat-receipt');
    item.querySelector('.chat-author').textContent = '莊園收件匣';
    return item;
  }

  function captureLabel(item) {
    if (!item) return '';
    const kinds = [];
    if (item.text) kinds.push('文字');
    if (item.has_image || item.image_data_url) kinds.push('截圖');
    if (!kinds.length) return '';
    return `${item.source || '擷取內容'} · ${kinds.join('＋')}`;
  }

  function addUser(entry) {
    const detail = captureLabel(entry.capture);
    const item = message('user', entry.content || entry.message, detail);
    if (entry.capture?.text) {
      const original = el('details', 'chat-original');
      original.append(el('summary', '', '查看擷取原文'), el('p', '', entry.capture.text));
      item.append(original);
    }
    return item;
  }

  async function refreshStatus() {
    try {
      status = await api('/ai/status');
      const label = status.message || (status.available ? 'Agent 已設定' : '等待連接你的 AI Agent');
      $('provider-status').textContent = label;
      $('provider-status').dataset.available = status.available ? 'true' : 'false';
    } catch {
      status = { available: false };
      $('provider-status').textContent = '無法讀取 AI 連線狀態';
    }
    for (const control of statusButtons) control.disabled = !status.available;
  }

  function speak(text) {
    if (!tts || !text || recognition || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 3000));
    utterance.lang = 'zh-TW';
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.localService && /^zh[-_]TW$/i.test(voice.lang)) ||
      voices.find((voice) => voice.localService && /^zh/i.test(voice.lang)) || null;
    window.speechSynthesis.speak(utterance);
  }

  function memoryCard(memory, kind) {
    const card = el('article', 'chat-memory');
    const title = button(memory.title, 'chat-memory-title', () => void openDetail(memory.id));
    const line = el('p', 'chat-meta', locationName(memory));
    const image = typeof memory.mnemonic === 'string' ? memory.mnemonic : memory.mnemonic?.image;
    const cue = image || memory.cue;
    const origin = memory.source || memory.provenance?.source;
    card.append(el('small', 'chat-author', kind), title, line);
    if (cue) card.append(el('p', 'chat-memory-cue', cue));
    if (origin) card.append(el('p', 'chat-meta', `來源 · ${origin}`));
    card.append(button(kind === '取回的記憶' ? '請管家取回 ↗' : '帶我走到地標 ↗', 'text-button', () => {
      walkMemory(memory, kind === '取回的記憶' ? 'retrieve' : 'encode');
    }));
    return card;
  }

  function showResult(result, restoring = false) {
    conversation = result.conversation_id || conversation;
    const item = message('assistant', result.reply || '');
    const memories = result.memories || [];
    const retrieved = result.retrieved || [];
    const duplicates = result.duplicates || [];
    const pending = result.pending || [];
    item.append(...memories.map((memory) => memoryCard(memory, '已安放')),
      ...retrieved.map((memory) => memoryCard(memory, '取回的記憶')),
      ...duplicates.map((memory) => memoryCard(memory, '可能重複的記憶')));
    if (pending.length) {
      item.append(el('p', 'chat-meta', `有 ${pending.length} 段需要釐清，原文保留在收件匣。`));
      for (const candidate of pending) {
        const note = el('div', 'chat-memory');
        note.append(el('strong', '', candidate.title || '待釐清'), el('p', 'chat-meta', candidate.reason || ''));
        item.append(note);
      }
    }
    const active = memories.filter((memory) => memory.status !== 'archived');
    if (active.length) {
      const undo = button('撤回這批安放', 'text-button chat-undo', async () => {
        undo.disabled = true;
        const outcomes = await Promise.allSettled(active.map(({ id }) =>
          api(`/memories/${id}`, 'PATCH', { status: 'archived' })));
        const failed = outcomes.filter(({ status }) => status === 'rejected').length;
        undo.textContent = failed ? '再次撤回未完成的安放' : '已撤回 · 可從收藏恢復';
        undo.disabled = !failed;
        syncVault();
        if (failed) toast(`${failed} 段記憶暫時無法收起。`);
      });
      item.append(undo);
    }
    if (!restoring) {
      syncVault();
      speak(result.reply);
      const first = retrieved[0] || memories[0];
      if (first) walkMemory(first, retrieved.length ? 'retrieve' : 'encode', true);
    }
    bottom();
  }

  function showWaiting(jobId, serverMessage) {
    const item = receipt('等待 AI Agent', serverMessage ||
      '原文已收下。接上你的 AI Agent 後，管家會接著提問、整理並歸位。');
    const retry = button('連線後整理', 'text-button', () => void retryJob(jobId, item));
    retry.disabled = !status.available;
    statusButtons.add(retry);
    item.append(retry);
  }

  function showFailure(error, jobId) {
    const item = receipt('處理失敗', error || '本次處理未完成，原文已保存在收件匣。');
    if (jobId) item.append(button('重試處理', 'text-button', () => void retryJob(jobId, item)));
  }

  function errorText(error) {
    return error instanceof TypeError ? '無法連線至本機收件匣。' : error.message;
  }

  async function watch(jobId) {
    activeJob = jobId;
    setBusy(true);
    const progress = receipt('處理中', '管家正在讀取這次交付的內容。');
    let errors = 0;
    try {
      while (activeJob === jobId) {
        let job;
        try {
          job = await api(`/jobs/${jobId}`);
          errors = 0;
        } catch (error) {
          if (++errors >= 4) {
            progress.remove();
            const item = receipt('暫時無法讀取進度', errorText(error));
            item.append(button('查看進度', 'text-button', () => {
              if (activeJob) return;
              item.remove();
              void watch(jobId);
            }));
            return;
          }
          await delay(1500);
          continue;
        }
        if (job.status === 'completed') {
          progress.remove();
          showResult(job.result || {});
          return;
        }
        conversation = job.conversation_id || conversation;
        if (waitingStates.has(job.status)) {
          progress.remove();
          showWaiting(jobId, job.message);
          return;
        }
        if (job.status === 'failed' || !runningStates.has(job.status)) {
          progress.remove();
          showFailure(job.error, jobId);
          return;
        }
        progress.querySelector('.chat-meta').textContent = job.status === 'queued' ? '等候處理' : '整理中';
        await delay(950);
      }
    } finally {
      if (activeJob === jobId) {
        activeJob = null;
        setBusy(false);
      }
    }
  }

  async function retryJob(jobId, item) {
    if (activeJob || send.disabled) return;
    setBusy(true);
    try {
      const result = await api(`/jobs/${jobId}/retry`, 'POST', {});
      for (const control of item.querySelectorAll('button')) statusButtons.delete(control);
      item.remove();
      void watch(result.job_id || jobId);
    } catch (error) {
      toast(errorText(error));
      void refreshStatus();
      setBusy(false);
    }
  }

  async function post(payload, retryItem) {
    if (send.disabled) return;
    setBusy(true);
    try {
      const accepted = await api('/chat', 'POST', payload);
      conversation = accepted.conversation_id || conversation;
      if (!retryItem) {
        addUser(payload);
        if (input.value.trim() === payload.message) input.value = '';
        if (capture === payload.capture) setCapture(null);
      } else {
        retryItem.remove();
        addUser(payload);
      }
      if (waitingStates.has(accepted.status)) {
        showWaiting(accepted.job_id, accepted.message);
        setBusy(false);
        return;
      }
      void watch(accepted.job_id);
    } catch (error) {
      setBusy(false);
      if (retryItem) {
        retryItem.querySelector('.chat-copy').textContent = errorText(error);
        return;
      }
      const item = receipt('尚未確認收到', errorText(error));
      item.append(button('重送同一份內容', 'text-button', () => void post(payload, item)));
    }
  }

  function setCapture(item) {
    capture = item;
    const preview = $('capture-preview');
    preview.hidden = !item;
    if (!item) { preview.replaceChildren(); return; }
    const summary = el('div');
    summary.append(el('strong', '', captureLabel(item)));
    if (item.text) summary.append(el('p', '', item.text.slice(0, 125)));
    if (item.image_data_url) {
      const thumbnail = el('img');
      thumbnail.src = item.image_data_url;
      thumbnail.alt = '附加的截圖預覽';
      preview.replaceChildren(thumbnail, summary);
    } else {
      preview.replaceChildren(summary);
    }
    const remove = button('×', 'icon-button', () => setCapture(null));
    remove.setAttribute('aria-label', '移除附件');
    preview.append(remove);
  }

  function attachText(value, source) {
    const text = value.trim();
    if (!text) return;
    if ([...text].length > 100000) {
      toast('一次最多可擷取 100,000 個字。');
      return;
    }
    setCapture({ ...capture, text, source });
    showChat();
  }

  async function attachFile(file) {
    if (!file) return false;
    if (imageTypes.has(file.type)) {
      if (file.size > 8 * 1024 * 1024) { toast('截圖必須在 8 MB 以內。'); return false; }
      try {
        const imageData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener('load', () => resolve(reader.result));
          reader.addEventListener('error', reject);
          reader.readAsDataURL(file);
        });
        setCapture({ ...capture, source: file.name || '貼上的截圖', image_data_url: imageData });
      } catch {
        toast('無法讀取這張截圖。');
        return false;
      }
    } else if (/\.(txt|md)$/i.test(file.name) || /^text\/(plain|markdown)$/.test(file.type)) {
      if (file.size > 400000) { toast('一次最多可擷取 100,000 個字。'); return false; }
      try { attachText(await file.text(), file.name); }
      catch { toast('無法讀取這份文字。'); return false; }
    } else {
      toast('請使用 PNG、JPG、WebP、TXT 或 Markdown。');
      return false;
    }
    showChat();
    input.focus();
    return true;
  }

  chatTab.addEventListener('click', () => showChat());
  collectionTab.addEventListener('click', () => showChat(false));
  $('capture-open').addEventListener('click', () => {
    $('capture-text').value = capture?.text || '';
    captureDialog.showModal();
    $('capture-text').focus();
  });
  $('capture-browse').addEventListener('click', () => picker.click());
  $('capture-apply').addEventListener('click', () => {
    attachText($('capture-text').value, '貼上的對話或文字');
    captureDialog.close();
    input.focus();
  });
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (await attachFile(file) && captureDialog.open) {
      const original = $('capture-text').value.trim();
      if (original && imageTypes.has(file.type)) attachText(original, file.name);
      captureDialog.close();
      input.focus();
    }
  });
  for (const target of [form, captureDialog]) {
    target.addEventListener('paste', (event) => {
      const image = [...(event.clipboardData?.files || [])].find((file) => imageTypes.has(file.type));
      if (image) {
        event.preventDefault();
        void attachFile(image).then((attached) => {
          if (attached && captureDialog.open) {
            attachText($('capture-text').value, '貼上的對話與截圖');
            captureDialog.close();
            input.focus();
          }
        });
        return;
      }
      const text = event.clipboardData?.getData('text/plain');
      if (target === form && text && (text.length > 420 || text.split('\n').length > 3)) {
        event.preventDefault();
        attachText(text, '貼上的對話或文字');
      }
    });
  }
  const drop = $('chat-view');
  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('dragging');
    event.dataTransfer.dropEffect = 'copy';
  });
  drop.addEventListener('dragleave', (event) => {
    if (!drop.contains(event.relatedTarget)) drop.classList.remove('dragging');
  });
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('dragging');
    const file = event.dataTransfer.files[0];
    if (file) return void attachFile(file);
    const text = event.dataTransfer.getData('text/plain');
    if (text) attachText(text, '拖入的對話或文字');
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (send.disabled) return;
    if (recognition) {
      toast('請先結束這次語音輸入。');
      return;
    }
    const messageText = input.value.trim();
    if (!messageText && !capture) { input.focus(); return; }
    if (!capture && localCommand?.(messageText)) { input.value = ''; return; }
    void post({ message: messageText, request_id: crypto.randomUUID(),
      ...(conversation && { conversation_id: conversation }), ...(capture && { capture }), ...(placement && { placement }) });
  });
  function beginGuided(text) {
    showChat();
    if (send.disabled) { toast('請等這次內容收妥，再開始下一段對話。'); return; }
    void post({ message: text, request_id: crypto.randomUUID(),
      ...(conversation && { conversation_id: conversation }), ...(placement && { placement }) });
  }
  const starters = {
    today: '請陪我回顧今天。先問我一個容易回答的小問題，再根據我的回答，幫我發現值得留下的片段。',
    recall: '有件事我一時想不起來。請先問我還記得什麼線索，再協助尋找，不要替我猜測經歷。',
    learn: '我想聊聊剛剛學到的內容。請一次問一個問題，幫我用自己的話說清楚，再建立助記聯想。',
  };
  $('guided-starters').addEventListener('click', (event) => {
    const key = event.target.closest('[data-guide]')?.dataset.guide;
    if (starters[key]) beginGuided(starters[key]);
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechState = $('speech-state');
  let recognition = null;
  let stopped = false;

  function micUI(active) {
    $('chat-mic').classList.toggle('recording', active);
    $('chat-mic').setAttribute('aria-label', active ? '停止語音輸入' : '開始語音輸入');
    $('chat-mic').title = active ? '停止語音輸入' : '開始語音輸入';
    $('hero-mic').lastChild.textContent = active ? '停止語音' : '開始說話';
    $('mic-cancel').hidden = !active;
  }

  function toggleSpeech() {
    showChat();
    input.focus();
    if (recognition) {
      if (!stopped) {
        stopped = true;
        speechState.textContent = '辨識中…';
        recognition.stop();
      }
      return;
    }
    if (!SpeechRecognition) {
      speechState.textContent = '可用 Mac 聽寫';
      toast('此瀏覽器未提供語音辨識。可在輸入框使用 Mac 的「聽寫」快捷鍵。');
      return;
    }
    window.speechSynthesis?.cancel();
    const engine = new SpeechRecognition();
    const initial = input.value.trimEnd();
    let transcript = '';
    let errorMessage = '';
    recognition = engine;
    stopped = false;
    engine.lang = 'zh-TW';
    engine.interimResults = true;
    engine.continuous = true;
    engine.onstart = () => { micUI(true); speechState.textContent = '正在聆聽'; };
    engine.onresult = (event) => {
      transcript = Array.from(event.results).map((result) => result[0].transcript).join('');
      input.value = [initial, transcript].filter(Boolean).join(initial ? '\n' : '');
    };
    engine.onerror = (event) => {
      if (event.error === 'aborted') return;
      errorMessage = ['not-allowed', 'service-not-allowed'].includes(event.error) ? '請開啟麥克風權限，或使用 Mac 聽寫。' :
        event.error === 'no-speech' ? '這次沒有聽清楚。' : '瀏覽器語音服務暫時無法辨識。';
      toast(errorMessage);
    };
    engine.onend = () => {
      if (recognition !== engine) return;
      recognition = null;
      micUI(false);
      speechState.textContent = errorMessage ? '辨識未完成' : transcript ? '檢查後送出' : '';
    };
    engine.cancelDraft = () => {
      recognition = null;
      engine.abort();
      input.value = initial;
      micUI(false);
      speechState.textContent = '已取消';
    };
    try {
      engine.start();
      micUI(true);
      speechState.textContent = '等待麥克風';
    } catch {
      recognition = null;
      micUI(false);
      speechState.textContent = '無法開始';
    }
  }

  $('hero-mic').addEventListener('click', toggleSpeech);
  $('chat-mic').addEventListener('click', toggleSpeech);
  $('mic-cancel').addEventListener('click', () => recognition?.cancelDraft());
  $('tts-toggle').addEventListener('click', () => {
    if (!window.speechSynthesis) { toast('此瀏覽器未提供語音朗讀。'); return; }
    tts = !tts;
    $('tts-toggle').setAttribute('aria-pressed', tts);
    if (!tts) window.speechSynthesis.cancel();
    toast(tts ? '已開啟回覆朗讀' : '已關閉回覆朗讀');
  });

  $('inbox-open').addEventListener('click', async () => {
    const dialog = $('inbox-dialog');
    const content = $('inbox-content');
    content.replaceChildren(el('p', 'dialog-intro', '讀取本機收件匣…'));
    dialog.showModal();
    try {
      await refreshStatus();
      const inbox = await api('/inbox');
      const pending = inbox.pending || [];
      const awaiting = inbox.awaiting_api || [];
      const failed = inbox.failed || [];
      const entries = [...awaiting, ...failed];
      if (!entries.length && !pending.length) {
        content.replaceChildren(el('p', 'dialog-intro', '目前沒有等待整理的內容。'));
        return;
      }
      content.replaceChildren();
      for (const entry of entries) {
        const item = el('article', 'chat-memory');
        item.append(el('small', 'chat-author', entry.reason || '待整理'));
        if (entry.message) item.append(el('p', 'chat-copy', entry.message));
        if (entry.capture?.text) {
          const original = el('details', 'chat-original');
          original.append(el('summary', '', '查看擷取原文'), el('p', '', entry.capture.text));
          item.append(original);
        }
        if (entry.capture?.has_image) item.append(el('p', 'chat-meta', '含有截圖附件'));
        const retry = button('整理這一項', 'text-button', () => {
          dialog.close();
          showChat();
          void retryJob(entry.job_id || entry.id, item);
        });
        retry.disabled = !status.available;
        item.append(retry);
        content.append(item);
      }
      for (const candidate of pending) {
        const item = el('article', 'chat-memory');
        item.append(el('small', 'chat-author', '待釐清'), el('p', 'chat-copy', candidate.title),
          el('p', 'chat-meta', candidate.reason || ''), el('p', 'chat-copy', candidate.source_quote || ''));
        content.append(item);
      }
    } catch (error) {
      content.replaceChildren(el('p', 'form-error', errorText(error)));
    }
  });

  async function start() {
    await refreshStatus();
    try {
      const history = await api('/chat/history');
      conversation = history.conversation_id;
      const seen = new Set(history.messages.filter((entry) => entry.role === 'assistant').map((entry) => entry.job_id));
      let resume;
      for (const entry of history.messages) {
        if (entry.role === 'user') {
          addUser(entry);
          if (waitingStates.has(entry.status)) showWaiting(entry.job_id);
          else if (entry.status === 'failed') showFailure(entry.error, entry.job_id);
          else if (runningStates.has(entry.status) && !seen.has(entry.job_id)) resume = entry.job_id;
        } else if (entry.result) showResult(entry.result, true);
        else message('assistant', entry.content);
      }
      if (resume) void watch(resume);
    } catch (error) {
      receipt('對話紀錄暫時無法載入', errorText(error));
    } finally {
      if (!activeJob) setBusy(false);
    }
  }

  setBusy(true);
  void start();
  window.addEventListener('focus', refreshStatus);
  return { showChat, beginGuided, focus() { showChat(); input.focus(); },
    placeAt(room, locus) {
      placement = { room_id: room.id, locus_id: locus.id };
      placementBadge.replaceChildren(el('span', '', `安放位置 · ${room.name} · ${locus.name}`),
        button('取消指定', 'text-button', () => { placement = null; placementBadge.hidden = true; }));
      placementBadge.hidden = false;
      showChat();
      input.focus();
      beginGuided(`我想把接下來這段記憶放在「${room.name} · ${locus.name}」。請先問我一個小問題，幫我慢慢說出這段記憶。`);
    },
  };
}
