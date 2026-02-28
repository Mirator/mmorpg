// @ts-check
import { getResourceForClass } from './classes.js';

const PALETTE_HEX = /** @type {Record<string, [string, string]>} */ ({
  fire: ['#ff6633', '#ffb066'],
  frost: ['#88ccff', '#d8f1ff'],
  arcane: ['#aa66ff', '#d8b5ff'],
  nature: ['#66cc44', '#b8f07a'],
  holy: ['#ffdd66', '#fff1b2'],
  guardian: ['#8b7355', '#d1b896'],
  physical: ['#ffe2a8', '#fff2cf'],
  mobility: ['#9fe3ff', '#d8f8ff'],
});

const ABILITY_SUMMARY_BY_ID = /** @type {Record<string, string>} */ ({
  shield_slam: 'Bash your target with a shield strike that stuns on hit.',
  defensive_stance: 'Brace yourself to reduce damage taken at the cost of movement speed.',
  taunt: 'Force a nearby mob to focus its attacks on you.',
  shield_wall: 'Raise a wall of defense to heavily reduce incoming damage.',
  fortify: 'Bolster yourself with bonus maximum health for a short time.',
  ground_slam: 'Smash the ground to damage and slow enemies around you.',
  guardians_rebuke: 'Strike your target and interrupt their casting.',
  unbreakable: 'Become immune to crowd control for a short burst.',
  power_strike: 'Deliver a heavy hit that grows stronger when your rage is high.',
  cleave: 'Swing through enemies in front of you with a wide arc.',
  berserk: 'Fly into a fury that boosts your damage for a short time.',
  whirlwind: 'Spin in place to hit all nearby enemies.',
  execute: 'Finish weakened enemies with bonus damage below the health threshold.',
  blood_rage: 'Consume all current rage to power up your damage buff.',
  interrupting_strike: 'Hit your target and lock out their casting.',
  avatar_of_war: 'Channel battle fury to raise your physical power.',
  aimed_shot: 'Line up a powerful ranged shot with a brief wind-up.',
  roll_back: 'Leap backward to reposition and shrug off slows briefly.',
  poison_arrow: 'Poison your target with damage over time and a slow.',
  rapid_fire: 'Channel a quick burst of ranged shots into one target.',
  snare_trap: 'Place a trap that damages and roots enemies in its area.',
  mark_target: 'Expose a target so it takes extra damage.',
  disengage_shot: 'Fire a shot that knocks the target away from you.',
  eagle_eye: 'Sharpen your aim to increase critical strike chance.',
  heal: 'Restore health to yourself or an ally.',
  smite: 'Blast a target with holy damage and weaken mobs you hit.',
  renew: 'Wrap a target in healing over time.',
  cleanse: 'Remove damage over time, slows, weakening, and roots.',
  divine_shield: 'Protect a target with an absorb shield.',
  prayer_of_light: 'Call down healing in an area around the placement point.',
  silence: 'Interrupt casting and prevent new casts briefly.',
  salvation: 'Revive a fallen ally at half health.',
  firebolt: 'Hurl a fire bolt that hits harder against chilled targets.',
  frost_nova: 'Burst frost around you to damage, slow, and chill nearby enemies.',
  arcane_missiles: 'Channel several arcane missiles into a single target.',
  flame_wave: 'Unleash a cone of fire in front of you.',
  ice_barrier: 'Surround yourself with a protective absorb barrier.',
  blink: 'Teleport a short distance in your movement direction.',
  counterspell: 'Interrupt your target and silence casting briefly.',
  meteor: 'Call down a placed meteor that impacts an area.',
});

const ABILITY_FAMILY_BY_ID = /** @type {Record<string, string>} */ ({
  shield_slam: 'guardian',
  defensive_stance: 'guardian',
  taunt: 'guardian',
  shield_wall: 'guardian',
  fortify: 'guardian',
  ground_slam: 'guardian',
  guardians_rebuke: 'guardian',
  unbreakable: 'guardian',
  power_strike: 'physical',
  cleave: 'physical',
  berserk: 'fire',
  whirlwind: 'physical',
  execute: 'physical',
  blood_rage: 'fire',
  interrupting_strike: 'physical',
  avatar_of_war: 'physical',
  aimed_shot: 'mobility',
  roll_back: 'mobility',
  poison_arrow: 'nature',
  rapid_fire: 'mobility',
  snare_trap: 'nature',
  mark_target: 'nature',
  disengage_shot: 'mobility',
  eagle_eye: 'holy',
  heal: 'holy',
  smite: 'holy',
  renew: 'holy',
  cleanse: 'holy',
  divine_shield: 'holy',
  prayer_of_light: 'holy',
  silence: 'holy',
  salvation: 'holy',
  firebolt: 'fire',
  frost_nova: 'frost',
  arcane_missiles: 'arcane',
  flame_wave: 'fire',
  ice_barrier: 'frost',
  blink: 'mobility',
  counterspell: 'arcane',
  meteor: 'fire',
});

