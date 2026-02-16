import { tryUseAbility } from '../../logic/combat.js';
import { sendCombatLog } from '../../logic/combatLog.js';
import { buildCombatLogDispatch } from '../../logic/combatLogEntries.js';

export function handleAbility(ctx) {
  const {
    player,
    players,
    mobs,
    world,
    config,
    safeSend,
    broadcastCombatEvent,
    persistence,
  } = ctx;
  const now = Date.now();
  const result = tryUseAbility({
    player,
    slot: ctx.msg.slot,
    mobs,
    players,
    world,
    now,
    respawnMs: config.mob.respawnMs,
    placementX: ctx.msg.placementX,
    placementZ: ctx.msg.placementZ,
  });
  if (!result.success && result.reason) {
    safeSend(player.ws, { type: 'abilityFailed', reason: result.reason, slot: ctx.msg.slot });
  }
  if (result.event) {
    broadcastCombatEvent(result.event, now);
  }
  if (result.combatLog) {
    const { actorEntries, xpEntriesByPlayer } = buildCombatLogDispatch(result.combatLog, now);
    if (actorEntries.length > 0) {
      sendCombatLog(players, player.id, actorEntries, ctx.safeSend);
    }
    for (const xp of xpEntriesByPlayer) {
      if (xp.entries.length > 0) {
        sendCombatLog(players, xp.playerId, xp.entries, ctx.safeSend);
      }
    }
  }
  const xpGainByPlayer = result.combatLog?.xpGainByPlayer ?? [];
  for (const p of xpGainByPlayer) {
    const targetPlayer = players.get(p.playerId);
    if (targetPlayer && (p.xpGain > 0 || p.leveledUp)) {
      persistence.markDirty(targetPlayer);
    }
  }
  if (xpGainByPlayer.length === 0 && (result.xpGain > 0 || result.leveledUp)) {
    persistence.markDirty(player);
  }
}
