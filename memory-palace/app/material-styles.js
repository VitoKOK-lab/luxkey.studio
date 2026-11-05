import { Color } from 'three';

// These are the authored names in memory-palace.glb, after stripping Blender's
// numbering. Keep intentionally unrecognized materials (and separate decor) as-is.
const SURFACES = {
  'vein-cut ivory travertine': ['stone', 0xe7ddc9],
  'honed ivory limestone': ['wall', 0xece3d1],
  'dove-gray basalt': ['basalt'],
  'satin pewter': ['frame'],
  'satin champagne bronze': ['trim', 0xc7af89],
  'pearl zinc': ['roof'],
  'natural walnut': ['joinery', 0xac8a6b],
  'pale european oak': ['floor', 0xd1b591],
  'calacatta ivory marble': ['counter', 0xece5d7],
  'solar control glazing': ['glass'],
  'yew foliage': ['foliage'],
  'olive foliage': ['leaf'],
  'cypress foliage': ['foliage'],
  'native grasses': ['leaf'],
  'ground cover': ['foliage'],
  'ash limestone pavers': ['paving'],
  'reflecting pool': ['water'],
  'ivory bouclé': ['linen', 0xeadfc9],
  'lavender rose': ['rose'],
  'mist-blue wool': ['wool'],
  'sage leather': ['leather'],
  'sage velvet': ['leather', 0x96ab8c],
  'leather · burnished saddle piping': ['piping'],
  'linen · warm flax binding and piping': ['linen'],
  'uncoated paper': ['paper'],
  'ceramic porcelain': ['ceramic'],
  'warm concealed light': ['strip'],
  'robot cyan light': ['indicator'],
  'light · woven flax diffuser': ['shade'],
  'light · warm opal glass and cast crystal': ['opal'],
  'raked garden sand': ['sand'],
};

const HALL_MATERIAL_SUFFIX = ' · hall quality';
// Representative sRGB colors for the replacement albedo maps.
const HALL_TEXTURE_COLORS = {
  stone: 0xcfc4b0, wall: 0xddd3bf, basalt: 0x454843, trim: 0xbc9e76,
  joinery: 0x745137, floor: 0xa07955, counter: 0xcfc7b6, wool: 0x4d6562,
};

