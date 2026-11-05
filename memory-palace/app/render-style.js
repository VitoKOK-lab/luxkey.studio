import { HalfFloatType, NoBlending, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createMaterialStyles } from './material-styles.js';

export const STYLE_PRESETS = [
  { id: 'original', name: '柔和日光', description: '原有的象牙石、淺木與柔和日光' },
  { id: 'scifi', name: '科幻', description: '珍珠白板材、石墨金屬與冰青燈條' },
  { id: 'mono', name: '黑白', description: '銀灰金屬、石墨木作與鮮明黑白層次' },
  { id: 'cyberpunk', name: '賽博龐克', description: '深藍石墨表面，搭配青色與桃紅霓虹' },
  { id: 'film', name: '復古電影感', description: '深胡桃木、暖黃銅與細微膠片顆粒' },
  { id: 'cartoon', name: '美式卡通感', description: '鮮明的藍橙配色、霧面材質與細緻描邊' },
];

const DAYLIGHT_THEMES = {
  lagoon: { key: 0xfff3df, rim: 0xe4edf0, background: '#cbd7cc' },
  moon: { key: 0xf1efff, rim: 0xdae6f3, background: '#eeeaf5' },
  sunrise: { key: 0xfff0da, rim: 0xf3dce0, background: '#f8eddf' },
};

const LOOKS = {
  original: {
    key: 0xfff3df, keyIntensity: 1.40, rim: 0xe4edf0, rimIntensity: 0.39,
    sky: 0xfff8ec, ground: 0x9fab92, fill: 0.52, environment: 0.32, exposure: 0.78, interiorExposure: 0.68,
    background: '#cbd7cc',
  },
  scifi: {
    key: 0xf6faff, keyIntensity: 1.42, rim: 0xa4d9ee, rimIntensity: 0.46,
    sky: 0xe5eff8, ground: 0x7b8b9b, fill: 0.47, environment: 0.37, exposure: 0.80, interiorExposure: 0.70,
    background: '#c3d5e3',
  },
  mono: {
    effect: 1, key: 0xffffff, keyIntensity: 1.60, rim: 0xf3f3f3, rimIntensity: 0.35,
    sky: 0xf1f1f1, ground: 0x969696, fill: 0.36, environment: 0.32, exposure: 0.78, interiorExposure: 0.70,
    background: '#bcbcbc',
  },
  cyberpunk: {
    // A cool sky and warm architectural key reveal the silhouette, while the
    // authored fixtures supply the color and pools of light inside the estate.
    key: 0xffdfb4, keyIntensity: 0.82, rim: 0x8fb7ed, rimIntensity: 0.57,
    sky: 0x8299b4, ground: 0x334058, fill: 0.34, environment: 0.25, exposure: 0.81, interiorExposure: 0.72,
    background: '#171d2d',
  },
  film: {
    effect: 2, key: 0xffe8c5, keyIntensity: 1.42, rim: 0xf5e8d5, rimIntensity: 0.34,
    sky: 0xf7ead8, ground: 0x817869, fill: 0.39, environment: 0.32, exposure: 0.80, interiorExposure: 0.72,
    background: '#d1c6b5',
  },
  cartoon: {
    effect: 3, key: 0xfff6e9, keyIntensity: 1.30, rim: 0xdfedff, rimIntensity: 0.34,
    sky: 0xf4f8ff, ground: 0x9ba6ae, fill: 0.56, environment: 0.20, exposure: 0.80, interiorExposure: 0.70,
    background: '#cde5f7',
  },
};

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 frameSize;
  uniform int effect;
  uniform bool premultiplyOutput;
  varying vec2 vUv;

  float luma(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  vec4 edgeSignal(vec2 uv) {
    vec4 pixel = texture2D(tDiffuse, uv);
    vec3 rgb = max(pixel.rgb, vec3(0.0));
    return vec4(sqrt(rgb / (1.0 + rgb)), pixel.a);
  }

  float cartoonEdge() {
    vec2 stepX = vec2(1.2 / frameSize.x, 0.0);
    vec2 stepY = vec2(0.0, 1.2 / frameSize.y);
    vec4 dx = edgeSignal(vUv + stepX) - edgeSignal(vUv - stepX);
    vec4 dy = edgeSignal(vUv + stepY) - edgeSignal(vUv - stepY);
    float colorEdge = sqrt(max(dot(dx.rgb, dx.rgb), dot(dy.rgb, dy.rgb)));
    float silhouette = max(abs(dx.a), abs(dy.a));
    return max(smoothstep(0.22, 0.58, colorEdge), 0.72 * smoothstep(0.25, 0.8, silhouette));
  }

  float staticGrain(vec2 pixel) {
    vec3 hash = fract(vec3(pixel.xyx) * 0.1031);
    hash += dot(hash, hash.yzx + 33.33);
    return fract((hash.x + hash.y) * hash.z) - 0.5;
  }

  void main() {
    vec4 sampleColor = texture2D(tDiffuse, vUv);
    if (sampleColor.a < 0.0001) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Blend against the transparent scene target in linear space, then tone-map
    // the recovered RGB once. Restore the canvas's expected alpha convention.
    gl_FragColor = vec4(sampleColor.rgb / sampleColor.a, sampleColor.a);
    if (effect == 1) gl_FragColor.rgb = vec3(luma(gl_FragColor.rgb));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>

    if (effect == 1) {
      gl_FragColor.rgb = vec3(luma(gl_FragColor.rgb));
    } else if (effect == 2) {
      float value = clamp(luma(gl_FragColor.rgb), 0.0, 1.0);
      float grain = staticGrain(floor(gl_FragCoord.xy));
      gl_FragColor.rgb *= 1.0 + grain * 0.11 * sqrt(value) * (1.0 - value);
    } else if (effect == 3) {
      gl_FragColor.rgb *= 1.0 - 0.36 * cartoonEdge();
    }

    gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, 1.0);
    if (premultiplyOutput) gl_FragColor.rgb *= gl_FragColor.a;
  }
