/* GLB 家具層：Kenney Furniture Kit / Food Kit（CC0）取代程式生成的家具；載入失敗就保留原本的 */
(() => {
const H = HQ, {scene} = H;
if (!THREE.GLTFLoader){ console.warn('GLTFLoader missing, keeping procedural furniture'); return; }
const loader = new THREE.GLTFLoader(), cache = {};
/* all GLBs ship in one JSON bundle (base64) so the artifact host serves them; textures resolve next to assets/ */
const bundle = fetch('assets/models.json').then(r => r.json());
const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
const load = name => cache[name] || (cache[name] = bundle.then(b => new Promise((res, rej) => { if (!b[name]) return rej('missing'); loader.parse(b64(b[name]), 'assets/', g => res(g.scene), rej); })));
const WOOD = '#c9a27a', WALNUT = '#6b4a2e', TEAL = '#3f7f8c', INK = '#17363c', ORANGE = '#f37021', RUST = '#c9560f', TAN = '#d9b48c', CREAM = '#ece3da';
const PI = Math.PI;
/* [model, x, z, ry, scale, y, tint{materialName:color}, block] — furniture kit is half-scale, food kit is ~2.5× real */
const P = []; H.fans = [];
const add = (m, x, z, ry = 0, s = 2, y = 0, tint = null, blk = null) => P.push({m, x, z, ry, s, y, tint, blk});
/* kitchen island (bar segments + ends), coffee machine, food */
for (let i = 0; i < 5; i++) add('kitchenBar', .28 + i * .86, 1.6, PI, 2, 0, {wood:INK, woodDark:INK, metal:'#f6f1ea'});
add('kitchenBarEnd', -.25, 1.6, PI, 2, 0, {wood:INK, metal:'#f6f1ea'}); add('kitchenBarEnd', 4.25, 1.6, 0, 2, 0, {wood:INK, metal:'#f6f1ea'});
add('kitchenCoffeeMachine', 3.9, 1.55, PI, 1.8, .84, {metalMedium:INK});
add('pizza', .6, 1.45, 0, .5, .85); add('pizza-box', 1.5, 1.4, .3, .5, .85); add('loaf-baguette', 2.6, 1.75, .4, .55, .85); add('cutting-board', 2.55, 1.75, .4, .7, .845);
add('donut', 3.05, 1.45, 0, .9, .85); add('donut-sprinkles', 3.3, 1.45, 0, .9, .85); add('donut-chocolate', 3.55, 1.45, 0, .9, .85);
add('bowl', 1.9, 1.5, 0, .8, .85); add('apple', 1.85, 1.5, 0, .9, .93); add('orange', 2.0, 1.45, 0, .9, .93); add('banana', 1.95, 1.58, .6, .5, .95);
add('cup-coffee', .15, 1.75, 0, .7, .85); add('mug', 1.1, 1.8, PI / 2, .55, .85); add('croissant', 3.9, 1.95, 0, .6, .85); add('cupcake', .9, 1.4, 0, .6, .85); add('muffin', 2.2, 1.35, 0, .6, .85);
for (const x of [.3, 1.4, 2.5, 3.6]) add('stoolBar', x, 2.9, 0, 2, 0, {carpet:ORANGE, wood:INK});
add('kitchenFridge', -1.4, 1.5, PI / 2, 2, 0, {metalLight:'#f6f1ea', metalDark:INK}, [-1.9, 1.0, -.9, 2.0]);
add('trashcan', -1.4, 3.2, 0, 1.4, 0, null, [-1.7, 2.9, -1.1, 3.5]);
/* client lounge (sales) */
add('loungeChair', -9.3, 8.6, PI / 2, 2.2, 0, {carpet:TAN, wood:WALNUT}); add('loungeChair', -6.7, 8.6, -PI / 2, 2.2, 0, {carpet:TAN, wood:WALNUT});
add('tableCoffeeGlass', -8.0, 8.6, PI / 2, 1.9, 0, {metal:INK}); add('cup-coffee', -8.1, 8.5, 0, .6, .5); add('cookie', -7.8, 8.8, 0, .9, .5);
add('rugRound', -8.0, 8.6, 0, 3.4, 0, {carpet:CREAM, carpetDarker:'#d7bea0'});
add('lampRoundFloor', -10.4, 9.8, 0, 2.3, 0, {metal:INK}, [-10.7, 9.5, -10.1, 10.1]);
/* Ace office + meeting */
add('bookcaseClosedWide', 12.3, -10.6, 0, 2.2, 0, {wood:WALNUT}, [11.4, -10.9, 13.2, -10.3]); add('books', 11.9, -10.55, 0, 2, 1.0); add('books', 12.6, -10.55, 0, 2, .25);
add('loungeDesignChair', 14.1, -7.4, -PI / 2, 2, 0, {carpetBlue:TEAL, metal:INK}, [13.6, -8.2, 14.6, -6.6]);
add('sideTable', 14.2, -9.0, -PI / 2, 2, 0, {wood:WALNUT}, [13.9, -9.5, 14.5, -8.5]); add('lampRoundTable', 14.2, -9.0, 0, 2, .76, {metal:INK});
add('plantSmall3', 11.8, -8.0, 0, 1.8, .77, {wood:'#f6f1ea'});
/* production + growth touches */
add('speaker', 5.4, -10.4, 0, 2, 0, {wood:INK, metalMedium:INK}, [5.1, -10.7, 5.7, -10.1]);
add('plantSmall1', -.9, -6.95, 0, 1.6, .78, {wood:'#f6f1ea'}); add('plantSmall2', -8.2, 4.5, 0, 1.6, .78, {wood:'#f6f1ea'});
add('soda-can', 1.0, -6.9, 0, .6, .78); add('cup-coffee', -12.9, -6.1, 0, .6, .78);
/* potted plants (replace procedural) */
for (const [x, z] of [[8.6, 1.2], [-5.6, 9.8], [-5.8, -10.0], [9.6, -10.2], [-14.2, 10.2], [14.4, 10.3], [4.6, -1.4], [14.3, -10.3]]) add('pottedPlant', x, z, Math.random() * PI, 2.5, 0, {wood:'#f6f1ea', woodDark:INK});
/* ceiling: pendant lamps over island and lounge, fans over the floor */
for (const [x, z] of [[.9, 1.6], [3.1, 1.6], [-8.0, 8.6], [12.4, -2.2]]) add('lampSquareCeiling', x, z, 0, 2.2, 2.75, {metal:INK});
for (const [x, z] of [[-10, -2], [3, -5], [-10, 7]]) add('ceilingFan', x, z, 0, 3.2, 3.2, {metalLight:'#f6f1ea', wood:WALNUT});
/* desk + meeting chairs */
for (const c of H.chairSpots) add('chairDesk', c.x, c.z, c.ry, 2, 0, {carpet:c.color === 0xc9560f ? RUST : INK, metalMedium:'#2a3236'});

function tintModel(root, tint){
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    const out = ms.map(m => {
      const name = m.name || '';
      const c = tint && tint[name] !== undefined ? tint[name] : name === 'wood' ? WOOD : null;
      const mm = m.clone(); mm.roughness = .75; mm.metalness = name.startsWith('metal') ? .25 : 0; mm.envMapIntensity = .35;
      if (c) mm.color.set(c);
      if (name === 'lamp'){ mm.emissive.set('#ffe9b0'); mm.emissiveIntensity = .5; }
      return mm;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}
const fit = root => { const b = new THREE.Box3().setFromObject(root); root.position.y -= b.min.y; };
Promise.all(P.map(p => load(p.m).then(src => {
  const g = src.clone(true); tintModel(g, p.tint);
  const w = new THREE.Group(); w.add(g); g.scale.setScalar(p.s); fit(g);
  w.position.set(p.x, p.y, p.z); w.rotation.y = p.ry; scene.add(w); if (p.m === 'ceilingFan') H.fans.push(w);
  if (p.blk) H.block(...p.blk, .1);
}).catch(e => console.warn('asset failed', p.m)))).then(() => {
  scene.remove(H.procGroup);
  H.assetsReady = true; H.emit('assets');
});
})();
