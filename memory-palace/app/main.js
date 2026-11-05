import { installChat } from './chat.js';
import { installDecor } from './decor.js';
import { installMeditation } from './meditation.js';

const $ = (id) => document.getElementById(id);
const roomInfo = {
  hall: ['迎賓大廳', 0, '日常片段與值得留下的瞬間', [['ledger', '管家的接待簿'], ['lantern', '入口的燈盞'], ['emblem', '大廳的圓形徽記']]],
  library: ['知識書房', 0, '閱讀筆記、知識與學習心得', [['book', '書桌上的書'], ['shelf', '西側書架'], ['chair', '閱讀扶手椅']]],
  gallery: ['人生長廊', 1, '重要的人、旅途與人生片段', [['frame', '第一幅畫框'], ['bench', '畫廊長椅'], ['balcony', '回望陽台']]],
  garden: ['四季花園', -1, '日常靈感與生活感受', [['fountain', '花園噴泉'], ['bench', '花園長椅'], ['rose', '玫瑰花圃']]],
  observatory: ['星光閣', 2, '夢想、計畫與給未來的話', [['globe', '中央的星儀'], ['telescope', '遠望的望遠鏡'], ['desk', '未來的書桌']]],
  'quiet-room': ['靜心室', 1, '沉澱心情與晚間靜心', [['cushion', '靜坐軟墊'], ['bowl', '桌上的缽'], ['window', '安靜的窗邊']]],
};
const districts = {
  hall: ['迎賓區', 'NOA', '迎賓與日常', '#89e2dc'],
  library: ['知識區', 'INDEX', '知識與方法', '#f1c382'],
  gallery: ['人生區', 'MUSE', '人生與關係', '#da9ece'],
  garden: ['花園區', 'FERN', '生活與感官', '#a9db97'],
  observatory: ['遠景區', 'VEGA', '未來與計畫', '#91b6f9'],
  'quiet-room': ['靜心區', 'SOLA', '情緒與沉澱', '#d5cbf7'],
};
let rooms = Object.entries(roomInfo).map(([id, [name, floor, description, loci]]) => ({
  id, name, floor, description, loci: loci.map(([suffix, name]) => ({
    id: `${id === 'quiet-room' ? 'quiet' : id}-${suffix}`, name,
  })),
}));
const roomById = (id) => rooms.find((room) => room.id === id);
const locusName = (memory) => roomById(memory.room_id)?.loci.find(({ id }) => id === memory.locus_id)?.name || memory.locus_id;
const locationName = (memory) => [roomById(memory.room_id)?.name, locusName(memory)].filter(Boolean).join(' · ');

let estate, manifest, roomId = null, floor = null, cutaway = false, archived = false;
let stats = { active: 0, due: 0, rooms: {} };
let activeMemories = [];
let toastTimer, searchTimer, editing, formRevision = 0, listRevision = 0, statsRevision = 0, detailRevision = 0;
let tour = [], tourIndex = 0, tourStep = 0, tourRevision = 0;
const activeDialog = () => document.querySelector('dialog[open]');

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(label, className, action) {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function toast(message) {
  const target = $('toast');
  target.textContent = message;
  target.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => target.classList.remove('visible'), 3500);
}