`;

export function createRenderStyle({ renderer, scene, camera, viewport, key, rim, hemisphere }) {
  const materials = createMaterialStyles();
  const size = renderer.getSize(new Vector2());
  const frameSize = new Vector2();
  let style = 'original';
  let interior = 0;
  let theme = DAYLIGHT_THEMES.lagoon;
  let composer;
  let composerPixelRatio;
  let finishingPass;
  let activeLook;

  function applyLook() {
    const look = style === 'original' ? { ...LOOKS.original, ...theme } : LOOKS[style];
    activeLook = look;
    key.color.setHex(look.key);
    rim.color.setHex(look.rim);
    hemisphere.color.setHex(look.sky);
    hemisphere.groundColor.setHex(look.ground);
    viewport.style.background = look.background;
    if (finishingPass) finishingPass.uniforms.effect.value = look.effect ?? 0;
    balanceInterior();
  }

  function balanceInterior() {
    // Limit global light indoors so the room fixtures create readable pools of
    // light and the scene retains contrast. Leave enough indirect fill for glass
    // and the dark palettes to stay legible away from task lighting.
    key.intensity = activeLook.keyIntensity * (1 - interior * 0.63);
    rim.intensity = activeLook.rimIntensity * (1 - interior * 0.57);
    hemisphere.intensity = activeLook.fill * (1 - interior * 0.30);
    scene.environmentIntensity = activeLook.environment * (1 - interior * 0.23);
    const roomExposure = activeLook.interiorExposure ?? activeLook.exposure;
    renderer.toneMappingExposure = activeLook.exposure + (roomExposure - activeLook.exposure) * interior;
  }

  function resize(width, height) {
    if (width <= 0 || height <= 0) return;
    size.set(width, height);
    if (!composer) return;
    const pixelRatio = renderer.getPixelRatio();
    if (pixelRatio !== composerPixelRatio) {
      composerPixelRatio = pixelRatio;
      composer.setPixelRatio(pixelRatio);
    }
    composer.setSize(width, height);
    renderer.getDrawingBufferSize(frameSize);
  }

  function setupComposer() {
    const gl = renderer.getContext();
    const hdr = renderer.extensions.has('EXT_color_buffer_float') ||
      renderer.extensions.has('EXT_color_buffer_half_float');
    const supportedSamples = gl.getInternalformatParameter(gl.RENDERBUFFER, hdr ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES);
    const target = new WebGLRenderTarget(size.x, size.y, {
      type: hdr ? HalfFloatType : UnsignedByteType,
      samples: Math.min(2, supportedSamples?.[0] ?? 0),
      resolveDepthBuffer: false,
    });
    composer = new EffectComposer(renderer, target);
    composerPixelRatio = renderer.getPixelRatio();
    finishingPass = new ShaderPass(new ShaderMaterial({
      name: 'EstateRenderStyle',
      uniforms: {
        tDiffuse: { value: null },
        frameSize: { value: frameSize },
        effect: { value: activeLook.effect },
        premultiplyOutput: { value: gl.getContextAttributes()?.premultipliedAlpha ?? true },
      },
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: true,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    }));
    // The finishing pass writes to the canvas, so only one offscreen buffer is used.
    finishingPass.needsSwap = false;
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(finishingPass);
    resize(size.x, size.y);
  }

  function disposeComposer() {
    if (!composer) return;
    finishingPass.dispose();
    composer.dispose();
    finishingPass = undefined;
    composer = undefined;
  }

  viewport.dataset.renderStyle = style;
  applyLook();

  return {
    registerModel: materials.registerModel,
    setInterior(value) {
      const amount = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
      if (interior === amount) return;
      interior = amount;
      balanceInterior();
    },
    setStyle(id) {
      if (!Object.hasOwn(LOOKS, id)) return false;
      if (id === style) return true;
      materials.setStyle(id);
      style = id;
      viewport.dataset.renderStyle = id;
      applyLook();
      if (!activeLook.effect) disposeComposer();
      return true;
    },
    setTheme(id) {
      theme = Object.hasOwn(DAYLIGHT_THEMES, id) ? DAYLIGHT_THEMES[id] : DAYLIGHT_THEMES.lagoon;
      if (style === 'original') applyLook();
    },
    resize,
    render(delta) {
      if (!activeLook.effect) {
        renderer.render(scene, camera);
        return;
      }
      if (!composer) setupComposer();
      composer.render(delta);
    },
    dispose() {
      disposeComposer();
      materials.dispose();
    },
  };
}
