import { installStyleControls } from './style-controls.js';

const THEMES = new Set(['lagoon', 'moon', 'sunrise']);
const SLOTS = new Set(['left', 'right']);

const copy = (value) => JSON.parse(JSON.stringify(value));
const idsOf = (entries) => new Set(entries.map(({ id }) => id));
const renderStyleOf = (design) => design?.render_style === undefined ? 'original' : design.render_style;
const lightingLevelOf = (design) => design?.lighting_level === undefined ? 1 : design.lighting_level;
const appearanceOf = (design) => ({ render_style: renderStyleOf(design), lighting_level: lightingLevelOf(design) });
const copyDesign = (design) => ({ ...copy(design), ...appearanceOf(design) });

function validDesign(design, roomIds, itemIds, styleIds) {
  const lighting = lightingLevelOf(design);
  return design && design.schema_version === 1 && design.architecture_id === 'glass-estate-v2' &&
    typeof design.name === 'string' && design.name.trim().length > 0 && design.name.length <= 60 &&
    THEMES.has(design.theme) && styleIds.has(renderStyleOf(design)) &&
    Number.isFinite(lighting) && lighting >= 0.7 && lighting <= 1.5 &&
    Array.isArray(design.decorations) && design.decorations.length <= 48 &&
    design.decorations.every((decoration) => decoration && roomIds.has(decoration.room_id) &&
      SLOTS.has(decoration.slot) && itemIds.has(decoration.item) &&
      typeof decoration.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(decoration.color));
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function installDecor({ getEstate, manifest, api, toast, selectView }) {
  const opener = document.getElementById('decor-open');
  if (!opener) return { open() {}, close() {} };

  const panel = node('section', 'decor-panel');
  panel.id = 'decor-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'decor-heading');
  panel.hidden = true;

  const header = node('header', 'decor-header');
  const headerCopy = node('div');
  headerCopy.append(node('div', 'decor-kicker', 'PERSONAL SPACE'));
  const heading = node('h2', '', '佈置莊園');
  heading.id = 'decor-heading';
  headerCopy.append(heading);
  const close = node('button', 'decor-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '關閉佈置面板');
  header.append(headerCopy, close);

  const description = node('p', 'decor-description', '莊園共用相同的建築與記憶地址；這裡調整的是你自己的擺設與色彩。佈置內容不會包含記憶。');
  const form = node('div', 'decor-form');
  const nameLabel = node('label', 'decor-field', '莊園名稱');
  const nameInput = node('input');
  nameInput.type = 'text';
  nameInput.maxLength = 60;
  nameInput.autocomplete = 'off';
  nameLabel.append(nameInput);
  const themeLabel = node('label', 'decor-field', '整體色調');
  const themeSelect = node('select');
  themeLabel.append(themeSelect);
  const roomLabel = node('label', 'decor-field', '選擇空間');
  const roomSelect = node('select');
  roomLabel.append(roomSelect);

  const placement = node('div', 'decor-placement');
  const slotLabel = node('label', 'decor-field', '擺放位置');
  const slotSelect = node('select');
  for (const [id, name] of [['left', '左側'], ['right', '右側']]) {
    const option = node('option', '', name);
    option.value = id;
    slotSelect.append(option);
  }
  slotLabel.append(slotSelect);
  const itemLabel = node('label', 'decor-field', '擺設');
  const itemSelect = node('select');
  itemLabel.append(itemSelect);
  const colorLabel = node('label', 'decor-field decor-color-field', '顏色');
  const colorInput = node('input');
  colorInput.type = 'color';
  colorInput.value = '#b9dfd7';
  colorInput.setAttribute('aria-label', '擺設顏色');
  colorLabel.append(colorInput);
  placement.append(slotLabel, itemLabel, colorLabel);

  const status = node('p', 'decor-status');
  status.setAttribute('role', 'status');
  const importedRow = node('div', 'decor-imported');
  importedRow.hidden = true;
  importedRow.append(node('span', '', '匯入內容已預覽，確認後才會儲存。'));
  const applyImport = node('button', 'button primary', '套用佈置');
  applyImport.type = 'button';
  importedRow.append(applyImport);

  const actions = node('div', 'decor-actions');
  const save = node('button', 'button primary', '儲存佈置');
  save.type = 'button';
  const exportLink = node('a', 'button ghost', '匯出已儲存佈置');
  exportLink.href = '/api/design/export';
  exportLink.download = 'memory-palace-design.json';
  const importButton = node('button', 'button ghost', '匯入 JSON');
  importButton.type = 'button';
  const importFile = node('input', 'decor-file');
  importFile.type = 'file';
  importFile.accept = 'application/json,.json';
  importFile.hidden = true;
  actions.append(save, exportLink, importButton, importFile);

  form.append(nameLabel, themeLabel, roomLabel, placement, status, importedRow, actions);
  panel.append(header, description, form);
  document.body.append(panel);

  let catalog, roomIds, itemIds, styleIds;
  let saved = null, draft = null, importing = false, busy = false;
  let rememberedRoom = null;
  const styleControls = installStyleControls({
    getAppearance: () => appearanceOf(draft),
    previewStyle: (style) => getEstate()?.setRenderStyle(style),
    previewLighting: (level) => getEstate()?.setLightingLevel(level),
    async saveAppearance(appearance) {
      // Keep unrelated changes in the current decor draft pending, including imports.
      const changes = Object.entries(appearance).filter(([key, value]) => value !== draft[key]);
      if (!changes.length) return;
      if (changes.some(([key, value]) => value !== saved[key])) {
        await saveDesign({ ...saved, ...Object.fromEntries(changes) });
      }
      for (const [key] of changes) draft[key] = saved[key];
      toast?.('風格與燈光設定已儲存。');
    },
  });

  const setStatus = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };
  const preview = () => {
    if (!draft) return;
    try { getEstate()?.applyDesign(copy(draft)); }
    catch (error) { setStatus(error.message || '無法預覽這項佈置。', true); }
  };
  const currentDecoration = () => draft?.decorations.find((entry) =>
    entry.room_id === roomSelect.value && entry.slot === slotSelect.value);
  const updateSlotControls = () => {
    const decoration = currentDecoration();
    itemSelect.value = decoration?.item || '';
    colorInput.value = decoration?.color || '#b9dfd7';
    if (!panel.hidden) getEstate()?.focusDecoration?.(roomSelect.value, slotSelect.value);
  };
  const rebuildDecorations = (item) => {
    if (!draft) return;
    const room_id = roomSelect.value;
    const slot = slotSelect.value;
    draft.decorations = draft.decorations.filter((entry) => !(entry.room_id === room_id && entry.slot === slot));
    if (item) draft.decorations.push({ room_id, slot, item, color: colorInput.value.toUpperCase() });
    preview();
  };
  const updateDesign = () => {
    if (!draft) return;
    draft.name = nameInput.value;
    draft.theme = themeSelect.value;
    preview();
  };
  const setDraft = (design, fromImport = false) => {
    draft = copyDesign(design);
    nameInput.value = draft.name;
    themeSelect.value = draft.theme;
    importing = fromImport;
    importedRow.hidden = !fromImport;
    setStatus(fromImport ? '已檢查匯入格式；儲存時仍會由本機服務再次驗證。' : '變更會即時預覽。');
    updateSlotControls();
    preview();
  };
  const chooseRoom = () => {
    rememberedRoom = roomSelect.value;
    selectView?.(roomSelect.value);
    updateSlotControls();
  };

  function open() {
    panel.hidden = false;
    panel.classList.add('is-open');
    document.body.classList.add('decorating');
    opener.setAttribute('aria-expanded', 'true');
    if (rememberedRoom && catalog?.rooms.some((room) => room.id === rememberedRoom)) roomSelect.value = rememberedRoom;
    updateSlotControls();
    if (roomSelect.value) {
      selectView?.(roomSelect.value);
      getEstate()?.focusDecoration?.(roomSelect.value, slotSelect.value);
    }
    close.focus();
  }
  function closePanel() {
    if (busy) return;
    if (saved) {
      draft = copy(saved);
      try { getEstate()?.applyDesign(copy(saved)); } catch { /* keep panel closable */ }
      nameInput.value = saved.name;
      themeSelect.value = saved.theme;
      importing = false;
      importedRow.hidden = true;
    }
    panel.classList.remove('is-open');
    document.body.classList.remove('decorating');
    panel.hidden = true;
    opener.setAttribute('aria-expanded', 'false');
    selectView?.(rememberedRoom);
    opener.focus();
  }

  function populate(data) {
    if (!data?.design || !data?.catalog || !Array.isArray(data.catalog.rooms) ||
      !Array.isArray(data.catalog.themes) || !Array.isArray(data.catalog.items) ||
      !Array.isArray(data.catalog.render_styles)) {
      throw new Error('佈置資料格式不完整。');
    }
    catalog = data.catalog;
    roomIds = idsOf(catalog.rooms);
    itemIds = idsOf(catalog.items);
    styleIds = idsOf(catalog.render_styles);
    if (catalog.rooms.some(({ id }) => !manifest?.rooms?.some((room) => room.id === id))) {
      throw new Error('佈置空間與目前莊園場景不相符。');
    }
    roomSelect.replaceChildren(...catalog.rooms.map(({ id, name }) => {
      const option = node('option', '', manifest.rooms.find((room) => room.id === id)?.name || name);
      option.value = id;
      return option;
    }));
    themeSelect.replaceChildren(...catalog.themes.map(({ id, name }) => {
      const option = node('option', '', name);
      option.value = id;
      return option;
    }));
    const emptyItem = node('option', '', '不擺放');
    emptyItem.value = '';
    itemSelect.replaceChildren(emptyItem, ...catalog.items.map(({ id, name }) => {
      const option = node('option', '', name);
      option.value = id;
      return option;
    }));
    if (!validDesign(data.design, roomIds, itemIds, styleIds) || !idsOf(catalog.themes).has(data.design.theme)) {
      throw new Error('佈置內容未通過本機資料檢查。');
    }
    saved = copyDesign(data.design);
    const brandName = document.getElementById('estate-brand-name');
    if (brandName) brandName.textContent = saved.name;
    setDraft(saved);
    roomSelect.value = rememberedRoom && roomIds.has(rememberedRoom) ? rememberedRoom : catalog.rooms[0]?.id || '';
    rememberedRoom = roomSelect.value;
    updateSlotControls();
    setStatus('佈置已載入。');
    styleControls.setOptions(catalog.render_styles);
  }

  function setBusy(blocked) {
    busy = blocked;
    for (const control of [close, save, applyImport, importButton, nameInput, themeSelect,
      roomSelect, slotSelect, itemSelect, colorInput]) control.disabled = blocked;
    styleControls.setBlocked(blocked);
  }

  async function saveDesign(design) {
    if (busy) throw new Error('正在處理佈置，請稍後重試。');
    if (!validDesign(design, roomIds, itemIds, styleIds)) {
      throw new Error('請確認名稱、空間、色調、風格、燈光亮度與擺設資料。');
    }
    setBusy(true);
    try {
      const result = await api('/design', 'POST', { design: copy(design) });
      if (!validDesign(result?.design, roomIds, itemIds, styleIds)) {
        throw new Error('本機服務回傳了無效佈置。');
      }
      saved = copyDesign(result.design);
      const brandName = document.getElementById('estate-brand-name');
      if (brandName) brandName.textContent = saved.name;
    } finally {
      setBusy(false);
    }
  }

  async function persist() {
    if (!draft || busy) return;
    try {
      await saveDesign(draft);
      setDraft(saved);
      setStatus('佈置已儲存。');
      toast?.('佈置已儲存。');
    } catch (error) {
      setStatus(error.message || '無法儲存佈置。', true);
    }
  }

  opener.setAttribute('aria-controls', panel.id);
  opener.setAttribute('aria-expanded', 'false');
  opener.addEventListener('click', open);
  close.addEventListener('click', closePanel);
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    closePanel();
  });
  nameInput.addEventListener('input', updateDesign);
  themeSelect.addEventListener('change', updateDesign);
  roomSelect.addEventListener('change', chooseRoom);
  slotSelect.addEventListener('change', updateSlotControls);
  itemSelect.addEventListener('change', () => rebuildDecorations(itemSelect.value));
  colorInput.addEventListener('input', () => {
    if (!itemSelect.value) return;
    rebuildDecorations(itemSelect.value);
  });
  save.addEventListener('click', () => void persist());
  applyImport.addEventListener('click', () => { if (importing) void persist(); });
  importButton.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file || busy || !saved) return;
    setBusy(true);
    try {
      if (file.size > 65536) throw new Error('佈置檔需小於 64 KB。');
      const incoming = JSON.parse(await file.text());
      const design = incoming?.design || incoming;
      if (!validDesign(design, roomIds, itemIds, styleIds)) {
        throw new Error('檔案格式、色調、風格、燈光亮度、空間或擺設不受支援。');
      }
      setDraft(design, true);
    } catch (error) {
      setStatus(error.message || '無法讀取這個佈置檔。', true);
    } finally {
      setBusy(false);
    }
  });

  api('/design').then(populate).catch((error) => {
    styleControls.setLoadError();
    setStatus(error.message || '無法載入佈置資料。', true);
    save.disabled = true;
    exportLink.setAttribute('aria-disabled', 'true');
    exportLink.addEventListener('click', (event) => event.preventDefault());
  });

  return { open, close: closePanel, getDesign: () => draft && copy(draft) };
}
