// Each entry names an actual, locally hosted model. Pending references live in
// docs/character-sources.md and must not appear as selectable costumes.
export const CHARACTER_CATALOG = Object.freeze([
  Object.freeze({
    id: 'quaternius-shiba', label: '柴犬夥伴', species: 'dog',
    url: '/assets/characters/quaternius-shiba.glb',
    creator: 'Quaternius', license: 'CC0-1.0',
    source: 'https://quaternius.com/packs/ultimateanimatedanimals.html',
    animation: Object.freeze({ idle: 'Idle', walk: 'Walk', play: 'Idle_2', clean: 'Idle_2_HeadLow' }),
  }),
  Object.freeze({
    id: 'robot-expressive', label: '表情機器人', species: 'human',
    url: '/assets/characters/robot-expressive.glb',
    creator: 'Tomás Laulhé', license: 'CC0-1.0',
    source: 'https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive',
    animation: Object.freeze({ idle: 'Idle', walk: 'Walking', play: 'Dance', clean: 'Standing' }),
  }),
]);

export function characterById(id) {
  return CHARACTER_CATALOG.find((entry) => entry.id === id) || null;
}
