// @ts-check
import { stepPlayer } from './logic/movement.js';
import { applyCollisions } from './logic/collision.js';
import { stepResources, stepPlayerHarvest } from './logic/resources.js';
import { stepMobs } from './logic/mobs.js';
import { clearInventory, countInventory } from './logic/inventory.js';
import { respawnPlayer } from './logic/players.js';
import { createCorpse, stepCorpses } from './logic/corpses.js';
import { stepPlayerResources, stepPlayerCast, stepDotTicks, stepHotTicks } from './logic/combat.js';
import { endDuel } from './logic/duel.js';
import { buildCombatLogDispatch } from './logic/combatLogEntries.js';
import {
  applyContractProgress,
  applyProfessionReward,
  refreshDeliveryContractProgress,
} from './logic/contracts.js';
import { applyTutorialProgress } from './logic/tutorial.js';
import { applyDurabilityLoss } from '../shared/equipment.js';

/** @typedef {import('./types/domain.d.ts').PlayerMap} PlayerMap */
/** @typedef {import('./types/domain.d.ts').ServerPlayer} ServerPlayer */
/** @typedef {import('./types/domain.d.ts').SpawnerLike} SpawnerLike */

/**
 * @typedef {{
 *   dt: number,
 *   dtMs: number,
 *   playerRadius: number,
 *   respawnMs: number,
 *   corpseExpiryMs: number,
 *   mobRespawnMs: number,
 *   harvestConfig: {
 *     harvestRadius: number,
 *     harvestDurationMs: number,
 *     respawnMs: number,
 *   },
 *   mobStepConfig: {
 *     mobRadius: number,
 *     respawnMs: number,
 *     attackDamageBase: number,
 *     attackDamagePerLevel: number,
 *     onPlayerDamaged?: (...args: any[]) => void,
 *     onAttackTelegraph?: (...args: any[]) => void,
 *   },
 * }} GameLoopRuntime
 */

/**
 * @typedef {{
 *   markDirty: (player: ServerPlayer) => void,
 *   onCombatLog?: (playerId: string, entries: any[]) => void,
 *   onCombatEvent?: (event: any, now: number) => void,
 *   onPlayerDeath?: (playerId: string, now: number) => void,
 *   onDuelEnded?: (
 *     player: ServerPlayer,
 *     opponent: ServerPlayer | null,
 *     reason: string,
 *     markDirty: (player: ServerPlayer) => void
 *   ) => void,
 * }} GameLoopCallbacks
 */

/**
 * @typedef {{
 *   players: PlayerMap,
 *   resources: any[],
 *   mobs: any[],
 *   corpses?: any[] | null,
 *   now: number,
 *   runtime: GameLoopRuntime,
 *   markDirty: (player: ServerPlayer) => void,
 *   onCombatLog?: (playerId: string, entries: any[]) => void,
 *   onCombatEvent?: (event: any, now: number) => void,
 *   onPlayerDeath?: (playerId: string, now: number) => void,
 *   onDuelEnded?: (
 *     player: ServerPlayer,
 *     opponent: ServerPlayer | null,
 *     reason: string,
 *     markDirty: (player: ServerPlayer) => void
 *   ) => void,
 * }} PlayerActionPhaseArgs
 */

/**
 * @param {any} config
 * @param {((...args: any[]) => void) | undefined} onPlayerDamaged
 * @param {((...args: any[]) => void) | undefined} onMobAttackTelegraph
 * @returns {GameLoopRuntime}
 */
export function buildGameLoopRuntime(config, onPlayerDamaged, onMobAttackTelegraph) {
  const tickHz = config.tickHz;
  const dt = 1 / tickHz;
  return {
    dt,
    dtMs: dt * 1000,
    playerRadius: config.playerRadius,
    respawnMs: config.respawnMs,
    corpseExpiryMs: config.corpse?.expiryMs ?? 600_000,
    mobRespawnMs: config.mob?.respawnMs ?? 10_000,
    harvestConfig: {
      harvestRadius: config.resource?.harvestRadius ?? 2,
      harvestDurationMs: config.resource?.harvestDurationMs ?? 2_500,
      respawnMs: config.resource?.respawnMs ?? 15_000,
    },
    mobStepConfig: {
      mobRadius: config.mob.radius,
      respawnMs: config.mob.respawnMs,
      attackDamageBase: config.mob.attackDamageBase,
      attackDamagePerLevel: config.mob.attackDamagePerLevel,
      onPlayerDamaged,
      onAttackTelegraph: onMobAttackTelegraph,
    },
  };
}

