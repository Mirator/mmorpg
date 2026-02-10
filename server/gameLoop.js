import { stepPlayer } from './logic/movement.js';
import { applyCollisions } from './logic/collision.js';
import { stepResources } from './logic/resources.js';
import { stepMobs } from './logic/mobs.js';
import { clearInventory } from './logic/inventory.js';

export function createGameLoop({ players, world, resources, mobs, config, spawner, markDirty }) {
  const tickHz = config.tickHz;
  const dt = 1 / tickHz;
  const playerRadius = config.playerRadius;
  const respawnMs = config.respawnMs;
  const mobConfig = {
    mobRadius: config.mob.radius,
    respawnMs: config.mob.respawnMs,
    attackDamageBase: config.mob.attackDamageBase,
    attackDamagePerLevel: config.mob.attackDamagePerLevel,
  };

  function killPlayer(player, now) {
    if (player.dead) return;
    player.dead = true;
    player.respawnAt = now + respawnMs;
    player.inv = 0;
    clearInventory(player.inventory);
    player.target = null;
    player.targetId = null;
    player.keys = { w: false, a: false, s: false, d: false };
    markDirty(player);
  }

  function respawnPlayer(player) {
    const spawn = spawner.getSpawnPoint();
    player.pos = { x: spawn.x, y: 0, z: spawn.z };
    player.hp = player.maxHp;
    player.dead = false;
    player.respawnAt = 0;
    player.attackCooldownUntil = 0;
    player.targetId = null;
    markDirty(player);
  }

  let intervalId = null;

  function start() {
    if (intervalId) return;
    intervalId = setInterval(() => {
      const now = Date.now();

      for (const player of players.values()) {
        if (player.dead) {
          if (player.respawnAt && now >= player.respawnAt) {
            respawnPlayer(player);
          }
          continue;
        }

        const result = stepPlayer(
          { pos: player.pos, target: player.target },
          { keys: player.keys },
          dt,
          { speed: world.playerSpeed, targetEpsilon: 0.1 }
        );
        player.pos = applyCollisions(result.pos, world, playerRadius);
        player.target = result.target;
      }

      stepResources(resources, now);
      stepMobs(mobs, Array.from(players.values()), world, dt, now, mobConfig);

      for (const player of players.values()) {
        if (player.targetId) {
          const target = mobs.find((mob) => mob.id === player.targetId);
          if (!target || target.dead || target.hp <= 0) {
            player.targetId = null;
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
