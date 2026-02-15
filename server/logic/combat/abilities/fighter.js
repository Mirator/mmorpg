/** @param {import('../abilityHandlers').AbilityHandlerDeps} d */
export function createFighterHandlers(d) {
  return {
    power_strike(ctx) {
      const { player, ability, targetMob, targetPlayer, mobs, players, now, respawnMs, preResource } = ctx;
      const target = targetMob ?? targetPlayer;
      if (!target) return {};
      const isPvP = !!targetPlayer;
      const { damage: baseDmg, derived, isCrit } = d.computeAbilityDamage(player, ability, now, isPvP);
      const scaledDmg = preResource > 80 ? Math.round(baseDmg * 1.2) : baseDmg;
      const damage = d.applyPvpDamageMultiplier(scaledDmg, ability, isPvP);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
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
    cleave(ctx) {
      const { player, mobs, players, now, respawnMs, abilityDir } = ctx;
      const result = d.applyCleave({
        player,
        mobs,
        range: ctx.ability.range ?? 0,
        coneDegrees: ctx.ability.coneDegrees ?? 120,
        ability: ctx.ability,
        now,
        respawnMs,
        direction: abilityDir,
        players,
      });
      return {
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        hit: result.hit,
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
    roll_back(ctx) {
      const { player, ability, world, abilityDir } = ctx;
      const dir = abilityDir;
      const distance = ability.dashDistance ?? 0;
      const nextPos = {
        x: player.pos.x - dir.x * distance,
        y: player.pos.y ?? 0,
        z: player.pos.z - dir.z * distance,
      };
      player.pos = d.applyCollisions(nextPos, world, 0.6);
      player.target = null;
      player.slowImmuneUntil = ctx.now + (ability.durationMs ?? 1000);
      return {};
    },
    berserk(ctx) {
      const { player, ability } = ctx;
      player.berserkUntil = ctx.now + (ability.durationMs ?? 6000);
      player.damageDealtMultiplier = ability.damageDealtMultiplier ?? 1.25;
      player.pvpDamageDealtMultiplier = ability.pvpDamageDealtMultiplier ?? 1.15;
      return {};
    },
    whirlwind(ctx) {
      const { player, mobs, players, now, respawnMs, abilityDir } = ctx;
      const result = d.applyCleave({
        player,
        mobs,
        range: ctx.ability.range ?? 2.5,
        coneDegrees: 360,
        ability: ctx.ability,
        now,
        respawnMs,
        direction: abilityDir,
        players,
      });
      return {
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        hit: result.hit,
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
    execute(ctx) {
      const { player, ability, targetMob, targetPlayer, mobs, players, now, respawnMs } = ctx;
      const target = targetMob ?? targetPlayer;
      if (!target) return {};
      const isPvP = !!targetPlayer;
      const hpPct = (target.hp ?? 0) / Math.max(1, target.maxHp ?? 1);
      const { damage: baseDmg, derived, isCrit } = d.computeAbilityDamage(player, ability, now, isPvP);
      const executeBonus = hpPct < (ability.executeThresholdPct ?? 30) / 100 ? 1.5 : 1;
      const damage = d.applyPvpDamageMultiplier(Math.floor(baseDmg * executeBonus), ability, isPvP);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
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
    blood_rage(ctx) {
      const { player, ability } = ctx;
      const consumedRage = ctx.preResource ?? 0;
      player.bloodRageUntil = ctx.now + (ability.durationMs ?? 6000);
      player.bloodRageDamageMultiplier = 1 + consumedRage * 0.02;
      return {};
    },
    interrupting_strike(ctx) {
      const { player, ability, targetMob, targetPlayer, mobs, players, now, respawnMs } = ctx;
      const target = targetMob ?? targetPlayer;
      if (!target) return {};
      const isPvP = !!targetPlayer;
      const { damage: rawDmg, derived, isCrit } = d.computeAbilityDamage(player, ability, now, isPvP);
      const damage = d.applyPvpDamageMultiplier(rawDmg, ability, isPvP);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
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
    avatar_of_war(ctx) {
      const { player, ability } = ctx;
      player.avatarOfWarUntil = ctx.now + (ability.durationMs ?? 10000);
      player.physicalPowerMultiplier = ability.physicalPowerMultiplier ?? 1.3;
      player.pvpPhysicalPowerMultiplier = ability.pvpPhysicalPowerMultiplier ?? 1.2;
      return {};
    },
  };
}
