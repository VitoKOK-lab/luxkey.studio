/* 真實 3D 角色：Kenney Mini Characters（CC0，內建 idle／walk／sit／emote 動畫）取代程式拼的人物 */
(() => {
const H = HQ;
if (!THREE.GLTFLoader) return;
const loader = new THREE.GLTFLoader();
const MODELS = {Jo:'character-male-a', Rin:'character-female-a', Mira:'character-female-b', Aria:'character-female-c', Kai:'character-male-b', Mina:'character-female-d', Leo:'character-male-c', Owen:'character-male-d'};
const SCALE = 2.3; // mini characters are ~0.78 tall
const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
/* which clip to play for a state */
H.clipFor = a => {
  if (a.path.length && H.state.speed > 0) return 'walk';
  if (a.swingUntil > performance.now()) return 'interact-right';
  if (a.status === 'deal') return 'emote-yes';
  if (a.status === 'live') return 'interact-right';
  if (a.pose === 'sit') return 'sit';
  if (a.status === 'call' || a.status === 'ai') return 'interact-right';
  return 'idle';
};
H.charBundle = fetch('assets/chars/models.json').then(r => r.json());
/* load any character from the bundle (residents use the extra Kenney people) */
H.loadChar = name => H.charBundle.then(b => new Promise((res, rej) => b[name] ? loader.parse(b64(b[name]), 'assets/chars/', res, rej) : rej('missing ' + name)));
H.charBundle.then(bundle => {
  H.agents.forEach(a => {
    const name = MODELS[a.name]; if (!name || !bundle[name]) return;
    loader.parse(b64(bundle[name]), 'assets/chars/', gltf => {
      const root = gltf.scene; root.scale.setScalar(SCALE);
      root.traverse(o => { if (o.isMesh){ o.castShadow = o.receiveShadow = true; o.frustumCulled = false; o.material = o.material.clone(); o.material.roughness = .8; o.material.envMapIntensity = .25; H.pickables.push(o); o.userData.agent = a.i; } });
      /* swap: hide the procedural body, keep the group (position, tag, ring, blob, hold) */
      const g = a.c.g;
      for (const ch of [...g.children]) if (ch !== a.c.ring && ch !== a.blob && ch !== a.c.hold) ch.visible = false;
      g.add(root);
      const mixer = new THREE.AnimationMixer(root), clips = {};
      gltf.animations.forEach(c => { clips[c.name] = mixer.clipAction(c); });
      const head = root.getObjectByName('head');
      a.rig = {root, mixer, clips, head, cur:null, headY:0};
      a.c.hold.position.set(0, .95, .45);
      H.playClip(a, H.clipFor(a), 0);
    }, e => console.warn('char failed', a.name, e));
  });
});
H.playClip = (a, name, fade = .25) => {
  const r = a.rig; if (!r || !r.clips[name] || r.cur === name) return;
  const next = r.clips[name], prev = r.cur && r.clips[r.cur];
  next.reset().setEffectiveTimeScale(name === 'walk' ? 1.25 : 1).setEffectiveWeight(1);
  if (name === 'emote-yes' || name === 'interact-right'){ next.setLoop(THREE.LoopRepeat, Infinity); }
  next.play();
  if (prev) prev.crossFadeTo(next, fade, false);
  r.cur = name;
};
/* called every frame from agents.js after movement */
H.updateRig = (a, dt, t, walking, sitting) => {
  const r = a.rig; if (!r) return;
  H.playClip(a, H.clipFor(a));
  r.mixer.update(dt * Math.min(2, Math.max(.6, Math.sqrt(H.state.speed || 1))));
  a.c.g.position.y = (a.gy || 0) + (sitting ? -.02 : 0);
  if (r.head){ // look at Ace when he is near, otherwise a slow glance
    const np = H.neon.c.g.position, g = a.c.g, dx = np.x - g.position.x, dz = np.z - g.position.z, nd = Math.hypot(dx, dz);
    let want = H.reduced ? 0 : Math.sin(t * .6 + a.phase) * .25;
    if (nd < 3.2 && !H.neon.path.length && !walking){ let ang = Math.atan2(dx, dz) - g.rotation.y; want = H.clamp(Math.atan2(Math.sin(ang), Math.cos(ang)), -.9, .9); }
    r.headY += (want - r.headY) * Math.min(1, dt * 6);
    r.head.rotation.y += r.headY;
    if (performance.now() < a.talkUntil) r.head.rotation.x += Math.sin(t * 18) * .05;
  }
};
})();