function hexToRgb(/** @type {string} */ hex) {
  const normalized = String(hex ?? '').replace('#', '');
  if (normalized.length !== 6) return '255, 255, 255';
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function getPalette(/** @type {string} */ family) {
  const [primary, secondary] = PALETTE_HEX[family] ?? PALETTE_HEX.physical;
  return {
    primaryRgb: hexToRgb(primary),
    secondaryRgb: hexToRgb(secondary),
  };
}

function formatNumber(/** @type {any} */ value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (Math.abs(num - Math.round(num)) < 0.001) return String(Math.round(num));
  return num.toFixed(1).replace(/\.0$/, '');
}

function formatDuration(/** @type {any} */ ms) {
  const num = Number(ms);
  if (!Number.isFinite(num) || num <= 0) return null;
  const seconds = num / 1000;
  if (Math.abs(seconds - Math.round(seconds)) < 0.001) return `${Math.round(seconds)}s`;
  return `${seconds.toFixed(1).replace(/\.0$/, '')}s`;
}

function titleCase(/** @type {any} */ value) {
  const text = String(value ?? '');
  if (!text) return 'Resource';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getBasicAttackSummary(/** @type {any} */ weaponDef) {
  const kind = String(weaponDef?.kind ?? '').toLowerCase();
  if (kind.includes('bow')) {
    return 'Fire a basic ranged shot at your target.';
  }
  if (kind.includes('wand') || kind.includes('staff')) {
    return 'Cast a basic magic bolt at your target.';
  }
  return 'Strike your target with a basic melee attack.';
}

function getBasicAttackFamily(/** @type {any} */ classId, /** @type {any} */ weaponDef) {
  const kind = String(weaponDef?.kind ?? '').toLowerCase();
  if (kind.includes('bow')) return 'mobility';
  if (kind.includes('staff')) return classId === 'priest' ? 'holy' : 'arcane';
  if (kind.includes('wand')) return classId === 'priest' ? 'holy' : 'arcane';
  if (classId === 'priest') return 'holy';
  if (classId === 'mage') return 'arcane';
  return 'physical';
}

function buildCostLabel(/** @type {any} */ ability, /** @type {any} */ classId) {
  const cost = Number(ability?.resourceCost ?? 0);
  if (!Number.isFinite(cost) || cost <= 0) {
    return 'No resource cost';
  }
  const resource = getResourceForClass(classId);
  return `${cost} ${titleCase(resource?.type)}`;
}

function buildMetaParts(/** @type {any} */ ability, /** @type {string} */ costLabel) {
  const parts = [costLabel];
  const cooldown = formatDuration(ability?.cooldownMs);
  if (cooldown) parts.push(`CD: ${cooldown}`);

  const windUp = formatDuration(ability?.windUpMs);
  if (windUp) parts.push(`Wind-up: ${windUp}`);

  const channelTicks = Number(ability?.channelTicks);
  if (Number.isFinite(channelTicks) && channelTicks > 0) {
    parts.push(`Hits: ${channelTicks}`);
  }

  if (ability?.targetType !== 'self') {
    const range = formatNumber(ability?.range);
    if (range) parts.push(`Range: ${range}m`);
  }

  const radius = formatNumber(ability?.radius);
  if (radius) parts.push(`Radius: ${radius}m`);

  const cone = formatNumber(ability?.coneDegrees);
  if (cone) parts.push(`Cone: ${cone}deg`);

  const placementRange = formatNumber(ability?.placementRange);
  if (placementRange) {
    parts.push(`Placement: ${placementRange}m`);
  } else if (ability?.requirePlacement) {
    parts.push('Placement required');
  }

  const dashDistance = formatNumber(ability?.dashDistance);
  if (dashDistance) parts.push(`Dash: ${dashDistance}m`);

  const duration = formatDuration(ability?.durationMs);
  if (duration) parts.push(`Duration: ${duration}`);

  const dotDuration = formatDuration(ability?.dotDurationMs);
  if (dotDuration) parts.push(`DoT: ${dotDuration}`);

  const hotDuration = formatDuration(ability?.hotDurationMs);
  if (hotDuration) parts.push(`HoT: ${hotDuration}`);

  const executeThreshold = formatNumber(ability?.executeThresholdPct);
  if (executeThreshold) parts.push(`Execute: < ${executeThreshold}%`);

  return parts;
}

function resolveAbilityFamily(/** @type {any} */ ability, /** @type {any} */ classId, /** @type {any} */ weaponDef) {
  if (ability?.id === 'basic_attack') {
    return getBasicAttackFamily(classId, weaponDef);
  }
  if (ABILITY_FAMILY_BY_ID[ability?.id]) {
    return ABILITY_FAMILY_BY_ID[ability.id];
  }
  if (ability?.supportTag) return 'holy';
  if (ability?.attackType === 'melee') return 'physical';
  if (ability?.attackType === 'ranged') return 'mobility';
  if (ability?.targetType === 'aoe') return 'arcane';
  return classId === 'priest' ? 'holy' : classId === 'mage' ? 'arcane' : 'physical';
}

function buildSummary(/** @type {any} */ ability, /** @type {any} */ weaponDef) {
  if (ability?.id === 'basic_attack') {
    return getBasicAttackSummary(weaponDef);
  }
  return ABILITY_SUMMARY_BY_ID[ability?.id] ?? 'Use this ability to pressure your target.';
}

export function getAbilityPresentation(/** @type {any} */ ability, /** @type {any} */ opts = {}) {
  const classId = opts?.classId ?? null;
  const weaponDef = opts?.weaponDef ?? null;
  const summary = buildSummary(ability, weaponDef);
  const costLabel = buildCostLabel(ability, classId);
  const metaLabel = buildMetaParts(ability, costLabel).join(' · ');
  const palette = getPalette(resolveAbilityFamily(ability, classId, weaponDef));
  return {
    summary,
    costLabel,
    metaLabel,
    primaryRgb: palette.primaryRgb,
    secondaryRgb: palette.secondaryRgb,
  };
}
