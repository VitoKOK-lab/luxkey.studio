const TAU = Math.PI * 2;
const FRAME_MS = 1000 / 30;
const PALETTES = {
  tide: { shore: '#7f9e8e', mid: '#376659', deep: '#153b33', edge: '#214d43', glint: '253,223,157' },
  ripple: { shore: '#829e90', mid: '#37665e', deep: '#173c39', edge: '#245048', glint: '232,222,167' },
  light: { shore: '#8ba291', mid: '#3c6c60', deep: '#123c3b', edge: '#21524a', glint: '255,220,139' },
};

const clamp = (value, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value));
const smooth = (from, to, value) => {
  const q = clamp((value - from) / (to - from));
  return q * q * (3 - 2 * q);
};
const alpha = (rgb, amount) => `rgba(${rgb},${clamp(amount)})`;

function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const random = randomSource(15487);
const flecks = Array.from({ length: 275 }, () => ({
  x: random(), z: random(), length: random(), gleam: random(), seed: random() * TAU,
}));

function stops(gradient, colors) {
  for (const [offset, color] of colors) gradient.addColorStop(offset, color);
  return gradient;
}

// Static wash and shoreline stay on a separate canvas so they need no per-frame path work.
function paintLandscape(ctx, view, mode) {
  const { w, h, horizon, sunX, sunY, sunR } = view;
  const palette = PALETTES[mode];
  ctx.fillStyle = stops(ctx.createLinearGradient(0, 0, w * .18, horizon), [
    [0, '#e9ebdf'], [.50, '#f4ebd5'], [.88, '#f8e6bb'], [1, '#ecd8ad'],
  ]);
  ctx.fillRect(0, 0, w, h);

  const halo = Math.min(w * .44, h * .44);
  ctx.fillStyle = stops(ctx.createRadialGradient(sunX, sunY, sunR * .5, sunX, sunY, halo), [
    [0, '#fff3cb'], [.22, 'rgba(255,233,178,.58)'], [.66, 'rgba(255,231,174,.18)'], [1, 'rgba(255,231,174,0)'],
  ]);
  ctx.fillRect(0, 0, w, horizon);

  // Wisps of light above a small, unchanging sun.
  for (const [x, y, length, opacity] of [[.1, .49, .5, .42], [.41, .70, .52, .6], [.69, .83, .34, .48], [-.07, .89, .35, .35]]) {
    const left = x * w, span = length * w;
    ctx.fillStyle = stops(ctx.createLinearGradient(left, 0, left + span, 0), [
      [0, alpha('255,249,224', 0)], [.37, alpha('255,249,224', opacity)], [1, alpha('255,249,224', 0)],
    ]);
    ctx.beginPath();
    ctx.moveTo(left, horizon * y + 2);
    ctx.bezierCurveTo(left + span * .24, horizon * y - 3, left + span * .77, horizon * y - 4, left + span, horizon * y);
    ctx.quadraticCurveTo(left + span * .54, horizon * y + 4, left, horizon * y + 2);
    ctx.fill();
  }
  ctx.fillStyle = stops(ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR), [
    [0, '#fff9dd'], [.62, '#ffe8ad'], [1, '#e8be78'],
  ]);
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,250,225,.57)';
  ctx.lineWidth = .65;
  ctx.stroke();

  const hillRise = Math.min(h * .16, w * .19);
  function shore(color, start, curves) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(start[0] * w, horizon - start[1] * hillRise);
    for (const [a, b, c, d, e, f] of curves) {
      ctx.bezierCurveTo(a * w, horizon - b * hillRise, c * w, horizon - d * hillRise, e * w, horizon - f * hillRise);
    }
    ctx.lineTo(w, horizon + 3);
    ctx.lineTo(0, horizon + 3);
    ctx.fill();
  }
  shore('rgba(143,153,128,.29)', [0, .63], [
    [.065, .87, .13, .46, .198, .40], [.239, .36, .252, .37, .294, .23], [.342, .08, .404, -.01, .473, 0],
    [.56, 0, .635, .00, .697, .145], [.77, .32, .80, .55, .86, .39], [.91, .25, .96, .45, 1, .51],
  ]);
  shore('rgba(112,141,124,.42)', [0, .36], [
    [.087, .74, .139, .35, .207, .27], [.256, .17, .307, .045, .4, .013], [.52, 0, .60, .01, .698, .026],
    [.79, .09, .84, .29, .912, .37], [.946, .42, .976, .34, 1, .27],
  ]);
  shore('rgba(80,122,106,.4)', [0, .195], [
    [.064, .24, .103, .22, .156, .13], [.237, .026, .271, .004, .382, 0],
    [.52, -.015, .67, -.008, .76, .023], [.87, .044, .91, .20, 1, .225],
  ]);

  ctx.fillStyle = stops(ctx.createLinearGradient(0, horizon, 0, h), [
    [0, palette.shore], [.08, '#608b79'], [.245, palette.mid], [.77, palette.edge], [1, palette.deep],
  ]);
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.fillStyle = stops(ctx.createLinearGradient(0, 0, w, 0), [
    [0, 'rgba(17,54,49,.20)'], [.35, 'rgba(17,54,49,0)'], [.69, 'rgba(170,174,112,.035)'], [1, 'rgba(19,53,44,.23)'],
  ]);
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.fillStyle = stops(ctx.createLinearGradient(0, 0, w, 0), [
    [0, 'rgba(249,231,178,.18)'], [.43, 'rgba(255,236,180,.52)'], [.65, 'rgba(255,236,180,.54)'], [1, 'rgba(249,231,178,.13)'],
  ]);
  ctx.fillRect(0, horizon - .35, w, .85);
}