async function api(path, method = 'GET', payload) {
  const response = await fetch('/api' + path, {
    method,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '暫時無法讀取本機記憶。');
  return result;
}

function messageFor(error) {
  return error instanceof TypeError ? '無法連線至本機記憶庫。' : error.message;
}

function busy(control, action, onError = (error) => toast(messageFor(error))) {
  return async () => {
    if (control.disabled) return;
    control.disabled = true;
    try { await action(); } catch (error) { onError(error); }
    finally { control.disabled = false; }
  };
}

function dialogHeading(kicker, title, dialog) {
  const heading = el('div', 'dialog-heading');
  const text = el('div');
  const h2 = el('h2', '', title);
  h2.id = 'detail-heading';
  text.append(el('div', 'eyebrow', kicker), h2);
  const close = button('×', 'icon-button close-dialog', () => dialog.close());
  close.setAttribute('aria-label', '關閉');
  heading.append(text, close);
  return heading;
}

function renderNavigation() {
  const list = $('room-list');
  const signature = rooms.map(({ id }) => id).join(' ');
  if (list.dataset.rooms !== signature) {
    list.replaceChildren();
    list.dataset.rooms = signature;
    $('room-nav-count').textContent = `${rooms.length} SPACES`;
    for (const [districtId, [name, steward, role, color]] of Object.entries(districts)) {
      const districtRooms = rooms.filter((room) => (room.district_id || room.id) === districtId);
      if (!districtRooms.length) continue;
      const group = el('details', 'district-nav');
      group.dataset.district = districtId;
      const header = el('summary', 'district-summary');
      header.title = role;
      const dot = el('span', 'district-dot');
      dot.style.background = color;
      header.append(dot, el('span', 'district-name', name), el('span', 'district-steward', steward));
      group.append(header);
      for (const room of districtRooms) {
        const item = button('', 'room-button', () => selectView(room.id));
        item.dataset.room = room.id;
        item.append(el('span', 'room-floor', room.floor === -1 ? 'GDN' : `${room.floor + 1}F`),
          el('span', '', room.name), el('span', 'room-count', '0'));
        group.append(item);
      }
      list.append(group);
    }
  }
  for (const item of list.querySelectorAll('.room-button')) {
    const room = roomById(item.dataset.room);
    const selected = room.id === roomId;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', selected);
    item.querySelector('.room-floor').textContent = room.floor === -1 ? 'GDN' : `${room.floor + 1}F`;
    item.querySelector('.room-count').textContent = stats.rooms[room.id] || 0;
  }
  $('overview').classList.toggle('active', !roomId && floor === null);
  $('overview').setAttribute('aria-pressed', !roomId && floor === null);
  document.querySelectorAll('.floor').forEach((item) => {
    const selected = Number(item.dataset.floor) === (roomId ? roomById(roomId).floor : floor);
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', selected);
  });
  $('cutaway').classList.toggle('active', cutaway);
  $('cutaway').setAttribute('aria-pressed', cutaway);
  const room = roomById(roomId);
  const floorName = floor === null ? '' : ['一樓', '二樓', '三樓'][floor];
  $('current-room').textContent = room?.name || floorName || '莊園全景';
  $('current-room-desc').textContent = room?.description ||
    (floorName ? rooms.filter((item) => item.floor === floor).map((item) => item.name).join(' · ')
      : '三層生活空間 · 玻璃與光的記憶容器');
  $('collection-filter').textContent = room?.name || floorName || '所有空間';
}

function moveCamera(immediate = false) {
  if (!estate) return;
  const room = roomById(roomId);
  if (room && estate.getViewMode() === 'human') { estate.enterRoom(room.id); return; }
  let view = room?.camera || manifest.overview;
  if (!room && floor !== null) {
    const floorView = manifest.floors?.find((item) => item.id === floor)?.camera;
    const height = rooms.find((item) => item.floor === floor)?.walk_height ?? 4 * floor + 1;
    view = floorView || { position: [31, height + 18, 42], target: [0, height + 1, 1] };
  }
  setFollow(false, false);
  estate.frameView({ view, room, floor, cutaway }, immediate);
}

function selectView(id = null, level = null) {
  document.body.classList.remove('mobile-rooms-open');
  document.getElementById('mobile-rooms-toggle')?.setAttribute('aria-expanded', 'false');
  roomId = id;
  if (id && $('view-room').options.length) $('view-room').value = id;
  floor = level;
  renderNavigation();
  if (id) {
    const room = roomById(id);
    const group = $('room-list').querySelector(`[data-district="${room?.district_id || id}"]`);
    if (group) group.open = true;
  }
  moveCamera();
  void refreshCollection();
}

function emptyState(title, subtitle = '') {
  const container = el('div', 'empty-state');
  container.append(el('span', 'empty-orbit'), el('p', '', title));
  if (subtitle) container.append(el('small', '', subtitle));
  return container;
}

function renderMemories(memories, list, empty) {
  if (!memories.length) {
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...memories.map((memory) => {
    const card = button('', 'memory-card', () => openDetail(memory.id));
    const status = memory.status === 'archived' ? '已收起' :
      Date.parse(memory.next_review) <= Date.now() ? '可回訪' : '';
    const meta = el('span');
    meta.append(el('span', '', roomById(memory.room_id)?.name || memory.room_id), el('span', '', status));
    card.append(el('strong', '', memory.title), meta);
    return card;
  }));
}

async function refreshCollection() {
  const revision = ++listRevision;
  const search = $('memory-search').value.trim();
  const params = new URLSearchParams({ search, status: archived ? 'archived' : 'active' });
  if (roomId) params.set('room', roomId);
  try {
    let { memories } = await api('/memories?' + params);
    if (revision !== listRevision) return;
    if (floor !== null) memories = memories.filter((memory) => roomById(memory.room_id)?.floor === floor);
    const empty = search ? emptyState('沒有符合的記憶。', '可以試試更短的關鍵字。') :
      archived ? emptyState('這裡沒有已收起的記憶。') :
      roomId || floor !== null ? emptyState('這個空間還沒有記憶。', '點選地標，安放第一段記憶。') :
      emptyState('一座莊園，從一段記憶開始。', '一個瞬間、一種感受，或還沒有想清楚的事。');
    renderMemories(memories, $('memory-list'), empty);
  } catch (error) {
    if (revision === listRevision) $('memory-list').replaceChildren(emptyState(messageFor(error)));
  }
}

async function refreshStats() {
  const revision = ++statsRevision;
  try {
    const [summary, collection] = await Promise.all([api('/stats'), api('/memories')]);
    if (revision !== statsRevision) return;
    stats = summary;
    activeMemories = collection.memories;
    $('memory-count').textContent = stats.active;
    $('due-count').textContent = stats.due;
    renderNavigation();
  } catch (error) {
    if (revision === statsRevision) console.warn('Memory stats:', messageFor(error));
  }
}

function syncVault() {
  void refreshStats();
  void refreshCollection();
}

function fillLoci(selected = '') {
  const room = roomById($('memory-room').value);
  const options = room.loci.map(({ id, name }) => new Option(name, id));
  if (selected && !room.loci.some(({ id }) => id === selected)) {
    options.push(new Option(`原有地標 · ${selected}`, selected));
  }
  $('memory-locus').replaceChildren(...options);
  if (selected) $('memory-locus').value = selected;
}

function openForm({ memory, room, locus } = {}) {
  if ($('memory-dialog').open) return;
  ++detailRevision;
  activeDialog()?.close();
  ++formRevision;
  editing = memory?.id;
  $('memory-form').reset();
  $('form-heading').textContent = memory ? '編輯這段記憶' : '為記憶找個位置';
  $('memory-form').querySelector('[type="submit"]').textContent = memory ? '儲存修改 ↗' : '安放這段記憶 ↗';
  $('form-error').textContent = '';
  $('memory-room').replaceChildren(...rooms.map(({ id, name }) => new Option(name, id)));
  $('memory-room').value = memory?.room_id || room || roomId || rooms.find((item) => item.floor === floor)?.id || 'hall';
  fillLoci(memory?.locus_id || locus);
  if (memory) {
    $('memory-title').value = memory.title;
    $('memory-body').value = memory.body;
    $('memory-cue').value = memory.cue;
    $('memory-tags').value = memory.tags.join('、');
    $('memory-source').value = memory.source;
  }
  $('memory-dialog').showModal();
  $('memory-title').focus();
}

const form = $('memory-form');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  const save = busy(submit, async () => {
    $('form-error').textContent = '';
    const data = Object.fromEntries(new FormData(form));
    data.tags = data.tags.split(/[,，、\n]/).map((tag) => tag.trim()).filter(Boolean);
    if (data.tags.length > 20 || data.tags.some((tag) => [...tag].length > 40)) {
      throw new Error('最多可加 20 個標籤，每個最多 40 個字。');
    }
    if (!editing && !data.source.trim()) delete data.source;
    const id = editing;
    const revision = formRevision;
    const { memory } = await api(id ? `/memories/${id}` : '/memories', id ? 'PATCH' : 'POST', data);
    if (revision === formRevision && $('memory-dialog').open) {
      $('memory-dialog').close();
      if (!id) setArchived(false);
      selectView(memory.room_id);
    } else {
      void refreshCollection();
    }
    void refreshStats();
    toast(id ? '已儲存修改' : `已安放於${roomById(memory.room_id).name}`);
  }, (error) => { $('form-error').textContent = messageFor(error); });
  void save();
});

