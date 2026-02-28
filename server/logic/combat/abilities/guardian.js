// @ts-check
/** @param {import('../abilityHandlers.js').AbilityHandlerDeps} d */
export function createGuardianHandlers(d) {
  return {
    shield_slam(/** @type {any} */ ctx) {
      const { player, ability, targetMob, targetPlayer, mobs, players, now, respawnMs } = ctx;
      const target = targetMob ?? targetPlayer;
      if (!target) return {};
      const isPvP = !!targetPlayer;
      const { damage: rawDmg, derived, isCrit } = d.computeAbilityDamage(player, ability, now, isPvP);
      const damage = d.applyPvpDamageMultiplier(rawDmg, ability, isPvP);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let /** @type {any} */ result = null;
      if (d.rollHit(derived.accuracy, 0)) {
        if (targetPlayer) {
          result = d.applyDamageToPlayer({ targetPlayer, damage, attacker: player, now });
        } else {
          result = d.applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
          xpGain = result.xpGain;
          leveledUp = result.leveledUp;
        }
        hit = true;
      }
      if (hit && targetMob && (!Number.isFinite(targetMob.stunImmuneUntil) || targetMob.stunImmuneUntil <= now)) {
        const stunDuration = d.applyCCWithDR(targetMob, 'stun', ability.stunDurationMs ?? 0, ability, false, now);
        if (stunDuration > 0) {
          targetMob.stunnedUntil = now + stunDuration;
          targetMob.stunImmuneUntil = now + (ability.stunImmunityMs ?? 0);
        }
        if ((targetMob.tauntedUntil ?? 0) > now && targetMob.tauntSourceId === player.id && targetMob.tauntExtended !== true) {
          targetMob.tauntedUntil += 1000;
          targetMob.tauntExtended = true;
        }
      }
      if (hit && targetPlayer && isPvP) {
        const stunDuration = d.applyCCWithDR(targetPlayer, 'stun', ability.stunDurationMs ?? 0, ability, true, now);
        if (stunDuration > 0) {
          targetPlayer.stunnedUntil = now + stunDuration;
        }
      }
      const targetName = targetPlayer ? (targetPlayer.name ?? 'Player') : d.getMobDisplayName(targetMob);
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName,
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    defensive_stance(/** @type {any} */ ctx) {
      const { player, ability } = ctx;
      player.defensiveStanceUntil = ctx.now + (ability.durationMs ?? 0);
      player.defensiveStancePvpDamageTakenMultiplier = ability.pvpDamageTakenMultiplier ?? 0.8;
      player.moveSpeedMultiplier = ability.moveSpeedMultiplier ?? 0.8;
      player.damageTakenMultiplier = ability.damageTakenMultiplier ?? 0.7;
      return {};
    },
    taunt(/** @type {any} */ ctx) {
      const { player, ability, targetMob } = ctx;
      if (!targetMob) return {};
      targetMob.targetId = player.id;
      targetMob.tauntedUntil = ctx.now + (ability.durationMs ?? 3000);
      targetMob.tauntSourceId = player.id;
      targetMob.tauntDamageDebuffUntil = ctx.now + (ability.durationMs ?? 3000);
      targetMob.tauntExtended = false;
      return {};
    },
    shield_wall(/** @type {any} */ ctx) {
      const { player, ability } = ctx;
      player.shieldWallUntil = ctx.now + (ability.durationMs ?? 3000);
      player.shieldWallDamageTakenMultiplier = ability.damageTakenMultiplier ?? 0.5;
      player.shieldWallPvpDamageTakenMultiplier = ability.pvpDamageTakenMultiplier ?? 0.7;
      return {};
    },
    fortify(/** @type {any} */ ctx) {
      const { player, ability } = ctx;
      const baseMaxHp = player.maxHp ?? 100;
      const mult = ability.maxHpMultiplier ?? 1.2;
      const newMaxHp = Math.floor(baseMaxHp * mult);
      const bonusHp = Math.floor(baseMaxHp * (mult - 1));
      player.fortifyBaseMaxHp = baseMaxHp;
      player.maxHp = newMaxHp;
      player.hp = Math.min((player.hp ?? baseMaxHp) + bonusHp, newMaxHp);
      player.fortifyUntil = ctx.now + (ability.durationMs ?? 8000);
      return {};
    },
    ground_slam(/** @type {any} */ ctx) {
      const { player, ability, mobs, players, now, respawnMs } = ctx;
      const result = d.applyNova({
        player,
        mobs,
        players,
        radius: ability.radius ?? 2.5,
        ability,
        slowPct: ability.slowPct ?? 40,
        slowDurationMs: ability.durationMs ?? 3000,
        now,
        respawnMs,
      });
      return {
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        hit: result.hit,
        impacts: result.impacts ?? [],
        combatLog:
          result.hit && (result.xpGain > 0 || result.leveledUp)
            ? {
                targetName: 'Enemies',
                xpGain: result.xpGain,
                leveledUp: result.leveledUp,
                xpGainByPlayer: result.xpGainByPlayer ?? [],
              }
            : null,
      };
    },
    guardians_rebuke(/** @type {any} */ ctx) {
      const { player, ability, targetMob, targetPlayer, mobs, players, now, respawnMs } = ctx;
      const target = targetMob ?? targetPlayer;
      if (!target) return {};
      const isPvP = !!targetPlayer;
      const { damage: rawDmg, derived, isCrit } = d.computeAbilityDamage(player, ability, now, isPvP);
      const damage = d.applyPvpDamageMultiplier(rawDmg, ability, isPvP);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let /** @type {any} */ result = null;
      if (d.rollHit(derived.accuracy, 0)) {
        if (targetPlayer) {
          result = d.applyDamageToPlayer({ targetPlayer, damage, attacker: player, now });
          targetPlayer.castingLockoutUntil = now + (ability.interruptLockoutMs ?? 2000);
        } else {
          result = d.applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
          xpGain = result.xpGain;
          leveledUp = result.leveledUp;
          targetMob.castingLockoutUntil = now + (ability.interruptLockoutMs ?? 2000);
        }
        hit = true;
      }
      const targetName = targetPlayer ? (targetPlayer.name ?? 'Player') : d.getMobDisplayName(targetMob);
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName,
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    unbreakable(/** @type {any} */ ctx) {
      const { player, ability } = ctx;
      player.ccImmuneUntil = ctx.now + (ability.durationMs ?? 4000);
      return {};
    },
  };
}