// [sRGB albedo, roughness factor, metalness factor, emissive sRGB, emissive intensity]
// On surfaces with a roughness texture, the factor multiplies the original map.
// Lamps keep their distinct shades and decorative emitters; task light color is
// controlled independently by the room's authored fixture lights.
const FINISHES = {
  scifi: {
    stone: [0xa8bbc6, .71, .13], wall: [0xe0e8e9, .67, .12], basalt: [0x485a66, .48, .25],
    frame: [0x35424d, .28, .68], trim: [0xb5c8d2, .56, .83], roof: [0x6b7f8b, .32, .70],
    joinery: [0xaebfc6, .55, .24], floor: [0x879aa7, .86, .13], counter: [0xe3eded, .70, .17],
    glass: [0xb9e1ed, .06, .20], water: [0x317c96, .12, .42], paving: [0x9ca9b0, .62, .10],
    wool: [0x39798f, .61, 0], leather: [0x526e7d, .78, 0], linen: [0xc8d8dd, .83, 0],
    piping: [0x354451, .49, .18], ceramic: [0xe0e9ed, .28, .20], paper: [0xd6e0e4, .66, 0],
    strip: [0x72d9f5, .34, .06, 0x69deff, 1.65], indicator: [0x66e2fa, .26, .14, 0x39dcff, 2.5],
    shade: [0xc1d8de, .68, 0, 0xd8f2ff, .38], opal: [0xc4eef5, .28, .10, 0x9aeaff, .88],
  },
  mono: {
    stone: [0xb3b3b3, .90, 0], wall: [0xd4d4d4, .86, 0], basalt: [0x383838, .58, .10],
    frame: [0x323232, .30, .68], trim: [0xbfbfbf, .58, .78], roof: [0x646464, .38, .64],
    joinery: [0x494949, .83, .05], floor: [0xa3a3a3, .95, .06], counter: [0xe1e1e1, .73, .08],
    glass: [0xcdcdcd, .065, .18], water: [0x515151, .15, .44], paving: [0x8c8c8c, .74, 0],
    foliage: [0x525252, .79, 0], leaf: [0x777777, .72, 0], rose: [0xacacac, .71, 0], sand: [0xb4b4b4, .64, 0],
    wool: [0x666666, .76, 0], leather: [0x4f4f4f, .90, 0], linen: [0xd2d2d2, .85, 0],
    piping: [0x353535, .59, 0], ceramic: [0xe0e0e0, .27, .14], paper: [0xcacaca, .66, 0],
    strip: [0xe3e3e3, .50, 0, 0xe3e3e3, 1.38], indicator: [0xe2e2e2, .35, .10, 0xe2e2e2, 1.55],
    shade: [0xcacaca, .76, 0, 0xcfcfcf, .34], opal: [0xdedede, .32, 0, 0xe2e2e2, .82],
  },
  cyberpunk: {
    stone: [0x405269, .79, .08], wall: [0x7a8ba0, .68, .07], basalt: [0x343e52, .54, .21],
    frame: [0x333e54, .27, .57], trim: [0x60748e, .63, .66], roof: [0x4c5571, .31, .52],
    joinery: [0x394556, .76, .18], floor: [0x65778a, .75, .10], counter: [0xa9b2b9, .61, .14],
    glass: [0xa8c5e4, .065, .18], water: [0x297788, .14, .44], paving: [0x7c8793, .68, .10],
    foliage: [0x344f50, .77, 0], leaf: [0x547469, .73, 0], rose: [0xaf597b, .66, 0],
    wool: [0x328c8e, .65, 0], leather: [0x60456e, .86, 0], linen: [0x96a1ad, .87, 0],
    piping: [0x47374e, .46, .10], ceramic: [0xb3c6d4, .23, .14], paper: [0xbac4c4, .66, 0],
    strip: [0xff459f, .36, 0, 0xff1479, 2.15], indicator: [0x41eee0, .29, .10, 0x12ffdc, 2.5],
    shade: [0xe5cfad, .77, 0, 0xffe5bb, .40], opal: [0x57ddcf, .32, .05, 0x21dfc9, 1.35],
  },
  film: {
    stone: [0xba9f76, .89, 0], wall: [0xdfc9a3, .92, 0], basalt: [0x575143, .67, 0],
    frame: [0x544736, .38, .52], trim: [0xc3a06b, .74, .82], roof: [0x635b4d, .44, .52],
    joinery: [0x6d412d, .79, 0], floor: [0x9d714c, .94, 0], counter: [0xe7cba0, .70, 0],
    glass: [0xdfd8c7, .08, .16], water: [0x426f67, .18, .34], paving: [0x9c917b, .75, 0],
    foliage: [0x526447, .73, 0], leaf: [0x80916a, .73, 0], rose: [0x9e5868, .70, 0],
    wool: [0x4f7776, .76, 0], leather: [0x5f6b49, .96, 0], linen: [0xcdb98f, .94, 0],
    piping: [0x65442c, .55, 0], ceramic: [0xdacaa5, .31, .10], paper: [0xd8c49f, .70, 0],
    strip: [0xffdab0, .46, 0, 0xffbd79, 1.45], indicator: [0x6fc9be, .37, .10, 0x70c7ac, 1.35],
    shade: [0xe4bc80, .81, 0, 0xfdd69e, .35], opal: [0xf8cea0, .32, 0, 0xffc77f, .95],
  },
  cartoon: {
    stone: [0xe8b975, .95, 0], wall: [0xffdc9b, 1, 0], basalt: [0x6673a7, .83, 0],
    frame: [0x334369, .72, .08], trim: [0xde953e, 1, .10], roof: [0x355fa1, .73, .03],
    joinery: [0x256e99, 1, .02], floor: [0xe5a05b, 1, 0], counter: [0xffe2af, 1, 0],
    glass: [0x8fd8f5, .17, .10], water: [0x2c96ca, .32, .12], paving: [0xb0a2c7, .88, 0],
    foliage: [0x39893e, .85, 0], leaf: [0x7fb843, .88, 0], rose: [0xe35578, .83, 0], sand: [0xe2b265, .91, 0],
    wool: [0x357ec5, .85, 0], leather: [0x1f927c, 1, 0], linen: [0xf7b463, 1, 0],
    piping: [0x6f446a, .80, 0], ceramic: [0xffcf91, .65, 0], paper: [0xffda99, .86, 0],
    strip: [0xffd376, .65, 0, 0xffc552, 1.1], indicator: [0x48d7eb, .62, 0, 0x44cbf5, 1.25],
    shade: [0xffcb77, .90, 0, 0xffc577, .35], opal: [0xffd895, .65, 0, 0xffcf73, .65],
  },
};

