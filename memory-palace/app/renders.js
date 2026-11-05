const renderIndex = '/assets/renders/index.json';
const floorLabels = new Map([[-1, '庭園與前庭'], [0, '一樓'], [1, '二樓'], [2, '三樓']]);
const hero = document.querySelector('#estate-render');
const groups = document.querySelector('#room-groups');
const status = document.querySelector('#gallery-status');
const retry = document.querySelector('#gallery-retry');
const quality = document.querySelector('#quality');
const qualityRenders = document.querySelector('#quality-renders');
const styleSelect = document.querySelector('#gallery-style');
styleSelect.addEventListener('change', () => {
  document.body.dataset.galleryStyle = styleSelect.value;
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderCard(render, featured = false) {
  const figure = element('figure', 'render-card');
  const link = element('a', 'render-link');
  link.href = render.image;
  link.setAttribute('aria-label', `開啟${render.name}原圖`);
  const arrow = element('span', 'render-arrow', '↗');
  arrow.setAttribute('aria-hidden', 'true');

  const imageWrap = element('div', 'image-wrap');
  const image = element('img', 'image-surface');
  image.alt = `${render.name}的 Blender 渲染`;
  image.width = render.width;
  image.height = render.height;
  image.loading = featured ? 'eager' : 'lazy';
  image.decoding = 'async';
  if (featured) image.fetchPriority = 'high';
  image.addEventListener('error', () => {
    image.style.visibility = 'hidden';
    imageWrap.append(element('span', 'image-fallback', '無法載入這張渲染圖。'));
    link.removeAttribute('href');
    link.removeAttribute('aria-label');
    arrow.hidden = true;
  }, { once: true });
  imageWrap.append(image);

  const caption = element('figcaption', 'render-label');
  const label = element('span', 'render-name', render.name);
  const details = [render.engine, `${render.width} × ${render.height}`];
  if (Number.isInteger(render.samples) && render.samples > 0) details.push(`${render.samples} 樣本`);
  if (render.draft) details.push('草稿');
  label.append(element('small', 'render-meta', details.filter(Boolean).join(' · ')));
  link.append(label, arrow);
  caption.append(link);
  figure.append(imageWrap, caption);
  image.src = render.image;
  return figure;
}

function validRender(render) {
  return render && typeof render.id === 'string' && typeof render.name === 'string' &&
    /^\/assets\/renders\/[a-z0-9-]+\.(?:png|jpe?g|webp)$/i.test(render.image) &&
    Number.isInteger(render.width) && render.width > 0 &&
    Number.isInteger(render.height) && render.height > 0;
}

function renderRooms(renders) {
  const byFloor = new Map();
  for (const render of renders) {
    const floor = floorLabels.has(render.floor) ? render.floor : null;
    if (!byFloor.has(floor)) byFloor.set(floor, []);
    byFloor.get(floor).push(render);
  }
  const sections = [];
  for (const [floor, name] of [...floorLabels, [null, '其他視角']]) {
    const items = byFloor.get(floor);
    if (!items?.length) continue;
    const section = element('section', 'room-group');
    const heading = element('h3', 'floor-heading', name);
    const grid = element('div', 'room-grid');
    grid.append(...items.map((item) => renderCard(item)));
    section.append(heading, grid);
    sections.push(section);
  }
  groups.replaceChildren(...sections);
}

async function loadGallery() {
  retry.hidden = true;
  status.hidden = false;
  status.textContent = '正在載入渲染圖集…';
  try {
    const response = await fetch(renderIndex, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { renders } = await response.json();
    if (!Array.isArray(renders)) throw new Error('Missing render list');
    const entries = renders.filter(validRender);
    const exterior = entries.find(({ id }) => id === 'exterior');
    const studies = entries.filter(({ study }) => study === 'quality');
    const rooms = entries.filter(({ id, study }) => id !== 'exterior' && study !== 'quality');
    qualityRenders.replaceChildren(...studies.map((item) => renderCard(item)));
    quality.hidden = studies.length === 0;
    if (exterior) hero.replaceChildren(renderCard(exterior, true));
    else hero.replaceChildren();
    renderRooms(rooms);
    if (location.hash === '#quality' && !quality.hidden) {
      requestAnimationFrame(() => quality.scrollIntoView({ block: 'start' }));
    }
    status.hidden = rooms.length > 0;
    if (!rooms.length) status.textContent = '空間渲染目前尚未上架。';
  } catch {
    quality.hidden = true;
    hero.replaceChildren();
    status.textContent = '暫時無法載入渲染圖集。你可以重新載入，或先瀏覽佈置物件。';
    retry.hidden = false;
  }
}

const accessory = document.querySelector('#accessory-image');
function showAccessoryError() {
  accessory.hidden = true;
  document.querySelector('#accessory-status').hidden = false;
}
accessory.addEventListener('error', showAccessoryError, { once: true });
if (accessory.complete && !accessory.naturalWidth) showAccessoryError();
retry.addEventListener('click', loadGallery);
loadGallery();
