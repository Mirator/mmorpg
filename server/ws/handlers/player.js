import { isValidClassId } from '../../../shared/classes.js';
import { respawnPlayer } from '../../logic/players.js';

export function handleRespawn(ctx) {
  const { player, spawner, persistence } = ctx;
  if (player.dead) {
    respawnPlayer(player, spawner.getSpawnPoint(), persistence.markDirty);
  }
}

export function handleInput(ctx) {
  const { player, msg } = ctx;
  player.keys = msg.keys;
}

export function handleMoveTarget(ctx) {
  const { player, msg } = ctx;
  player.target = { x: msg.x, y: msg.y ?? 0, z: msg.z };
}

export function handleTargetSelect(ctx) {
  const { player, players, msg, config, mobs } = ctx;
  if (!msg.targetId) {
    player.targetId = null;
    player.targetKind = null;
    return;
  }
  const targetKind = msg.targetKind === 'player' ? 'player' : 'mob';
  const maxDist = config.combat?.targetSelectRange ?? 25;
  if (targetKind === 'player') {
    const targetPlayer = players.get(msg.targetId);
    if (!targetPlayer || targetPlayer.dead) {
      player.targetId = null;
      player.targetKind = null;
      return;
    }
    const dx = targetPlayer.pos.x - player.pos.x;
    const dz = targetPlayer.pos.z - player.pos.z;
    if (dx * dx + dz * dz > maxDist * maxDist) {
      player.targetId = null;
      player.targetKind = null;
      return;
    }
    player.targetId = targetPlayer.id;
    player.targetKind = 'player';
    return;
  }

  const target = mobs.find((mob) => mob.id === msg.targetId);
  if (!target || target.dead || target.hp <= 0) {
    player.targetId = null;
    player.targetKind = null;
    return;
  }
  const dx = target.pos.x - player.pos.x;
  const dz = target.pos.z - player.pos.z;
  if (dx * dx + dz * dz > maxDist * maxDist) {
    player.targetId = null;
    player.targetKind = null;
    return;
  }
  player.targetId = target.id;
  player.targetKind = 'mob';
}

export function handleClassSelect(ctx) {
  const { player, msg, persistence, initCombatState } = ctx;
  if (!isValidClassId(msg.classId)) return;
  player.classId = msg.classId;
  initCombatState(player);
  persistence.markDirty(player);
}
