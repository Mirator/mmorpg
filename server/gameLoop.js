import { stepPlayer } from './logic/movement.js';
import { applyCollisions } from './logic/collision.js';
import { stepResources } from './logic/resources.js';
import { stepMobs } from './logic/mobs.js';
import { clearInventory } from './logic/inventory.js';
import { respawnPlayer } from './logic/players.js';
import { stepPlayerResources, stepPlayerCast } from './logic/combat.js';

export function createGameLoop({ players, world, resources, mobs, config, spawner, markDirty, onPlayerDamaged, onCombatLog, onPlayerDeath }) {
  const tickHz = config.tickHz;
  const dt = 1 / tickHz;
  const playerRadius = config.playerRadius;
  const respawnMs = config.respawnMs;
  const mobConfig = {
    mobRadius: config.mob.radius,
    respawnMs: config.mob.respawnMs,
    attackDamageBase: config.mob.attackDamageBase,
    attackDamagePerLevel: config.mob.attackDamagePerLevel,
    onPlayerDamaged,
  };

  function killPlayer(player, now) {
    if (player.dead) return;
    player.dead = true;
    player.respawnAt = now + respawnMs;
    player.inv = 0;
    clearInventory(player.inventory);
    player.target = null;
    player.targetId = null;
    player.targetKind = null;
    player.cast = null;
    player.keys = { w: false, a: false, s: false, d: false };
    markDirty(player);
    if (typeof onPlayerDeath === 'function') {
      onPlayerDeath(player.id, now);
    }
  }

  let intervalId = null;

  function start() {
    if (intervalId) return;
    intervalId = setInterval(() => {
      const now = Date.now();

      for (const player of players.values()) {
        const prevPos = { x: player.pos.x, y: player.pos.y ?? 0, z: player.pos.z };
        let respawned = false;

        if (player.dead) {
          if (player.respawnAt && now >= player.respawnAt) {
            respawnPlayer(player, spawner.getSpawnPoint(), markDirty);
            respawned = true;
          }
        }

        if (!player.dead) {
          const speed = world.playerSpeed * (player.moveSpeedMultiplier ?? 1);
          const result = stepPlayer(
            { pos: player.pos, target: player.target },
            { keys: player.keys },
            dt,
            { speed, targetEpsilon: 0.1 }
          );
          player.pos = applyCollisions(result.pos, world, playerRadius);
          player.target = result.target;
        }

        const dx = player.pos.x - prevPos.x;
        const dz = player.pos.z - prevPos.z;
        const dist = Math.hypot(dx, dz);
        const moved = !player.dead && !respawned && dist > 0.001;
        player.movedThisTick = moved;
        if (moved) {
          player.lastMoveDir = { x: dx / dist, z: dz / dist };
        }
      }

      stepResources(resources, now);
      stepMobs(mobs, Array.from(players.values()), world, dt, now, mobConfig);

      for (const player of players.values()) {
        const castResult = stepPlayerCast(player, mobs, now, config.mob.respawnMs);
        if (castResult.combatLog && typeof onCombatLog === 'function') {
          const entries = [];
          if (castResult.combatLog.damageDealt != null && castResult.combatLog.targetName) {
            const abilityName = castResult.combatLog.abilityName ?? 'You';
            const critSuffix = castResult.combatLog.isCrit ? ' (Critical!)' : '';
            entries.push({
              kind: 'damage_done',
              text: `${abilityName} hit ${castResult.combatLog.targetName} for ${castResult.combatLog.damageDealt} damage${critSuffix}`,
              t: now,
            });
          }
          if (castResult.combatLog.xpGain > 0 && castResult.combatLog.targetName) {
            entries.push({
              kind: 'xp_gain',
              text: `You gained ${castResult.combatLog.xpGain} XP from killing ${castResult.combatLog.targetName}`,
              t: now,
            });
          }
          if (castResult.combatLog.leveledUp) {
            entries.push({
              kind: 'level_up',
              text: 'You gained a level!',
              t: now,
            });
          }
          if (entries.length > 0) {
            onCombatLog(player.id, entries);
          }
        }
        if (castResult.xpGain > 0 || castResult.leveledUp) {
          markDirty(player);
        }
        stepPlayerResources(player, now, dt);
        if (player.targetId) {
          if (player.targetKind === 'player') {
            const targetPlayer = players.get(player.targetId);
            if (!targetPlayer || targetPlayer.dead) {
              player.targetId = null;
              player.targetKind = null;
            }
          } else {
            const target = mobs.find((mob) => mob.id === player.targetId);
            if (!target || target.dead || target.hp <= 0) {
              player.targetId = null;
              player.targetKind = null;
            }
          }
        }
        if (!player.dead && player.hp <= 0) {
          killPlayer(player, now);
        }
      }
    }, dt * 1000);
  }

  function stop() {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
  }

  return { start, stop };
}
