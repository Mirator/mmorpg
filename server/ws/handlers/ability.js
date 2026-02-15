import { tryUseAbility } from '../../logic/combat.js';
import { sendCombatLog } from '../../logic/combatLog.js';

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
    const damageEntries = [];
    if (result.combatLog.damageDealt != null && result.combatLog.targetName) {
      const abilityName = result.combatLog.abilityName ?? 'You';
      const critSuffix = result.combatLog.isCrit ? ' (Critical!)' : '';
      damageEntries.push({
        kind: 'damage_done',
        text: `${abilityName} hit ${result.combatLog.targetName} for ${result.combatLog.damageDealt} damage${critSuffix}`,
        t: now,
      });
    }
    if (result.combatLog.healAmount != null && result.combatLog.healTarget) {
      const target = result.combatLog.healTarget;
      const targetText = target === 'yourself' ? 'yourself' : target;
      damageEntries.push({
        kind: 'heal',
        text: `You healed ${targetText} for ${result.combatLog.healAmount}`,
        t: now,
      });
    }
    if (damageEntries.length > 0) {
      sendCombatLog(players, player.id, damageEntries, ctx.safeSend);
    }
    const xpGainByPlayer = result.combatLog.xpGainByPlayer ?? [];
    for (const p of xpGainByPlayer) {
      const xpEntries = [];
      if (p.xpGain > 0 && result.combatLog.targetName) {
        xpEntries.push({
          kind: 'xp_gain',
          text: `You gained ${p.xpGain} XP from killing ${result.combatLog.targetName}`,
          t: now,
        });
      }
      if (p.leveledUp) {
        xpEntries.push({
          kind: 'level_up',
          text: 'You gained a level!',
          t: now,
        });
      }
      if (xpEntries.length > 0) {
        sendCombatLog(players, p.playerId, xpEntries, ctx.safeSend);
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
