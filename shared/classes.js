export const DEFAULT_CLASS_ID = 'fighter';
export const ABILITY_SLOTS = 10;

export const CLASSES = [
  {
    id: 'guardian',
    name: 'Guardian',
    role: 'Tank',
    attackRange: 2.0,
    blurb: 'Heavy armor and steady defense.',
  },
  {
    id: 'fighter',
    name: 'Fighter',
    role: 'Melee DPS',
    attackRange: 2.0,
    blurb: 'Balanced frontline damage.',
  },
  {
    id: 'ranger',
    name: 'Ranger',
    role: 'Ranged DPS',
    attackRange: 6.0,
    blurb: 'Quick shots from afar.',
  },
  {
    id: 'priest',
    name: 'Priest',
    role: 'Healer',
    attackRange: 6.0,
    blurb: 'Support magic and healing arts.',
  },
  {
    id: 'mage',
    name: 'Mage',
    role: 'Magic DPS',
    attackRange: 6.0,
    blurb: 'Arcane burst from range.',
  },
];

export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((klass) => [klass.id, klass]));

export function isValidClassId(id) {
  return typeof id === 'string' && Boolean(CLASS_BY_ID[id]);
}

export function getClassById(id) {
  return CLASS_BY_ID[id] ?? CLASS_BY_ID[DEFAULT_CLASS_ID];
}

export function getAbilitiesForClass(classId, level = 1) {
  const klass = getClassById(classId);
  return [
    {
      id: 'basic_attack',
      name: 'Basic Attack',
      slot: 1,
      cooldownMs: 900,
      range: klass.attackRange,
      requiredLevel: 1,
    },
  ];
}