/**
 * @param {{
 *   players: PlayerMap,
 *   world: any,
 *   spawner: SpawnerLike,
 *   now: number,
 *   runtime: GameLoopRuntime,
 *   markDirty: (player: ServerPlayer) => void,
 * }} params
 */
export function stepPlayerMovementPhase({ players, world, spawner, now, runtime, markDirty }) {
  for (const player of players.values()) {
    const prevPos = {
      x: player.pos?.x ?? 0,
      y: player.pos?.y ?? 0,
      z: player.pos?.z ?? 0,
    };
    let respawned = false;

    if (player.dead) {
      if (player.respawnAt && now >= player.respawnAt) {
        respawnPlayer(player, spawner.getSpawnPoint(), markDirty);
        player.harvest = null;
        respawned = true;
      }
    }

    if (!player.dead) {
      const rooted = Number(player.rootedUntil) > now;
      const stunned = Number(player.stunnedUntil) > now;
      const canMove = !rooted && !stunned;
      const slowMult = Number(player.slowUntil) > now ? Number(player.slowMultiplier ?? 0.5) : 1;
      const baseSpeed = player.keys?.walk
        ? (world.playerWalkSpeed ?? world.playerSpeed)
        : world.playerSpeed;
      const speed = canMove ? baseSpeed * (player.moveSpeedMultiplier ?? 1) * slowMult : 0;
      const result = stepPlayer(
        { pos: player.pos, target: player.target },
        { keys: player.keys },
        runtime.dt,
        { speed, targetEpsilon: 0.1 }
      );
      player.pos = applyCollisions(result.pos, world, runtime.playerRadius);
      player.target = result.target;
    }

    const dx = (player.pos?.x ?? 0) - prevPos.x;
    const dz = (player.pos?.z ?? 0) - prevPos.z;
    const dist = Math.hypot(dx, dz);
    const moved = !player.dead && !respawned && dist > 0.001;
    player.movedThisTick = moved;
    if (moved) {
      player.lastMoveDir = { x: dx / dist, z: dz / dist };
    }
  }
}

/**
 * @param {{
 *   players: PlayerMap,
 *   playerList: ServerPlayer[],
 *   world: any,
 *   resources: any[],
 *   mobs: any[],
 *   corpses?: any[] | null,
 *   now: number,
 *   runtime: GameLoopRuntime,
 * }} params
 */
export function stepWorldSystemsPhase({ players, playerList, world, resources, mobs, corpses, now, runtime }) {
  stepResources(resources, now);
  if (corpses) stepCorpses(corpses, now);
  stepDotTicks(mobs, now, runtime.mobRespawnMs, players);
  stepHotTicks(players, now);
  stepMobs(mobs, playerList, world, runtime.dt, now, runtime.mobStepConfig);
}

/**
 * @param {{
 *   player: ServerPlayer,
 *   players: PlayerMap,
 *   corpses?: any[] | null,
 *   now: number,
 *   runtime: GameLoopRuntime,
 * } & GameLoopCallbacks} params
 */
