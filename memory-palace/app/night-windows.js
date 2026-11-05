// A few of the authored glass panels reveal warm rooms at night. Use the
// existing geometry, so floor slicing and the original glazed silhouette stay
// intact; no screen-space wash or invented openings are needed.
export function createNightWindows(models) {
  const panels = [];
  let ordinal = 0;
  for (const model of models) model.traverse((node) => {
    if (!node.isMesh || !/Full height glass/i.test(node.name)) return;
    const index = ordinal++;
    // Alternating lit and unlit rooms makes the facade read at a distance.
    if (index % 7 !== 1 && index % 7 !== 4) return;
    const original = node.material;
    if (!original?.isMeshStandardMaterial) return;
    const evening = original.clone();
    evening.name = `${original.name} · Warm interior window`;
    evening.color.setHex(index % 2 ? 0xf2cbaa : 0xd8c7b9);
    evening.emissive.setHex(index % 2 ? 0xffc486 : 0xf1d1a7);
    evening.emissiveIntensity = index % 2 ? 0.42 : 0.24;
    evening.transparent = true;
    evening.opacity = Math.max(original.opacity, 0.25);
    evening.depthWrite = false;
    panels.push({ node, original, evening });
  });
  return {
    setStyle(style) {
      const night = style === 'cyberpunk';
      for (const panel of panels) panel.node.material = night ? panel.evening : panel.original;
    },
    dispose() {
      for (const panel of panels) {
        panel.node.material = panel.original;
        panel.evening.dispose();
      }
    },
    count: panels.length,
  };
}
