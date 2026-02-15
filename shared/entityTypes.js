// @ts-check

import { RESOURCE_TYPES } from './economy.js';
import { MOB_CONFIG } from './config.js';

/** All valid mob types. Used for map config validation and random spawn pool. */
export const MOB_TYPES = [
  'orc',
  'demon',
  'yeti',
  'tribal',
  'wolf',
  'fox',
  'bull',
  'stag',
];

/** Resource type keys from economy (single source of truth for harvest output). */
export const RESOURCE_TYPE_LIST = Object.keys(RESOURCE_TYPES);

/** Set for fast validation. */
export const VALID_MOB_TYPES = new Set(MOB_TYPES);

/** Set for fast validation. */
export const VALID_RESOURCE_TYPES = new Set(RESOURCE_TYPE_LIST);

/**
 * Per-mob-type stat overrides. Missing fields fall back to MOB_CONFIG.
 * @type {Record<string, Partial<{ attackDamageBase: number; attackDamagePerLevel: number; speed: number; wanderSpeed: number; respawnMs: number; radius: number }>>}
 */
export const MOB_STATS = {
  orc: { attackDamageBase: 6, attackDamagePerLevel: 2, speed: 2.2, wanderSpeed: 1.4, respawnMs: 10_000, radius: 0.8 },
  demon: { attackDamageBase: 8, attackDamagePerLevel: 2.5, speed: 2.4, wanderSpeed: 1.2, respawnMs: 12_000, radius: 0.8 },
  yeti: { attackDamageBase: 10, attackDamagePerLevel: 3, speed: 1.8, wanderSpeed: 1.0, respawnMs: 15_000, radius: 0.9 },
  tribal: { attackDamageBase: 5, attackDamagePerLevel: 2, speed: 2.6, wanderSpeed: 1.6, respawnMs: 8_000, radius: 0.8 },
  wolf: { attackDamageBase: 4, attackDamagePerLevel: 1.5, speed: 3.0, wanderSpeed: 2.0, respawnMs: 6_000, radius: 0.7 },
  fox: { attackDamageBase: 3, attackDamagePerLevel: 1, speed: 2.8, wanderSpeed: 1.8, respawnMs: 5_000, radius: 0.6 },
  bull: { attackDamageBase: 12, attackDamagePerLevel: 3, speed: 1.6, wanderSpeed: 0.8, respawnMs: 18_000, radius: 1.0 },
  stag: { attackDamageBase: 5, attackDamagePerLevel: 2, speed: 2.4, wanderSpeed: 1.5, respawnMs: 9_000, radius: 0.8 },
};

/**
 * Get merged mob stats for a mob type. Falls back to MOB_CONFIG for missing fields.
 * @param {string} [mobType]
 * @returns {{ attackDamageBase: number; attackDamagePerLevel: number; speed: number; wanderSpeed: number; respawnMs: number; radius: number }}
 */
export function getMobStats(mobType) {
  const type = mobType && VALID_MOB_TYPES.has(mobType) ? mobType : 'orc';
  const overrides = MOB_STATS[type] ?? {};
  return {
    attackDamageBase: overrides.attackDamageBase ?? MOB_CONFIG.attackDamageBase,
    attackDamagePerLevel: overrides.attackDamagePerLevel ?? MOB_CONFIG.attackDamagePerLevel,
    speed: overrides.speed ?? 2.2,
    wanderSpeed: overrides.wanderSpeed ?? 1.4,
    respawnMs: overrides.respawnMs ?? MOB_CONFIG.respawnMs,
    radius: overrides.radius ?? MOB_CONFIG.radius,
  };
}

/**
 * @param {string} [type]
 * @returns {boolean}
 */
export function isValidMobType(type) {
  if (!type || typeof type !== 'string') return false;
  return VALID_MOB_TYPES.has(type.trim().toLowerCase());
}

/**
 * @param {string} [type]
 * @returns {boolean}
 */
export function isValidResourceType(type) {
  if (!type || typeof type !== 'string') return false;
  return VALID_RESOURCE_TYPES.has(type.trim().toLowerCase());
}
