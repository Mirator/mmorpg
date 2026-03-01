// @ts-check
const MAX_COMBAT_EVENTS = 12;
const COMBAT_EVENT_TTL_MS = 2500;

export function createCombat(/** @type {any} */ {
  gameState,
  ui,
  renderSystem,
  sendWithSeq,
  ctx,
}) {
  const /** @type {any} */ combatEvents = [];
  let /** @type {any} */ placementMode = null;

  function recordCombatEvent(/** @type {any} */ event, /** @type {any} */ now) {
    if (!event) return;
    combatEvents.push({ ...event, t: now });
    pruneCombatEvents(now);
  }

  function pruneCombatEvents(/** @type {any} */ now) {
    while (combatEvents.length > MAX_COMBAT_EVENTS) {
      combatEvents.shift();
    }
    let idx = 0;
    while (idx < combatEvents.length && now - combatEvents[idx].t > COMBAT_EVENT_TTL_MS) {
      idx += 1;
    }
    if (idx > 0) {
      combatEvents.splice(0, idx);
    }
  }

  function getTargetSelectRange() {
    const config = gameState.getConfigSnapshot();
    return config?.combat?.targetSelectRange ?? 25;
  }

  function getAliveTargetById(/** @type {any} */ targetId) {
    if (!targetId) return null;
    const mobs = gameState.getLatestMobs();
    return mobs.find((/** @type {any} */ mob) => mob.id === targetId && !mob.dead && mob.hp > 0) ?? null;
  }

  function getAlivePlayerById(/** @type {any} */ targetId) {
    if (!targetId) return null;
    const players = gameState.getLatestPlayers();
    const target =
      players && typeof players === 'object' ? players[targetId] : null;
    if (!target || target.dead) return null;
    return { id: targetId, ...target };
  }

  function selectTarget(/** @type {any} */ selection) {
    if (!selection || !selection.id || !selection.kind) {
      ctx.selectedTarget = null;
      sendWithSeq({ type: 'targetSelect', targetId: null, targetKind: null });
      return;
    }

    ctx.selectedTarget = { kind: selection.kind, id: selection.id };
    if (selection.kind === 'mob') {
      sendWithSeq({ type: 'targetSelect', targetId: selection.id, targetKind: 'mob' });
    } else if (selection.kind === 'player') {
      sendWithSeq({ type: 'targetSelect', targetId: selection.id, targetKind: 'player' });
    } else {
      sendWithSeq({ type: 'targetSelect', targetId: null, targetKind: null });
    }
  }

  function cycleTarget() {
    const me = gameState.getLocalPlayer();
    if (!me) return;
    const range = getTargetSelectRange();
    const range2 = range * range;
    const mobs = gameState.getLatestMobs().filter((/** @type {any} */ mob) => !mob.dead && mob.hp > 0);
    const inRange = mobs
      .map((/** @type {any} */ mob) => {
        const dx = mob.x - me.x;
        const dz = mob.z - me.z;
        return { mob, dist2: dx * dx + dz * dz };
      })
      .filter((/** @type {any} */ entry) => entry.dist2 <= range2)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => {
        if (a.dist2 !== b.dist2) return a.dist2 - b.dist2;
        return String(a.mob.id).localeCompare(String(b.mob.id));
      });
    if (!inRange.length) {
      selectTarget(null);
      return;
    }
    const currentMobId = ctx.selectedTarget?.kind === 'mob' ? ctx.selectedTarget.id : null;
    const idx = inRange.findIndex((/** @type {any} */ entry) => entry.mob.id === currentMobId);
    const next = inRange[(idx + 1) % inRange.length].mob;
    selectTarget({ kind: 'mob', id: next.id });
  }

  function useAbility(/** @type {any} */ slot) {
    const currentMe = ctx.currentMe;
    if (ui.isUiBlocking()) return;
    const ability = ui.getAbilityForSlot?.(currentMe, slot) ?? null;
    if (!ability) return;
    const actionPayload = ui.getAbilityActionPayload?.(currentMe, slot);
    if (!actionPayload) return;
    if (placementMode && placementMode.slot !== slot) {
      cancelPlacement();
    }
    if (ability.requirePlacement) {
      placementMode = { slot, ability };
      renderSystem?.setPlacementIndicator?.(true, ability.radius ?? 2.5, ability.placementRange ?? 10);
      return;
    }
    if (ability.targetType === 'targeted') {
      if (ability.targetKind === 'player') {
        if (ctx.selectedTarget?.kind === 'player') {
          const target = getAlivePlayerById(ctx.selectedTarget.id);
          if (!target || !currentMe) return;
          const dx = target.x - currentMe.x;
          const dz = target.z - currentMe.z;
          if (dx * dx + dz * dz > (ability.range ?? 0) * (ability.range ?? 0)) {
            return;
          }
        }
      } else {
        const mobTargetId = ctx.selectedTarget?.kind === 'mob' ? ctx.selectedTarget.id : null;
        const target = getAliveTargetById(mobTargetId);
        if (!target || !currentMe) return;
        const dx = target.x - currentMe.x;
        const dz = target.z - currentMe.z;
        if (dx * dx + dz * dz > (ability.range ?? 0) * (ability.range ?? 0)) {
          return;
        }
      }
    }
    const now = gameState.getServerNow();
    const localCooldown = ui.getLocalCooldown(slot);
    const serverCooldown =
      ability.id === 'basic_attack'
        ? currentMe?.attackCooldownUntil ?? 0
        : currentMe?.abilityCooldowns?.[ability.id] ?? 0;
    if (Math.max(localCooldown, serverCooldown) > now) return;
    if (!ability.exemptFromGCD && (currentMe?.globalCooldownUntil ?? 0) > now) return;
    const cost = ability.resourceCost ?? 0;
    if (cost > 0 && (currentMe?.resource ?? 0) < cost) return;
    const localCooldownDuration = ability.windUpMs ?? ability.cooldownMs ?? 0;
    ui.setLocalCooldown(slot, now + localCooldownDuration);
    ui.updateAbilityBar(currentMe, now);
    sendWithSeq({ type: 'action', kind: 'ability', ...actionPayload });
  }

  const /** @type {any} */ ABILITY_COLORS = {
    frost_nova: 0x88ccff,
    ground_slam: 0x8b7355,
    meteor: 0xff6633,
    snare_trap: 0x66cc44,
    flame_wave: 0xff6633,
    cleave: 0xffe2a8,
    whirlwind: 0xffe2a8,
    prayer_of_light: 0xffdd66,
    firebolt: 0xff6633,
    smite: 0xffdd66,
    poison_arrow: 0x66cc44,
    disengage_shot: 0x9fe3ff,
    aimed_shot: 0x9fe3ff,
    arcane_missiles: 0xaa66ff,
    rapid_fire: 0x9fe3ff,
    berserk: 0xff6633,
    defensive_stance: 0x88aaff,
    shield_wall: 0x88aaff,
    ice_barrier: 0x88ccff,
    eagle_eye: 0xffdd66,
  };

  function sameEntityId(/** @type {any} */ a, /** @type {any} */ b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }

  function resolveImpactAnchor(/** @type {any} */ impact, /** @type {any} */ event) {
    if (impact && Number.isFinite(impact.x) && Number.isFinite(impact.z)) {
      return { x: impact.x, y: Number.isFinite(impact.y) ? impact.y : 0, z: impact.z };
    }
    const fallback = event?.to ?? event?.center ?? event?.from;
    if (!fallback || !Number.isFinite(fallback.x) || !Number.isFinite(fallback.z)) return null;
    return {
      x: fallback.x,
      y: Number.isFinite(fallback.y) ? fallback.y : 0,
      z: fallback.z,
    };
  }

  function getRelevantImpacts(/** @type {any} */ event) {
    const impacts = Array.isArray(event?.impacts) ? event.impacts : [];
    if (!impacts.length) return [];
    const localId = ctx.playerId;
    const outgoing = sameEntityId(event?.attackerId, localId);
    const /** @type {any} */ relevant = [];
    for (const impact of impacts) {
      if (!impact || !Number.isFinite(impact.amount) || impact.amount <= 0) continue;
      const incoming =
        impact.targetKind === 'player' && sameEntityId(impact.targetId, localId);
      if (!outgoing && !incoming) continue;
      relevant.push({
        ...impact,
        textKind: impact.kind === 'heal'
          ? 'heal'
          : incoming
            ? 'damage_taken'
            : 'damage_dealt',
      });
    }
    return relevant;
  }

  function hasImpactPayload(/** @type {any} */ event) {
    if (!Array.isArray(event?.impacts)) return false;
    return event.impacts.some(
      (/** @type {any} */ impact) => impact && Number.isFinite(impact.amount) && impact.amount > 0
    );
  }

  function handleCombatEvent(/** @type {any} */ event, /** @type {any} */ now, /** @type {any} */ serverTime) {
    if (!event) return;
    const timestamp = Number.isFinite(serverTime) ? serverTime : gameState.getServerNow();
    recordCombatEvent(event, timestamp);
    if (event.event === 'mobAttackTelegraph') {
      const mob = getAliveTargetById(event.mobId);
      const center = mob?.pos
        ? { x: mob.pos.x ?? mob.x ?? 0, y: mob.pos.y ?? mob.y ?? 0, z: mob.pos.z ?? mob.z ?? 0 }
        : null;
      if (center) {
        renderSystem?.spawnNova?.(center, 1.15, 0xff7755, event.durationMs ?? 450, now);
      }
      return;
    }
    const relevantImpacts = getRelevantImpacts(event);
    for (const impact of relevantImpacts) {
      const anchor = resolveImpactAnchor(impact, event);
      if (!anchor) continue;
      renderSystem?.spawnCombatText?.(
        anchor,
        {
          kind: impact.textKind,
          amount: Math.floor(impact.amount),
          isCrit: !!impact.isCrit,
        },
        now
      );
      renderSystem?.spawnHitConfirm?.(
        anchor,
        {
          kind: impact.textKind,
          isCrit: !!impact.isCrit,
        },
        now
      );
    }
    const shouldSpawnProjectileImpact = hasImpactPayload(event) || event.hit !== false;

    if (event.kind === 'basic_attack') {
      renderSystem?.triggerAttack?.(event.attackerId, now, event.durationMs);
      if (event.attackType === 'ranged') {
        renderSystem.spawnProjectile(event.from, event.to, event.durationMs, now, {
          spawnImpactOnEnd: shouldSpawnProjectileImpact,
        });
      } else {
        renderSystem.spawnSlash(event.from, event.to, event.durationMs, now);
      }
      return;
    }

    if (event.kind === 'ability' && event.abilityId && renderSystem) {
      const color = ABILITY_COLORS[event.abilityId] ?? 0xaaaaaa;
      const dur = event.durationMs ?? 400;
      switch (event.effectType) {
        case 'slash':
          if (event.to) renderSystem.spawnSlash(event.from, event.to, dur, now);
          break;
        case 'projectile':
          if (event.from && event.to) {
            renderSystem.spawnProjectile(event.from, event.to, dur, now, {
              spawnImpactOnEnd: shouldSpawnProjectileImpact,
            });
          }
          break;
        case 'cone':
          if (event.from && event.direction) {
            renderSystem.spawnCone(
              event.from,
              event.direction,
              event.coneDegrees ?? 90,
              event.range ?? 5,
              color,
              dur,
              now
            );
          }
          break;
        case 'nova':
          if (event.center) {
            renderSystem.spawnNova(event.center, event.radius ?? 2.5, color, dur, now);
          }
          break;
        case 'healRing':
          if (event.center) {
            renderSystem.spawnHealRing(event.center, event.radius ?? 5, color, dur, now);
          }
          break;
        case 'buffAura':
          if (event.center) renderSystem.spawnBuffAura(event.center, color, dur, now);
          break;
        case 'dashTrail':
          if (event.from && event.to) renderSystem.spawnDashTrail(event.from, event.to, dur, now);
          break;
        default:
          if (event.from && event.to) {
            renderSystem.spawnProjectile(event.from, event.to, dur, now, {
              spawnImpactOnEnd: shouldSpawnProjectileImpact,
            });
          }
      }
      renderSystem?.triggerAttack?.(event.attackerId, now, dur);
    }
  }

  function getPlacementMode() {
    return placementMode;
  }

  function confirmPlacement(/** @type {any} */ pos) {
    if (!placementMode || !pos) return;
    const { slot, ability } = placementMode;
    placementMode = null;
    renderSystem?.setPlacementIndicator?.(false);
    sendWithSeq({
      type: 'action',
      kind: 'ability',
      slot,
      ...(ability?.id ? { abilityId: ability.id } : {}),
      placementX: pos.x,
      placementZ: pos.z,
    });
  }

  function cancelPlacement() {
    if (!placementMode) return;
    placementMode = null;
    renderSystem?.setPlacementIndicator?.(false);
  }

  function updatePlacementCursor(/** @type {any} */ pos) {
    if (!placementMode || !pos || !renderSystem?.updatePlacementIndicator) return;
    const me = ctx.currentMe;
    const range = placementMode.ability?.placementRange ?? 10;
    const dist = me
      ? Math.hypot(pos.x - (me.x ?? 0), pos.z - (me.z ?? 0))
      : Infinity;
    renderSystem.updatePlacementIndicator(pos, dist <= range);
  }

  return {
    useAbility,
    selectTarget,
    cycleTarget,
    handleCombatEvent,
    pruneCombatEvents,
    getTargetSelectRange,
    getCombatEvents: () => combatEvents,
    getPlacementMode,
    confirmPlacement,
    cancelPlacement,
    updatePlacementCursor,
  };
}