const dateFormat = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });
const ratings = [['again', '再想一次'], ['good', '記得'], ['easy', '很清楚']];
function reviewButtons(memory, onReviewed, onError) {
  const row = el('div', 'review-actions');
  let submitting = false;
  for (const [rating, label] of ratings) {
    const control = button(label, '', async () => {
      if (submitting) return;
      submitting = true;
      for (const item of row.children) item.disabled = true;
      try {
        const result = await api(`/memories/${memory.id}/review`, 'POST', { rating });
        syncVault();
        onReviewed(result.memory);
      } catch (error) {
        onError(error);
      } finally {
        submitting = false;
        for (const item of row.children) item.disabled = false;
      }
    });
    row.append(control);
  }
  return row;
}

function renderDetail(memory) {
  const dialog = $('detail-dialog');
  const detail = $('detail-content');
  const location = el('p', 'detail-location', locationName(memory));
  const body = el('div', 'detail-body', memory.body);
  const cue = el('div', 'cue-block');
  if (memory.cue) cue.append(el('small', '', '聯想畫面'), el('p', '', memory.cue));
  const tags = el('div', 'tags');
  tags.append(...memory.tags.map((tag) => el('span', 'tag', tag)));
  const isArchived = memory.status === 'archived';
  const meta = el('p', 'detail-meta', [
    memory.source ? `來源 · ${memory.source}` : '',
    isArchived ? '已收起' : `下次回訪 · ${dateFormat.format(new Date(memory.next_review))}`,
  ].filter(Boolean).join('　'));
  const actions = el('div', 'detail-actions');
  const status = el('button', 'text-button', isArchived ? '恢復記憶' : '收起記憶');
  const detailError = el('p', 'form-error');
  const updateStatus = busy(status, async () => {
    const { memory: updated } = await api(`/memories/${memory.id}`, 'PATCH', {
      status: isArchived ? 'active' : 'archived',
    });
    if (dialog.open && detail.contains(status)) {
      renderDetail(updated);
      detail.querySelector('.detail-actions button').focus();
    }
    syncVault();
    toast(isArchived ? '已恢復記憶' : '已收起記憶');
  }, (error) => { detailError.textContent = messageFor(error); });
  status.addEventListener('click', updateStatus);
  actions.append(status, button('編輯記憶', 'button ghost', () => openForm({ memory })));
  detailError.setAttribute('role', 'alert');
  detail.replaceChildren(dialogHeading('MEMORY ARCHIVE', memory.title, dialog), location, body);
  if (memory.cue) detail.append(cue);
  if (memory.tags.length) detail.append(tags);
  detail.append(meta);
  if (memory.source_quote) {
    const original = el('details', 'chat-original detail-original');
    original.append(el('summary', '', '查看來源摘錄'), el('p', '', memory.source_quote));
    detail.append(original);
  }
  detail.append(button('請管家取回這段記憶 ↗', 'button ghost', () => {
    dialog.close();
    walkMemory(memory, 'retrieve');
  }), actions, detailError);
}