function waterY(view, x, z, t, breath, mode) {
  const { horizon, water, aspect } = view;
  const spread = mode === 'ripple' ? .47 : mode === 'light' ? .69 : 1;
  const wave = (x - .5) * (4.25 + aspect * 1.8);
  const a = Math.pow(z, .88) * water * (.058 + .014 * breath) * spread;
  return horizon + water * z + a * (
    .67 * Math.sin(wave + z * 5.6 - t * .205) +
    .29 * Math.sin(wave * 1.67 - z * 8.7 + t * .161) +
    .21 * Math.cos(wave * .57 - z * 7.2 + t * .114)
  );
}

function waterPath(ctx, view, from, to, z, t, breath, mode) {
  const count = Math.max(3, Math.ceil((to - from) * 52));
  ctx.beginPath();
  ctx.moveTo(from * view.w, waterY(view, from, z, t, breath, mode));
  for (let i = 1; i <= count; i++) {
    const x = from + (to - from) * i / count;
    ctx.lineTo(x * view.w, waterY(view, x, z, t, breath, mode));
  }
}

function paintTide(ctx, view, mode, t, breath) {
  const { w, h, horizon, water } = view;
  const strength = mode === 'tide' ? 1 : .55;
  const darks = ['24,68,63', '25,72,63', '17,58,51', '25,61,55'];
  const greens = ['140,182,145', '134,176,149', '149,182,149', '123,165,136'];
  const depths = [.032, .068, .115, .174, .243, .338, .453, .601, .762, .934];

  // Each translucent fold has a bright crest and fades into the darker trough below it.
  for (let i = 0; i < depths.length; i++) {
    const z = depths[i];
    const y = horizon + z * water;
    const feather = water * (.034 + .19 * z);
    const lift = water * (.006 + .047 * z);
    ctx.fillStyle = stops(ctx.createLinearGradient(0, y - lift, 0, y + feather), [
      [0, alpha(greens[i % greens.length], .24 * strength)],
      [.31, alpha(greens[i % greens.length], .17 * strength)],
      [.62, alpha(darks[i % darks.length], .16 * strength)],
      [1, alpha(darks[i % darks.length], 0)],
    ]);
    waterPath(ctx, view, -.01, 1.01, z, t, breath, mode);
    ctx.lineTo(w * 1.01, h);
    ctx.lineTo(-w * .01, h);
    ctx.fill();

    const center = .5 + .20 * Math.sin(i * 2.24 + t * .13);
    ctx.strokeStyle = stops(ctx.createLinearGradient(0, 0, w, 0), [
      [0, 'rgba(181,212,170,0)'], [Math.max(.04, center - .26), 'rgba(181,212,170,0)'],
      [center, alpha('190,214,173', .29 * strength)], [Math.min(.96, center + .27), 'rgba(181,212,170,0)'],
      [1, 'rgba(181,212,170,0)'],
    ]);
    ctx.lineWidth = .55 + .64 * z;
    waterPath(ctx, view, 0, 1, z, t, breath, mode);
    ctx.stroke();
  }
}