export function killPlayer({ player, players, corpses, now, runtime, markDirty, onPlayerDeath, onDuelEnded }) {
  if (player.dead) return;
  for (const slot of ['head', 'chest', 'legs', 'feet']) {
    applyDurabilityLoss(player.equipment?.[slot], 1);
  }
  applyDurabilityLoss(player.equipment?.weapon, 2);
  const opponent = endDuel(player, players);
  if (opponent && typeof onDuelEnded === 'function') {
    onDuelEnded(player, opponent, 'death', markDirty);
  }
  player.dead = true;
  player.respawnAt = now + runtime.respawnMs;
  if (Array.isArray(corpses) && player.inventory && countInventory(player.inventory) > 0) {
    const corpse = createCorpse(
      player.id,
      /** @type {import('./types/domain.d.ts').Position3D} */ (player.pos),
      player.inventory,
      now + runtime.corpseExpiryMs
    );
    corpses.push(corpse);
  }
  player.inv = 0;
  clearInventory(player.inventory);
  refreshDeliveryContractProgress(player);
  player.target = null;
  player.targetId = null;
  player.targetKind = null;
  player.cast = null;
  player.harvest = null;
  player.keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    walk: !!player.keys?.walk,
  };
  markDirty(player);
  if (typeof onPlayerDeath === 'function') {
    onPlayerDeath(player.id, now);
  }
}

/**
 * @param {PlayerActionPhaseArgs} params
 */
export function stepPlayerActionPhase({
  players,
  resources,
  mobs,
  corpses,
  now,
  runtime,
  markDirty,
  onCombatLog,
  onCombatEvent,
  onPlayerDeath,
  onDuelEnded,
}) {
  for (const player of players.values()) {
    const harvestResult = stepPlayerHarvest(resources, player, now, {
      ...runtime.harvestConfig,
      stackMax: player.invStackMax,
    });
    if (harvestResult?.status === 'completed') {
      const resourceType = harvestResult.harvested?.type ?? 'crystal';
      const gatheringXp = /** @type {Record<string, number>} */ ({
        crystal: 12,
        ore: 15,
        herb: 10,
        tree: 14,
        flower: 8,
      })[resourceType] ?? 10;
      applyProfessionReward(player, [{ track: 'gathering', xp: gatheringXp }]);
      applyContractProgress(player, {
        kind: 'gather',
        target: resourceType,
        count: 1,
      });
      applyTutorialProgress(player, 'harvest');
      refreshDeliveryContractProgress(player);
      markDirty(player);
    }

    const castResult = stepPlayerCast(player, mobs, now, runtime.mobRespawnMs, players);
    if (castResult.event && typeof onCombatEvent === 'function') {
      onCombatEvent(castResult.event, now);
    }
    if (castResult.combatLog && typeof onCombatLog === 'function') {
      const { actorEntries, xpEntriesByPlayer } = buildCombatLogDispatch(castResult.combatLog, now);
      if (actorEntries.length > 0) {
        onCombatLog(player.id, actorEntries);
      }
      for (const xp of xpEntriesByPlayer) {
        if (xp.entries.length > 0) {
          onCombatLog(xp.playerId, xp.entries);
        }
      }
    }
    const xpGainByPlayer = castResult.combatLog?.xpGainByPlayer ?? [];
    for (const xpGain of xpGainByPlayer) {
      const targetPlayer = players.get(xpGain.playerId);
      if (targetPlayer && (xpGain.xpGain > 0 || xpGain.leveledUp)) {
        markDirty(targetPlayer);
      }
    }
    if (xpGainByPlayer.length === 0 && (castResult.xpGain > 0 || castResult.leveledUp)) {
      markDirty(player);
    }
    if (player.pendingProgressDirty) {
      player.pendingProgressDirty = false;
      markDirty(player);
    }
    stepPlayerResources(player, now, runtime.dt);
    if (player.targetId) {
      if (player.targetKind === 'player') {
        const targetPlayer = players.get(player.targetId);
        if (!targetPlayer || targetPlayer.dead) {
          player.targetId = null;
          player.targetKind = null;
        }
      } else {
        const targetMob = mobs.find((mob) => mob.id === player.targetId);
        if (!targetMob || targetMob.dead || targetMob.hp <= 0) {
          player.targetId = null;
          player.targetKind = null;
        }
      }
    }
    if (!player.dead && Number(player.hp) <= 0) {
      killPlayer({
        player,
        players,
        corpses,
        now,
        runtime,
        markDirty,
        onPlayerDeath,
        onDuelEnded,
      });
    }
  }
}