async function openDetail(id) {
  const revision = ++detailRevision;
  try {
    const { memory } = await api(`/memories/${id}`);
    if (revision !== detailRevision || activeDialog()) return;
    selectView(memory.room_id);
    renderDetail(memory);
    $('detail-dialog').showModal();
  } catch (error) {
    if (revision === detailRevision) toast(messageFor(error));
  }
}

function openLocus(room, locus) {
  const matches = activeMemories.filter((memory) => memory.room_id === room.id && memory.locus_id === locus.id);
  if (!matches.length) {
    const dialog = $('detail-dialog');
    $('detail-content').replaceChildren(dialogHeading(room.name, locus.name, dialog),
      el('p', 'dialog-intro', '這個地標還空著。先留意它的外形和位置，之後再請管家把記憶安放到房間裡。'),
      button('跟管家走到這裡 ↗', 'button primary', () => {
        dialog.close();
        startWalk(room, [locus], 'route');
      }), button('走到這個地標', 'button ghost', () => { dialog.close(); estate.enterRoom(room.id, locus.id); }),
      button('和管家聊聊，放在這裡', 'button ghost', () => { dialog.close(); chatUI.placeAt(room, locus); }));
    dialog.showModal();
    return;
  }
  if (matches.length === 1) return void openDetail(matches[0].id);
  const dialog = $('detail-dialog');
  const content = $('detail-content');
  const list = el('div', 'locus-list');
  renderMemories(matches, list);
  list.querySelectorAll('.memory-card').forEach((card) => {
    card.addEventListener('click', () => dialog.close(), { capture: true });
  });
  content.replaceChildren(dialogHeading(room.name, locus.name, dialog), list,
    button('跟管家走到這裡 ↗', 'button primary', () => { dialog.close(); startWalk(room, [locus], 'route'); }));
  dialog.showModal();
}