function paintReflection(ctx, view, mode, t, breath) {
  const { w, horizon, water, sunX } = view;
  const color = PALETTES[mode].glint;
  const isLight = mode === 'light';
  const xCenter = sunX / w;
  const spread = Math.min(w * .33, water * (isLight ? .49 : .24));
  const movingX = sunX + spread * .12 * Math.sin(t * .21);
  ctx.save();
  ctx.translate(movingX, horizon);
  ctx.scale(spread, water * (isLight ? .73 : .40));
  ctx.fillStyle = stops(ctx.createRadialGradient(0, 0, 0, 0, 0, 1), [
    [0, alpha(color, isLight ? .39 : .26)], [.28, alpha(color, isLight ? .17 : .11)], [.70, alpha(color, .031)], [1, alpha(color, 0)],
  ]);
  ctx.fillRect(-1, 0, 2, 1);
  ctx.restore();

  // Broken specular marks broaden toward the viewer. Their edges fade before each other.
  const bands = isLight ? 85 : 52;
  for (let i = 0; i < bands; i++) {
    const q = i / bands;
    const z = .006 + Math.pow(q, 1.86) * (isLight ? .89 : .59);
    const width = (.012 + .169 * q) * (isLight ? 1.24 : .84);
    const ripple = Math.sin(i * 1.53 + t * .41) * (.002 + .039 * q);
    const x = xCenter + ripple + Math.sin(q * 8.4 - t * .31) * width * .27;
    const pulse = .45 + .55 * (.5 + .5 * Math.cos(i * 2.019 + t * .58));
    const length = width * (.26 + .74 * pulse) * (1 + .17 * breath);
    const from = x - length, to = x + length;
    const glow = (isLight ? .46 : .34) * (1 - q * .82) * pulse;
    const shade = stops(ctx.createLinearGradient(from * w, 0, to * w, 0), [
      [0, alpha(color, 0)], [.35, alpha(color, glow * .67)], [.54, alpha(color, glow)], [1, alpha(color, 0)],
    ]);
    ctx.strokeStyle = shade;
    ctx.lineWidth = .50 + (isLight ? 1.52 : .96) * q;
    waterPath(ctx, view, from, to, z, t, breath, mode);
    ctx.stroke();

    if (isLight && i % 2 === 0) {
      for (const direction of [-1, 1]) {
        const offset = direction * (.092 + q * .13) + Math.sin(t * .23 + q * 9.6) * .021;
        const side = xCenter + offset;
        const r = length * (.43 + .17 * direction);
        ctx.strokeStyle = stops(ctx.createLinearGradient((side - r) * w, 0, (side + r) * w, 0), [
          [0, alpha(color, 0)], [.48, alpha(color, glow * .49)], [1, alpha(color, 0)],
        ]);
        waterPath(ctx, view, side - r, side + r, z + .006, t, breath, mode);
        ctx.stroke();
      }
    }
  }
}

