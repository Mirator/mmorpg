// @ts-check
export function buildCombatLogDispatch(/** @type {any} */ combatLog, /** @type {any} */ now) {
  if (!combatLog) {
    return { actorEntries: [], xpEntriesByPlayer: [] };
  }

  const /** @type {any} */ actorEntries = [];
  if (combatLog.damageDealt != null && combatLog.targetName) {
    const abilityName = combatLog.abilityName ?? 'You';
    const critSuffix = combatLog.isCrit ? ' (Critical!)' : '';
    actorEntries.push({
      kind: 'damage_done',
      text: `${abilityName} hit ${combatLog.targetName} for ${combatLog.damageDealt} damage${critSuffix}`,
      t: now,
    });
  }
  if (combatLog.healAmount != null && combatLog.healTarget) {
    const targetText = combatLog.healTarget === 'yourself' ? 'yourself' : combatLog.healTarget;
    actorEntries.push({
      kind: 'heal',
      text: `You healed ${targetText} for ${combatLog.healAmount}`,
      t: now,
    });
  }

  const /** @type {any} */ xpEntriesByPlayer = [];
  for (const xp of combatLog.xpGainByPlayer ?? []) {
    const /** @type {any} */ entries = [];
    if (xp.xpGain > 0 && combatLog.targetName) {
      entries.push({
        kind: 'xp_gain',
        text: `You gained ${xp.xpGain} XP from killing ${combatLog.targetName}`,
        t: now,
      });
    }
    if (xp.leveledUp) {
      entries.push({
        kind: 'level_up',
        text: 'You gained a level!',
        t: now,
      });
    }
    if (entries.length > 0) {
      xpEntriesByPlayer.push({ playerId: xp.playerId, entries });
    }
  }

  return { actorEntries, xpEntriesByPlayer };
}
