// @ts-check
/** @param {import('../abilityHandlers.js').AbilityHandlerDeps} d */
export function createPriestHandlers(d) {
  return {
    heal(/** @type {any} */ ctx) {
      const { player, ability, targetPlayer, mobs, now } = ctx;
      const healTarget = targetPlayer ?? player;
      const beforeHp = healTarget.hp ?? 0;
      const baseValue = ability.baseValue ?? 15;
      const coefficient = ability.coefficient ?? 0.9;
      const derived = d.computeDerivedStats(player);
      const rawHeal = Math.max(0, Math.floor(baseValue + derived.healingPower * coefficient));
      const isPvPHeal = healTarget !== player && targetPlayer != null && d.isPvPAllowed(player, healTarget, {});
      const healAmount = d.applyPvpHealMultiplier(rawHeal, ability, isPvPHeal);
      const maxHp = healTarget.maxHp ?? healTarget.hp ?? 0;
      healTarget.hp = d.clamp((healTarget.hp ?? 0) + healAmount, 0, maxHp);
      const wasLow = beforeHp / Math.max(1, maxHp) <= 0.4;
      if (wasLow && (healTarget.lowHealthHealShieldLockoutUntil ?? 0) <= now) {
        const bonusShield = Math.max(1, Math.floor(healAmount * 0.2));
        const currentAbsorb = (healTarget.absorbUntil ?? 0) > now ? (healTarget.absorbAmount ?? 0) : 0;
        healTarget.absorbAmount = Math.max(currentAbsorb, bonusShield);
        healTarget.absorbUntil = now + 4000;
        healTarget.lowHealthHealShieldLockoutUntil = now + 8000;
        player.lastLowHealthHealTargetId = healTarget.id ?? null;
      }
      const healTargetName = healTarget === player ? 'yourself' : (healTarget.name ?? 'ally');
      if (
        ability.supportTag &&
        healTarget !== player &&
        healTarget.targetKind === 'mob' &&
        healTarget.targetId &&
        (healTarget.combatTagUntil ?? 0) > now
      ) {
        const supportMob = Array.isArray(mobs) ? mobs.find((/** @type {any} */ m) => m.id === healTarget.targetId) : null;
        if (supportMob && !supportMob.dead && supportMob.hp > 0) {
          supportMob.supportBy = supportMob.supportBy ?? {};
          supportMob.supportBy[player.id] = (supportMob.supportBy[player.id] ?? 0) + 1;
        }
      }
      return {
        combatLog: {
          healAmount,
          healTarget: healTargetName,
        },
      };
    },
    renew(/** @type {any} */ ctx) {
      const { player, ability, targetPlayer, mobs, now } = ctx;
      const healTarget = targetPlayer ?? player;
      const derived = d.computeDerivedStats(player);
      const totalHeal = (ability.baseValue ?? 8) + derived.healingPower * (ability.coefficient ?? 0.4);
      const ticks = ability.hotTicks ?? 8;
      const healPerTick = Math.max(1, Math.floor(totalHeal / ticks));
      healTarget.hotTicksRemaining = ticks;
      healTarget.hotHealPerTick = healPerTick;
      healTarget.hotSourceId = player.id;
      healTarget.hotNextTickAt = ctx.now + d.DOT_TICK_MS;
      if (
        healTarget.id &&
        player.lastLowHealthHealTargetId &&
        healTarget.id !== player.lastLowHealthHealTargetId &&
        (healTarget.lowHealthHealShieldLockoutUntil ?? 0) > now
      ) {
        healTarget.lowHealthHealShieldLockoutUntil = Math.max(
          now,
          (healTarget.lowHealthHealShieldLockoutUntil ?? 0) - 1000
        );
      }
      if (ability.supportTag && healTarget !== player && healTarget.targetId && (healTarget.combatTagUntil ?? 0) > now) {
        const supportMob = Array.isArray(mobs) ? mobs.find((/** @type {any} */ m) => m.id === healTarget.targetId) : null;
        if (supportMob && !supportMob.dead && supportMob.hp > 0) {
          supportMob.supportBy = supportMob.supportBy ?? {};
          supportMob.supportBy[player.id] = (supportMob.supportBy[player.id] ?? 0) + 1;
        }
      }
      return {
        combatLog: {
          healAmount: totalHeal,
          healTarget: healTarget === player ? 'yourself' : (healTarget.name ?? 'ally'),
        },
      };
    },
    cleanse(/** @type {any} */ ctx) {
      const { targetPlayer } = ctx;
      const target = targetPlayer ?? ctx.player;
      target.dotTicksRemaining = 0;
      target.dotUntil = 0;
      target.dotSourceId = null;
      target.slowUntil = 0;
      target.slowMultiplier = 1;
      target.weakenedUntil = 0;
      target.weakenedMultiplier = 1;
      target.rootedUntil = 0;
      return { hit: true };
    },
    divine_shield(/** @type {any} */ ctx) {
      const { player, ability, targetPlayer, mobs, now } = ctx;
      const target = targetPlayer ?? player;
      const derived = d.computeDerivedStats(player);
      const absorb = Math.max(0, Math.floor((ability.baseValue ?? 20) + derived.healingPower * (ability.coefficient ?? 0.8)));
      target.absorbAmount = absorb;
      target.absorbUntil = ctx.now + 30000;
      if (ability.supportTag && target !== player && target.targetId && (target.combatTagUntil ?? 0) > now) {
        const supportMob = Array.isArray(mobs) ? mobs.find((/** @type {any} */ m) => m.id === target.targetId) : null;
        if (supportMob && !supportMob.dead && supportMob.hp > 0) {
          supportMob.supportBy = supportMob.supportBy ?? {};
          supportMob.supportBy[player.id] = (supportMob.supportBy[player.id] ?? 0) + 1;
        }
      }
      return {
        combatLog: {
          absorbAmount: absorb,
          healTarget: target === player ? 'yourself' : (target.name ?? 'ally'),
        },
      };
    },
    prayer_of_light(/** @type {any} */ ctx) {
      const { player, ability, players, mobs, now, placementCenter } = ctx;
      const derived = d.computeDerivedStats(player);
      const rawHeal = Math.max(0, Math.floor((ability.baseValue ?? 12) + derived.healingPower * (ability.coefficient ?? 0.5)));
      const radius = ability.radius ?? 5;
      const origin = placementCenter ?? player.pos;
      const playerArr = players instanceof Map ? Array.from(players.values()) : players;
      let totalHealed = 0;
      const /** @type {any} */ impacts = [];
      for (const p of playerArr ?? []) {
        if (!p || p.dead) continue;
        const dist = Math.hypot((p.pos?.x ?? 0) - (origin?.x ?? 0), (p.pos?.z ?? 0) - (origin?.z ?? 0));
        if (dist > radius) continue;
        const isPvP = p !== player && d.isPvPAllowed(player, p, {});
        const heal = d.applyPvpHealMultiplier(rawHeal, ability, isPvP);
        p.hp = Math.min((p.hp ?? 0) + heal, p.maxHp ?? 100);
        totalHealed += heal;
        if (heal > 0 && Number.isFinite(p?.pos?.x) && Number.isFinite(p?.pos?.z)) {
          impacts.push({
            kind: 'heal',
            amount: heal,
            targetId: p.id ? String(p.id) : undefined,
            targetKind: 'player',
            x: p.pos.x,
            y: Number.isFinite(p.pos.y) ? p.pos.y : 0,
            z: p.pos.z,
          });
        }
      }
      return {
        impacts,
        combatLog: totalHealed > 0 ? { healAmount: totalHealed, healTarget: 'party' } : null,
      };
    },
    silence(/** @type {any} */ ctx) {
      const { targetPlayer } = ctx;
      const target = targetPlayer ?? ctx.player;
      target.castingLockoutUntil = ctx.now + (ctx.ability.interruptLockoutMs ?? 2000);
      return { hit: true };
    },
    salvation(/** @type {any} */ ctx) {
      const { player, ability, targetPlayer } = ctx;
      if (!targetPlayer || !targetPlayer.dead) return {};
      targetPlayer.hp = Math.floor((targetPlayer.maxHp ?? 100) * 0.5);
      targetPlayer.dead = false;
      targetPlayer.respawnAt = 0;
      targetPlayer.diedInPvPUntil = 0;
      return {
        combatLog: {
          healAmount: targetPlayer.hp,
          healTarget: targetPlayer.name ?? 'ally',
          revived: true,
        },
      };
    },
    smite(/** @type {any} */ ctx) {
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
          const weakenedPct = ability.weakenedPct ?? 15;
          targetMob.weakenedUntil = now + 4000;
          targetMob.weakenedMultiplier = Math.max(0, 1 - weakenedPct / 100);
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
  };
}