function paintRipple(ctx, view, t, breath) {
  const { w, h, water, horizon } = view;
  const centerX = w * .5 + w * .017 * Math.sin(t * .11);
  const centerY = horizon + water * .414;
  const radius = Math.max(w * .37, h * .39);
  for (let i = 0; i < 9; i++) {
    const phase = (t / 25 + i / 9) % 1;
    const envelope = smooth(.02, .20, phase) * (1 - smooth(.70, 1, phase));
    const a = radius * (.035 + phase * .91) * (1 + breath * .026);
    const b = Math.min(w, h) * (.011 + phase * .189);
    const shine = .72 + .28 * Math.cos(i * 1.3 - t * .13);
    const color = i % 3 === 0 ? '252,221,151' : '177,214,182';
    const y = centerY + phase * phase * water * .155;
    for (const [start, end, opacity] of [[.04, Math.PI * .96, .51], [Math.PI * 1.16, TAU * .98, .27]]) {
      const gradient = stops(ctx.createLinearGradient(centerX - a, 0, centerX + a, 0), [
        [0, alpha(color, .013 * envelope)], [.32, alpha(color, opacity * envelope * shine)],
        [.72, alpha(color, opacity * envelope * .54)], [1, alpha(color, .022 * envelope)],
      ]);
      ctx.beginPath();
      for (let j = 0; j <= 48; j++) {
        const angle = start + j * (end - start) / 48;
        const lean = 1 + .026 * Math.sin(angle * 3 - t * .24 + i) + .018 * Math.cos(angle * 7 + t * .19);
        const x = centerX + Math.cos(angle) * a * lean;
        const wy = y + Math.sin(angle) * b * lean + Math.sin(angle * 2 + t * .13) * phase * 2.4;
        if (j === 0) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.strokeStyle = gradient;
      ctx.lineWidth = .71 + phase * 1.35;
      ctx.stroke();
    }
  }
}

function paintFlecks(ctx, view, mode, t, breath) {
  const { w, sunX } = view;
  const palette = PALETTES[mode];
  for (const mark of flecks) {
    const z = Math.pow(mark.z, 1.91) * .98;
    const x = mark.x + .015 * (z + .16) * Math.sin(t * .24 + mark.seed);
    const length = (.0005 + z * .014) * (.27 + mark.length * .89);
    const sunlit = Math.exp(-Math.pow((x - sunX / w) / (.07 + .20 * z), 2));
    const shimmer = .72 + .28 * Math.sin(t * .49 + mark.seed);
    const brightness = (.035 + .119 * mark.gleam + .128 * sunlit) * shimmer;
    const color = mark.gleam > .42 ? palette.glint : '191,223,199';
    ctx.strokeStyle = alpha(color, brightness);
    ctx.lineWidth = .45 + .79 * z * mark.length;
    const y = waterY(view, x, z, t, breath, mode);
    ctx.beginPath();
    ctx.moveTo((x - length * .5) * w, y);
    ctx.quadraticCurveTo(x * w, y - .45 - z * .85, (x + length * .5) * w, y + (mark.seed - 3) * z * .53);
    ctx.stroke();
  }
}

function grainPattern(ctx, doc) {
  const tile = doc.createElement('canvas');
  const size = tile.width = tile.height = 160;
  const texture = tile.getContext('2d');
  if (!texture) return null;
  const pixels = texture.createImageData(size, size);
  const rng = randomSource(32487);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = rng() > .5 ? 255 : 0;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = rng() * 4;
  }
  texture.putImageData(pixels, 0, 0);
  return ctx.createPattern(tile, 'repeat');
}

