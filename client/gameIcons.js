// @ts-check

export const ITEM_ICON_BY_KIND = /** @type {Record<string, string>} */ ({
  crystal: 'lorc/crystal-ball.svg',
  ore: 'lorc/rock.svg',
  herb: 'lorc/lotus-flower.svg',
  wood: 'lorc/tree-branch.svg',
  flower: 'lorc/spoted-flower.svg',
  weapon_training_sword: 'lorc/broadsword.svg',
  weapon_training_bow: 'lorc/bowman.svg',
  weapon_training_staff: 'lorc/wizard-staff.svg',
  weapon_apprentice_wand: 'lorc/crystal-wand.svg',
  consumable_minor_health_potion: 'lorc/heart-bottle.svg',
  consumable_minor_mana_potion: 'lorc/potion-ball.svg',
  armor_head_cloth: 'lorc/crested-helmet.svg',
  armor_chest_leather: 'lorc/leather-vest.svg',
  armor_legs_cloth: 'lorc/trousers.svg',
  armor_feet_leather: 'lorc/leather-boot.svg',
});

export const EMPTY_EQUIPMENT_ICON_BY_SLOT = /** @type {Record<string, string>} */ ({
  weapon: 'lorc/broadsword.svg',
  offhand: 'lorc/bordered-shield.svg',
  head: 'lorc/crested-helmet.svg',
  chest: 'lorc/leather-vest.svg',
  legs: 'lorc/trousers.svg',
  feet: 'lorc/leather-boot.svg',
});

export const ABILITY_ICON_BY_ID = /** @type {Record<string, string>} */ ({
  shield_slam: 'lorc/shield-bounces.svg',
  defensive_stance: 'lorc/surrounded-shield.svg',
  taunt: 'lorc/targeting.svg',
  shield_wall: 'lorc/riot-shield.svg',
  fortify: 'lorc/crenulated-shield.svg',
  ground_slam: 'lorc/boot-stomp.svg',
  guardians_rebuke: 'lorc/bolt-shield.svg',
  unbreakable: 'lorc/energy-shield.svg',
  power_strike: 'lorc/pointy-sword.svg',
  cleave: 'lorc/sword-slice.svg',
  berserk: 'lorc/bloody-sword.svg',
  whirlwind: 'lorc/sword-spin.svg',
  execute: 'lorc/skull-slices.svg',
  blood_rage: 'lorc/bleeding-heart.svg',
  interrupting_strike: 'lorc/sword-clash.svg',
  avatar_of_war: 'lorc/swords-emblem.svg',
  aimed_shot: 'lorc/target-shot.svg',
  roll_back: 'lorc/return-arrow.svg',
  poison_arrow: 'lorc/chemical-arrow.svg',
  rapid_fire: 'lorc/arrow-cluster.svg',
  snare_trap: 'lorc/wolf-trap.svg',
  mark_target: 'lorc/on-target.svg',
  disengage_shot: 'lorc/winged-arrow.svg',
  eagle_eye: 'lorc/arrow-scope.svg',
  heal: 'lorc/shining-heart.svg',
  smite: 'lorc/justice-star.svg',
  renew: 'lorc/heart-drop.svg',
  cleanse: 'lorc/droplets.svg',
  divine_shield: 'lorc/magic-shield.svg',
  prayer_of_light: 'lorc/book-aura.svg',
  silence: 'lorc/silence.svg',
  salvation: 'lorc/templar-heart.svg',
  firebolt: 'lorc/fireball.svg',
  frost_nova: 'lorc/ice-bomb.svg',
  arcane_missiles: 'lorc/orbital-rays.svg',
  flame_wave: 'lorc/fire-wave.svg',
  ice_barrier: 'lorc/ice-shield.svg',
  blink: 'lorc/orb-direction.svg',
  counterspell: 'lorc/shield-reflect.svg',
  meteor: 'lorc/meteor-impact.svg',
});

function uniqueSortedFiles(/** @type {string[][]} */ collections) {
  const seen = new Set();
  for (const collection of collections) {
    for (const value of collection) {
      if (typeof value === 'string' && value) {
        seen.add(value);
      }
    }
  }
  return Array.from(seen).sort();
}

function resolveBasicAttackIcon(/** @type {any} */ weaponDef) {
  const kind = String(weaponDef?.kind ?? '').toLowerCase();
  if (kind.includes('bow')) return ITEM_ICON_BY_KIND.weapon_training_bow;
  if (kind.includes('wand')) return ITEM_ICON_BY_KIND.weapon_apprentice_wand;
  if (kind.includes('staff')) return ITEM_ICON_BY_KIND.weapon_training_staff;
  return ITEM_ICON_BY_KIND.weapon_training_sword;
}

export function getAbilityIconFile(/** @type {any} */ ability, /** @type {any} */ weaponDef) {
  if (!ability?.id) return null;
  if (ability.id === 'basic_attack') {
    return resolveBasicAttackIcon(weaponDef);
  }
  return ABILITY_ICON_BY_ID[ability.id] ?? null;
}

export function getItemIconFile(/** @type {any} */ kind) {
  if (!kind) return null;
  return ITEM_ICON_BY_KIND[kind] ?? null;
}

export function getEquipmentSlotIconFile(/** @type {any} */ slot) {
  if (!slot) return null;
  return EMPTY_EQUIPMENT_ICON_BY_SLOT[slot] ?? null;
}

export function getGameIconUrl(/** @type {any} */ file) {
  if (!file) return '';
  return `/assets/ui/icons/game-icons/${String(file).replace(/^\/+/, '')}`;
}

export function formatGameIconLabel(/** @type {any} */ file) {
  const base = String(file ?? '')
    .split('/')
    .pop()
    ?.replace(/\.svg$/i, '') ?? '';
  if (!base) return 'Icon';
  return base
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const USED_ICON_FILES = uniqueSortedFiles([
  Object.values(ITEM_ICON_BY_KIND),
  Object.values(EMPTY_EQUIPMENT_ICON_BY_SLOT),
  Object.values(ABILITY_ICON_BY_ID),
]);

export const GAME_ICON_CREDITS = {
  authorName: 'Lorc',
  authorUrl: 'http://lorcblog.blogspot.com',
  statement: 'Icons made by Lorc',
  sourceName: 'game-icons.net',
  sourceUrl: 'https://game-icons.net',
  licenseName: 'CC BY 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  usedFiles: USED_ICON_FILES,
};