function applyFinish(material, baseline, finish) {
  if (!finish) {
    material.color.copy(baseline.color);
    material.roughness = baseline.roughness;
    material.metalness = baseline.metalness;
    material.emissive.copy(baseline.emissive);
    material.emissiveIntensity = baseline.emissiveIntensity;
    return;
  }
  const [color, roughness, metalness, emissive, emissiveIntensity] = finish;
  material.color.setHex(color);
  if (baseline.textureColor) {
    // The shader multiplies the material color by the original color map in
    // linear space. Offset the map's average hue while keeping its grain,
    // light/dark detail, alpha and all the original UV/normal/PBR textures.
    const average = baseline.textureColor;
    material.color.r /= average.r;
    material.color.g /= average.g;
    material.color.b /= average.b;
  }
  material.roughness = roughness;
  material.metalness = metalness;
  if (emissive === undefined) material.emissive.copy(baseline.emissive);
  else material.emissive.setHex(emissive);
  material.emissiveIntensity = emissiveIntensity ?? baseline.emissiveIntensity;
}

export function createMaterialStyles() {
  const registered = new Map();
  let style = 'original';

  return {
    registerModel(model) {
      model.traverse((object) => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!material?.isMeshStandardMaterial || registered.has(material)) continue;
          const authoredName = material.name.trim().toLowerCase().replace(/^\d+\s*·\s*/, '');
          const hallQuality = authoredName.endsWith(HALL_MATERIAL_SUFFIX);
          const name = hallQuality ? authoredName.slice(0, -HALL_MATERIAL_SUFFIX.length) : authoredName;
          const surface = Object.hasOwn(SURFACES, name) && SURFACES[name];
          if (!surface) continue;
          const [role, estateTextureColor] = surface;
          const textureColor = hallQuality ? HALL_TEXTURE_COLORS[role] ?? estateTextureColor : estateTextureColor;
          const baseline = {
            role,
            textureColor: material.map && textureColor !== undefined ? new Color(textureColor) : null,
            color: material.color.clone(),
            roughness: material.roughness,
            metalness: material.metalness,
            emissive: material.emissive.clone(),
            emissiveIntensity: material.emissiveIntensity,
          };
          registered.set(material, baseline);
          if (style !== 'original') applyFinish(material, baseline, FINISHES[style][role]);
        }
      });
    },
    setStyle(id) {
      if (id !== 'original' && !Object.hasOwn(FINISHES, id)) return false;
      if (style === id) return true;
      style = id;
      for (const [material, baseline] of registered) {
        applyFinish(material, baseline, FINISHES[id]?.[baseline.role]);
      }
      return true;
    },
    dispose() {
      for (const [material, baseline] of registered) applyFinish(material, baseline);
      registered.clear();
      style = 'original';
    },
  };
}