export function createMeditationWater(canvas) {
  const ctx = canvas?.getContext('2d', { alpha: false });
  if (!ctx) {
    const noop = () => {};
    return { setMode: noop, setActive: noop, setPaused: noop, setReducedMotion: noop, setBreath: noop, destroy: noop };
  }
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  const backdrop = doc.createElement('canvas');
  const sky = backdrop.getContext('2d', { alpha: false });
  const grain = grainPattern(ctx, doc);
  let mode = 'tide', active = false, paused = false, reduced = false, destroyed = false;
  let view, frame = 0, lastFrame = null, time = 4.4, breath = 0, breathTarget = 0;

  function rebuildBackdrop() {
    if (!sky || !view) return;
    backdrop.width = canvas.width;
    backdrop.height = canvas.height;
    sky.setTransform(view.scaleX, 0, 0, view.scaleY, 0, 0);
    paintLandscape(sky, view, mode);
  }

  function draw() {
    if (!view || !active || doc.hidden || destroyed) return;
    const { w, h, scaleX, scaleY, horizon } = view;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    if (sky) ctx.drawImage(backdrop, 0, 0, w, h);
    else paintLandscape(ctx, view, mode);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, w, h - horizon);
    ctx.clip();
    ctx.lineCap = 'round';
    paintTide(ctx, view, mode, time, breath);
    paintReflection(ctx, view, mode, time, breath);
    if (mode === 'ripple') paintRipple(ctx, view, time, breath);
    paintFlecks(ctx, view, mode, time, breath);
    ctx.restore();
    if (grain) {
      ctx.fillStyle = grain;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function resize() {
    if (!active || destroyed) return;
    const { width: w, height: h } = canvas.getBoundingClientRect();
    if (w < 2 || h < 2) return;
    const dpr = Math.min(win.devicePixelRatio || 1, w < 640 ? 1.5 : 2, Math.sqrt(3300000 / (w * h)));
    const bw = Math.max(1, Math.round(w * dpr)), bh = Math.max(1, Math.round(h * dpr));
    if (view?.w === w && view.h === h && canvas.width === bw && canvas.height === bh) return;
    canvas.width = bw;
    canvas.height = bh;
    const horizon = h * (w / h < .8 ? .343 : .365);
    const sunR = clamp(Math.min(w, h) * .0275, 10, 29);
    view = {
      w, h, scaleX: bw / w, scaleY: bh / h, horizon, water: h - horizon,
      aspect: clamp(w / h, .5, 2), sunX: w * .586, sunY: horizon * .683, sunR,
    };
    rebuildBackdrop();
    draw();
    return true;
  }

  const shouldAnimate = () => active && !paused && !reduced && !doc.hidden && !destroyed;

  function tick(now) {
    frame = 0;
    if (!shouldAnimate()) return;
    if (lastFrame === null) lastFrame = now;
    const delta = now - lastFrame;
    if (delta >= FRAME_MS - 1) {
      const seconds = Math.min(delta, 64) / 1000;
      lastFrame = now;
      time += seconds;
      breath += (breathTarget - breath) * (1 - Math.exp(-seconds * 2.7));
      draw();
    }
    frame = win.requestAnimationFrame(tick);
  }

  function sync() {
    if (shouldAnimate()) {
      if (!frame) frame = win.requestAnimationFrame(tick);
    } else {
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = null;
    }
  }

  function visibilityChanged() {
    if (!doc.hidden && !resize()) draw();
    sync();
  }

  const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
  observer?.observe(canvas);
  win.addEventListener('resize', resize);
  doc.addEventListener('visibilitychange', visibilityChanged);

  return {
    setMode(next) {
      if (!Object.hasOwn(PALETTES, next) || mode === next || destroyed) return;
      mode = next;
      rebuildBackdrop();
      draw();
    },
    setActive(next) {
      if (active === Boolean(next) || destroyed) return;
      active = Boolean(next);
      if (active && !resize()) draw();
      sync();
    },
    setPaused(next) {
      paused = Boolean(next);
      sync();
    },
    setReducedMotion(next) {
      reduced = Boolean(next);
      sync();
    },
    setBreath({ phase, running } = {}) {
      const progress = clamp(Number.isFinite(phase) ? phase : 0);
      breathTarget = running ? smooth(0, .40, progress) * (1 - smooth(.43, .94, progress)) : 0;
    },
    destroy() {
      destroyed = true;
      sync();
      observer?.disconnect();
      win.removeEventListener('resize', resize);
      doc.removeEventListener('visibilitychange', visibilityChanged);
      backdrop.width = backdrop.height = 0;
    },
  };
}