function renderTour() {
  const content = $('tour-content');
  const current = tour[tourIndex];
  if (!current) {
    const complete = tour.length > 0;
    content.replaceChildren(
      el('p', 'tour-prompt', complete ? '今晚的回訪完成了。留點時間給自己，慢慢結束今天。' :
        '目前沒有等待回訪的記憶。你可以安放一段新記憶，或到靜心室坐一會兒。'),
      button('前往靜心室', 'button primary', openMeditation),
    );
    return;
  }
  const count = el('p', 'tour-progress', `回訪 ${tourIndex + 1} / ${tour.length}`);
  const heading = el('h3', 'tour-location', locationName(current));
  content.replaceChildren(count, heading);
  if (tourStep < 2) {
    content.append(el('p', 'tour-prompt', '想像自己站在這個地標前。你想起了什麼？'),
      el('div', 'recall-box', tourStep === 0 ? '先憑地標回想，留一點時間給自己。' :
        current.cue || '先從當時的畫面、聲音或感受開始回想。'),
      button(tourStep === 0 ? '顯示聯想提示' : '揭曉原本的記憶', 'button primary tour-full', () => {
        tourStep += 1;
        renderTour();
        content.querySelector('button')?.focus();
      }));
    return;
  }
  const revision = tourRevision;
  const errorMessage = el('p', 'form-error');
  errorMessage.setAttribute('role', 'alert');
  content.append(el('h3', 'tour-location', current.title),
    el('div', 'detail-body', current.body),
    el('p', 'tour-prompt', '剛才的回想，有多清楚？'),
    reviewButtons(current, () => {
      if (!$('tour-dialog').open || revision !== tourRevision) return;
      tourIndex += 1;
      tourStep = 0;
      if (tour[tourIndex]) selectView(tour[tourIndex].room_id);
      renderTour();
      content.querySelector('button')?.focus();
    }, (error) => { errorMessage.textContent = messageFor(error); }), errorMessage);
}

async function openTour() {
  const { memories } = await api('/memories?due=true');
  if (activeDialog()) return;
  ++tourRevision;
  const order = new Map(rooms.flatMap((room) => room.loci.map((locus) => `${room.id}/${locus.id}`))
    .map((key, index) => [key, index]));
  const routeOrder = (memory) => order.get(`${memory.room_id}/${memory.locus_id}`) ?? Infinity;
  tour = memories.sort((left, right) => routeOrder(left) - routeOrder(right));
  tourIndex = 0;
  tourStep = 0;
  if (tour[0]) selectView(tour[0].room_id);
  renderTour();
  $('tour-dialog').showModal();
}

