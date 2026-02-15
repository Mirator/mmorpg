/** @param {import('../abilityHandlers').AbilityHandlerDeps} d */
export function createMageHandlers(d) {
  return {
    firebolt(ctx) {
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
        } else {
          result = d.applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
          xpGain = result.xpGain;
          leveledUp = result.leveledUp;
          if (result.killed && player.classId === 'mage') {
            const refund = Math.floor((ability.resourceCost ?? 0) * 0.2);
            if (refund > 0) {
              player.resource = d.clampResource(player, (player.resource ?? 0) + refund);
            }
          }
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
    flame_wave(ctx) {
      const { player, ability, mobs, players, now, respawnMs, abilityDir } = ctx;
      const result = d.applyCleave({
        player,
        mobs,
        range: ability.range ?? 5,
        coneDegrees: ability.coneDegrees ?? 90,
        ability,
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
    ice_barrier(ctx) {
      const { player, ability } = ctx;
      const derived = d.computeDerivedStats(player);
      const absorb = Math.max(0, Math.floor((ability.baseValue ?? 25) + derived.magicPower * (ability.coefficient ?? 0.9)));
      player.absorbAmount = absorb;
      player.absorbUntil = ctx.now + 60000;
      return {};
    },
    blink(ctx) {
      const { player, ability, world, abilityDir } = ctx;
      const dir = abilityDir ?? (player.lastMoveDir ?? { x: 0, z: 1 });
      const dist = ability.dashDistance ?? 4;
      const nextPos = {
        x: player.pos.x + dir.x * dist,
        y: player.pos.y ?? 0,
        z: player.pos.z + dir.z * dist,
      };
      player.pos = d.applyCollisions(nextPos, world, 0.6);
      return {};
    },
    counterspell(ctx) {
      const { player, ability, targetMob, targetPlayer } = ctx;
      const target = targetMob ?? targetPlayer;
      if (!target) return {};
      target.castingLockoutUntil = ctx.now + (ability.interruptLockoutMs ?? 2000);
      return { hit: true };
    },
    meteor(ctx) {
      const { player, ability, mobs, players, now, respawnMs, placementCenter } = ctx;
      const result = d.applyNova({
        player,
        mobs,
        radius: ability.radius ?? 4,
        ability,
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
    frost_nova(ctx) {
      const { player, ability, mobs, players, now, respawnMs } = ctx;
      const result = d.applyNova({
        player,
        mobs,
        players,
        radius: ability.radius ?? 0,
        ability,
        slowPct: ability.slowPct ?? 0,
        slowDurationMs: ability.durationMs ?? 3000,
        now,
        respawnMs,
      });
      if (result.killed > 0 && player.classId === 'mage') {
        const refund = Math.floor((ability.resourceCost ?? 0) * 0.15 * result.killed);
        if (refund > 0) {
          player.resource = d.clampResource(player, (player.resource ?? 0) + refund);
        }
      }
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
  };
}
