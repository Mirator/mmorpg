// @ts-check

import { PROTOCOL_VERSION } from './protocol.js';

export const GAME_CONFIG_VERSION = 1;

export const WORLD_CONFIG = {
  seed: 1337,
  mapSize: 400,
  baseRadius: 9,
  obstacleCount: 12,
  resourceCount: 80,
  mobCount: 8,
};

export const RESOURCE_CONFIG = {
  harvestRadius: 2.2,
  respawnMs: 15_000,
};

export const PLAYER_CONFIG = {
  maxHp: 100,
  speed: 3,
  invSlots: 20,
  invStackMax: 20,
};

export const VENDOR_CONFIG = {
  interactRadius: 2.5,
};

export const MOB_CONFIG = {
  respawnMs: 10_000,
  attackDamageBase: 6,
  attackDamagePerLevel: 2,
  radius: 0.8,
};

export const COMBAT_CONFIG = {
  basicAttackDamage: 10,
  basicAttackCooldownMs: 900,
  targetSelectRange: 25,
};

export function getConfigSnapshot() {
  return {
    version: GAME_CONFIG_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    world: {
      mapSize: WORLD_CONFIG.mapSize,
      baseRadius: WORLD_CONFIG.baseRadius,
      obstacleCount: WORLD_CONFIG.obstacleCount,
      resourceCount: WORLD_CONFIG.resourceCount,
      mobCount: WORLD_CONFIG.mobCount,
      seed: WORLD_CONFIG.seed,
    },
    player: {
      maxHp: PLAYER_CONFIG.maxHp,
      speed: PLAYER_CONFIG.speed,
      invSlots: PLAYER_CONFIG.invSlots,
      invStackMax: PLAYER_CONFIG.invStackMax,
    },
    resource: {
      harvestRadius: RESOURCE_CONFIG.harvestRadius,
      respawnMs: RESOURCE_CONFIG.respawnMs,
    },
    mob: {
      respawnMs: MOB_CONFIG.respawnMs,
      attackDamageBase: MOB_CONFIG.attackDamageBase,
      attackDamagePerLevel: MOB_CONFIG.attackDamagePerLevel,
      radius: MOB_CONFIG.radius,
    },
    combat: {
      basicAttackDamage: COMBAT_CONFIG.basicAttackDamage,
      basicAttackCooldownMs: COMBAT_CONFIG.basicAttackCooldownMs,
      targetSelectRange: COMBAT_CONFIG.targetSelectRange,
    },
    vendor: {
      interactRadius: VENDOR_CONFIG.interactRadius,
    },
  };
}