const meditation = installMeditation({
  dialog: $('meditation-dialog'),
  beforeOpen() {
    ++detailRevision;
    activeDialog()?.close();
    selectView('quiet-room');
    $('meditation-room').textContent = `憶境莊園 · ${roomById('quiet-room').floor + 1}F`;
  },
  focusFallback: $('meditate-open'),
  tourFocusFallback: $('evening-tour'),
});
function openMeditation(event) { meditation.open(event?.currentTarget); }
$('meditate-open').addEventListener('click', openMeditation);
$('overview').addEventListener('click', () => selectView());
document.querySelectorAll('.floor').forEach((item) => {
  item.addEventListener('click', () => selectView(null, Number(item.dataset.floor)));
});
$('cutaway').addEventListener('click', () => {
  cutaway = !cutaway;
  renderNavigation();
  moveCamera();
});
$('panel-toggle').addEventListener('click', () => {
  const collapsed = document.querySelector('.butler-panel').classList.toggle('collapsed');
  $('panel-toggle').textContent = collapsed ? '+' : '−';
  $('panel-toggle').setAttribute('aria-expanded', !collapsed);
});
$('memory-search').addEventListener('input', () => {
  ++listRevision;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refreshCollection, 180);
});
function setArchived(show) {
  archived = show;
  $('show-archived').textContent = archived ? '回到收藏' : '查看收起';
  $('show-archived').setAttribute('aria-pressed', archived);
}
$('show-archived').addEventListener('click', () => {
  setArchived(!archived);
  void refreshCollection();
});
$('export-vault').addEventListener('click', busy($('export-vault'), async () => {
  const vault = await api('/export');
  const url = URL.createObjectURL(new Blob([JSON.stringify(vault, null, 2)], { type: 'application/json' }));
  const link = el('a');
  link.href = url;
  link.download = `memory-palace-${vault.exported_at.slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
$('evening-tour').addEventListener('click', busy($('evening-tour'), openTour));
$('memory-room').addEventListener('change', () => fillLoci());
document.querySelectorAll('dialog .close-dialog').forEach((control) => {
  control.addEventListener('click', () => control.closest('dialog').close());
});

const followButton = $('follow-steward');
const gatherButton = $('gather-stewards');
const releaseButton = $('release-stewards');
const activityButtons = new Map();
let lastStewardStatus = null;
function setFollow(active, sync = true, stewardId) {
  const followed = sync ? estate?.follow(active, stewardId) : active;
  followButton.setAttribute('aria-pressed', Boolean(followed));
  followButton.textContent = followed ? '停止跟隨' : '跟隨視角';
}

function updateDispatch(status) {
  if (status.phase === 'unfollowed') {
    setFollow(false, false);
    return;
  }
  lastStewardStatus = status;
  const following = ['third', 'steward'].includes(estate?.getViewMode());
  const gathering = ['gathering', 'gathered'].includes(status.gatherState);
  const gatheringLabel = status.gatherState === 'gathered' ? '已集合' : `集合中 · ${status.gatheredCount || 0} / ${status.activities?.length || 6} 位已到`;
  $('steward-status').textContent = gathering ? gatheringLabel : status.activeCount ? `${status.activeCount} 位執行記憶行程` : '自由活動中';
  gatherButton.setAttribute('aria-pressed', String(gathering));
  releaseButton.disabled = !estate || !gathering;
  $('dispatch-hud').hidden = !status.activeCount && !following && !gathering;
  $('dispatch-hud').classList.toggle('compact', !status.activeCount && !following);
  if (following) $('view-room').value = status.room?.id || status.id;
  $('dispatch-name').textContent = `${status.name}${status.speciesName ? ' · ' + status.speciesName : ''}${status.room ? ' · ' + status.room.name : ''}${status.locus ? ' · ' + status.locus.name : ''}`;
  const label = {
    outbound: status.kind === 'retrieve' ? '前往取回記憶' : '前往地標',
    locus: { retrieve: '在地標取回記憶', encode: '想像記憶正在和眼前的地標互動', route: '記住地標的形狀和位置' }[status.kind],
    returning: '沿路返回',
    complete: '已走完路線，回到原位',
    idle: '自在休息，可以安排一趟行程',
    activity: { clean: '正在整理環境', play: '正在玩耍', wander: '散步中，停留看看四周' }[status.kind],
    gathering: '正沿步道前來集合',
    gathered: '已抵達集合點，陪你停留',
  }[status.phase];
  const passive = ['wander', 'play', 'clean', 'gather'].includes(status.kind);
  const progressLabel = passive && status.phase === 'outbound' ? '自在散步中' : passive && status.phase === 'returning' ? '沿步道回到原位' : label || '自由活動中';
  $('dispatch-progress').textContent = ['complete', 'idle', 'activity', 'gathered'].includes(status.phase) ? progressLabel :
    `${progressLabel} · 剩餘路程 ${status.remaining || 0} 公尺${status.queued ? ` · 待辦 ${status.queued} 趟` : ''}`;
  $('dispatch-summary').textContent = (gathering ? `${gatheringLabel} · ` : '') +
    (status.activeCount ? `${status.activeCount} 位管家執行記憶行程` : '目前沒有進行中的記憶行程') +
    (status.queuedCount ? ` · 另有 ${status.queuedCount} 趟待辦` : '');
  for (const activity of status.activities || []) {
    let control = activityButtons.get(activity.id);
    if (!control) {
      control = button('', 'steward-activity', () => setFollow(true, true, activity.id));
      control.append(el('b', '', activity.name), el('small'));
      $('dispatch-activities').append(control);
      activityButtons.set(activity.id, control);
    }
    const phase = { idle: '休息中', complete: '已返回', outbound: ['wander', 'play', 'clean'].includes(activity.kind) ? '散步中' : '前往中', returning: '返回中',
      activity: { clean: '整理中', play: '玩耍中', wander: '散步中' }[activity.kind], gathering: '前來集合', gathered: '已集合',
      locus: activity.kind === 'retrieve' ? '取回中' : activity.kind === 'encode' ? '安放中' : '停留中' }[activity.phase] || '自由活動';
    control.querySelector('small').textContent = `${phase}${activity.queued ? ` · 待辦 ${activity.queued}` : ''}`;
    control.setAttribute('aria-label', `跟隨 ${activity.name} · ${phase}${activity.queued ? ` · 待辦 ${activity.queued} 趟` : ''}`);
    control.setAttribute('aria-pressed', String(following && status.id === activity.id));
    control.dataset.working = String(!['idle', 'complete'].includes(activity.phase));
  }
  followButton.disabled = !estate;
}

gatherButton.addEventListener('click', () => {
  if (!estate) return;
  const result = estate.gatherStewards();
  if (result === false) { toast('這個位置目前無法集合，請走到步道或房間內再試。'); return; }
  toast(estate.getViewMode() === 'human' ? '已呼喚六位管家到你附近；有記憶行程的管家會完成後前來。' : '已呼喚六位管家到前庭集合；有記憶行程的管家會完成後前來。');
});
releaseButton.addEventListener('click', () => {
  if (!estate) return;
  estate.releaseStewards();
  toast('管家已恢復自由活動，有待辦的管家會先依序完成行程。');
});

function startWalk(room, loci, kind, done, autoFollow = true) {
  const disposition = estate?.dispatchTo(room, loci, kind, done);
  if (!disposition) {
    if (room) selectView(room.id);
    toast('此地標的步行路線尚未就緒。');
    return false;
  }
  const stewardId = room.district_id || room.id;
  if (disposition === 'queued') toast(`${districts[stewardId]?.[1] || '這位管家'} 已排入自己的待辦行程，會依序出發。`);
  if (autoFollow) setFollow(true, true, stewardId);
  return true;
}

function walkMemory(memory, kind, automatic = false) {
  const room = roomById(memory.room_id);
  const locus = room?.loci.find(({ id }) => id === memory.locus_id);
  if (!locus) {
    if (!automatic) toast('這段記憶的地標目前無法帶路。');
    return;
  }
  startWalk(room, [locus], kind, () => {
    if (kind === 'retrieve') {
      toast(`${room.name}的記憶已取回，可從對話或收藏打開。`);
    } else if (!automatic) {
      toast('在心裡讓記憶畫面和地標互動一次。晚間回訪時，試著靠地標想起它。');
    }
  }, !automatic);
}

followButton.addEventListener('click', () => setFollow(followButton.getAttribute('aria-pressed') !== 'true'));
function updateRouteStops() {
  const room = roomById($('route-room').value);
  $('route-stops').replaceChildren(...(room?.loci || []).map((locus) => el('li', '', locus.name)));
  $('route-start').disabled = !room?.entry_path?.length;
}

function openRoute(id = roomId) {
  const select = $('route-room');
  select.replaceChildren(...rooms.map((room) => new Option(room.name, room.id)));
  select.value = id || rooms[0].id;
  updateRouteStops();
  $('route-dialog').showModal();
}
$('route-open').addEventListener('click', () => openRoute());
$('route-room').addEventListener('change', updateRouteStops);
$('route-start').addEventListener('click', () => {
  const room = roomById($('route-room').value);
  $('route-dialog').close();
  startWalk(room, room.loci, 'route');
});

const chatUI = installChat({
  $, el, button, api, toast, locationName, openDetail, walkMemory, syncVault,
  onView(preferChat) { if (!preferChat) void refreshCollection(); },
  localCommand(message) {
    const command = message.replace(/[\s。！!，,]/gu, '');
    if (/^(?:請)?(?:集合|大家集合|管家集合|全部集合|大家過來|過來集合)$/u.test(command)) {
      if (!estate) toast('管家還在準備，請稍候。');
      else gatherButton.click();
      return true;
    }
    if (/^(?:請)?(?:自由活動|大家自由活動|解散|大家去玩|你們去玩)$/u.test(command)) {
      if (!estate) toast('管家還在準備，請稍候。');
      else { estate.releaseStewards(); toast('管家已恢復自由活動。'); }
      return true;
    }
    if (/^(?:請)?帶我(?:走(?:一遍)?路線|熟悉路線)[。！!]?$/u.test(message)) {
      openRoute();
      return true;
    }
    const match = message.match(/^(?:請)?帶我(?:去|到|走到)([^。！!]+)[。！!]?$/u);
    const room = match && rooms.find((item) => item.name === match[1].trim());
    if (!room) return false;
    openRoute(room.id);
    return true;
  },
});

function updateClock() {
  const now = new Date();
  $('clock').textContent = new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
}

async function startEstate() {
  let failure = '';
  try {
    const response = await fetch('/assets/scene-manifest.json');
    if (!response.ok) throw new Error('場景檔尚未就緒');
    manifest = await response.json();
    rooms = manifest.rooms.map((placement) => {
      const previous = roomById(placement.id);
      const district = districts[placement.district_id || placement.id];
      return {
        ...placement,
        name: previous?.name || placement.name,
        description: previous?.description || placement.description || district?.[2],
        loci: placement.loci.map((locus) => ({
          ...locus, name: previous?.loci.find(({ id }) => id === locus.id)?.name || locus.name,
        })),
      };
    });
    manifest.rooms = rooms;
    renderNavigation();
    const { createEstate } = await import('./scene.js');
    estate = await createEstate({
      viewport: $('viewport'), tooltip: $('locus-tooltip'), manifest,
      isObscured: () => $('meditation-dialog').open,
      describe(room, locus) {
        const count = activeMemories.filter((memory) => memory.locus_id === locus.id).length;
        return `${locus.name} · ${count ? `${count} 段記憶` : '探索地標'}`;
      },
      activate: openLocus,
      onSteward: updateDispatch,
      onViewMode(mode, stewardId) {
        $('view-mode').value = mode;
        gatherButton.textContent = mode === 'human' ? '集合過來' : '集合到前庭';
        $('view-steward').hidden = !['third', 'steward'].includes(mode);
        if (stewardId) $('view-steward').value = stewardId;
        $('view-help').textContent = { overview: '選擇第一視角，走進房間', human: '眼高 160 cm · WASD／方向鍵走動 · 拖曳環顧', third: '穩定跟隨 · 拖曳環顧 ·「熟悉路線」讓管家帶路', steward: '管家的眼睛 · 柔和轉向 · 拖曳環顧' }[mode];
        if (mode !== 'overview') {
          document.querySelector('.butler-panel').classList.add('collapsed');
          $('panel-toggle').setAttribute('aria-expanded', 'false');
          $('panel-toggle').textContent = '+';
        }
        setFollow(mode === 'third' || mode === 'steward', false);
        if (lastStewardStatus) updateDispatch(lastStewardStatus);
      },
      onTalk(id) {
        chatUI.beginGuided(`我想和 ${districts[id]?.[1] || '管家'} 聊聊。請依你的分區，先問我一個容易回答的問題。`);
      },
    });
    gatherButton.disabled = false;
    if (lastStewardStatus) updateDispatch(lastStewardStatus);
    moveCamera(true);
    $('view-room').replaceChildren(...rooms.map((room) => new Option(room.name, room.id)));
    await installDecor({ getEstate: () => estate, manifest, api, toast, selectView });
  } catch (error) {
    failure = '暫時無法開啟三維場景，仍可使用收藏與靜心。';
    console.warn('Memory palace scene:', error);
  } finally {
    $('loading').classList.add('done');
    $('loading').setAttribute('aria-hidden', 'true');
    if (failure) $('scene-hint').textContent = failure;
  }
}

renderNavigation();
$('view-mode').addEventListener('change', () => {
  if ($('view-mode').value === 'overview') selectView();
  else estate?.setViewMode($('view-mode').value, { roomId: $('view-room').value, stewardId: $('view-steward').value });
});
$('view-steward').addEventListener('change', () => estate?.setViewMode($('view-mode').value,
  { stewardId: $('view-steward').value }));
$('view-room').addEventListener('change', () => {
  const id = $('view-room').value;
  if (estate?.getViewMode() === 'human') { roomId = id; renderNavigation(); estate.enterRoom(id); }
  else if (['third', 'steward'].includes(estate?.getViewMode())) openRoute(id);
  else { selectView(id); }
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !activeDialog() && !document.body.classList.contains('decorating') && estate?.getViewMode() !== 'overview') selectView();
});
$('talk-steward').addEventListener('click', () => {
  chatUI.beginGuided(`請陪我聊聊。從我現在所在的「${roomById($('view-room').value)?.name || '莊園'}」開始，問我一個容易回答的小問題。`);
});
const mobileRooms = button('空間', 'control mobile-rooms-toggle', () => {
  const open = document.body.classList.toggle('mobile-rooms-open');
  mobileRooms.setAttribute('aria-expanded', open);
});
mobileRooms.id = 'mobile-rooms-toggle';
mobileRooms.setAttribute('aria-controls', 'room-list');
mobileRooms.setAttribute('aria-expanded', 'false');
document.querySelector('.scene-controls').prepend(mobileRooms);
updateClock();
setInterval(updateClock, 15000);
syncVault();
window.addEventListener('focus', syncVault);
void startEstate();
