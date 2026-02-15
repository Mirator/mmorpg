/** @param {import('../abilityHandlers').AbilityHandlerDeps} d */
export function createRangerHandlers(d) {
  return {
    poison_arrow(ctx) {
      const { player, ability, targetMob, now, respawnMs, players } = ctx;
      if (!targetMob) return {};
      const { damage: rawDmg, derived, isCrit } = d.computeAbilityDamage(player, ability, now);
      const damage = d.applyPvpDamageMultiplier(rawDmg, ability, false);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
      if (d.rollHit(derived.accuracy, 0)) {
        result = d.applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
        xpGain = result.xpGain;
        leveledUp = result.leveledUp;
        hit = true;
        const ticks = ability.dotTicks ?? 6;
        const derivedStats = d.computeDerivedStats(player);
        const power = derivedStats.rangedPower ?? 0;
        const totalDotDmg = (ability.baseValue ?? 6) + power * (ability.coefficient ?? 0.2);
        const dotDmgPerTick = Math.max(1, Math.floor(totalDotDmg / ticks));
        targetMob.dotTicksRemaining = ticks;
        targetMob.dotDamagePerTick = dotDmgPerTick;
        targetMob.dotSourceId = player.id;
        targetMob.dotNextTickAt = now + d.DOT_TICK_MS;
      }
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName: d.getMobDisplayName(targetMob),
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    snare_trap(ctx) {
      const { player, ability, mobs, players, now, respawnMs, placementCenter } = ctx;
      const result = d.applyNova({
        player,
        mobs,
        radius: ability.radius ?? 2.5,
        ability,
        rootDurationMs: ability.rootDurationMs ?? 2000,
        now,
        respawnMs,
        players,
        center: placementCenter,
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
    mark_target(ctx) {
      const { player, ability, targetMob, targetPlayer } = ctx;
      const target = targetMob ?? targetPlayer;
      if (!target) return {};
      target.markedByRangerId = player.id;
      target.markedUntil = ctx.now + (ability.durationMs ?? 10000);
      target.markDamageBonusPct = ability.markDamageBonusPct ?? 10;
      return { hit: true };
    },
    disengage_shot(ctx) {
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
          const kb = ability.knockbackDistance ?? 2;
          const dx = targetPlayer.pos.x - player.pos.x;
          const dz = targetPlayer.pos.z - player.pos.z;
          const dist = Math.hypot(dx, dz) || 0.001;
          const nx = dx / dist;
          const nz = dz / dist;
          targetPlayer.pos.x += nx * kb;
          targetPlayer.pos.z += nz * kb;
        } else {
          result = d.applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
          xpGain = result.xpGain;
          leveledUp = result.leveledUp;
          const kb = ability.knockbackDistance ?? 2;
          const dx = targetMob.pos.x - player.pos.x;
          const dz = targetMob.pos.z - player.pos.z;
          const dist = Math.hypot(dx, dz) || 0.001;
          const nx = dx / dist;
          const nz = dz / dist;
          targetMob.pos.x += nx * kb;
          targetMob.pos.z += nz * kb;
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
    eagle_eye(ctx) {
      const { player, ability } = ctx;
      player.eagleEyeUntil = ctx.now + (ability.durationMs ?? 8000);
      player.critChanceBonusPct = ability.critChanceBonusPct ?? 20;
      player.pvpCritChanceBonusPct = ability.pvpCritChanceBonusPct ?? 10;
      return {};
    },
  };
}
