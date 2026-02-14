import { getAbilitiesForClass } from '/shared/classes.js';
import { getEquippedWeapon } from '/shared/equipment.js';

const MAX_COMBAT_EVENTS = 12;
const COMBAT_EVENT_TTL_MS = 2500;

export function createCombat({
  gameState,
  ui,
  renderSystem,
  sendWithSeq,
  ctx,
}) {
  const combatEvents = [];
  let placementMode = null;

  function recordCombatEvent(event, now) {
    if (!event) return;
    combatEvents.push({ ...event, t: now });
    pruneCombatEvents(now);
  }

  function pruneCombatEvents(now) {
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

  function getAliveTargetById(targetId) {
    if (!targetId) return null;
    const mobs = gameState.getLatestMobs();
    return mobs.find((mob) => mob.id === targetId && !mob.dead && mob.hp > 0) ?? null;
  }

  function getAlivePlayerById(targetId) {
    if (!targetId) return null;
    const players = gameState.getLatestPlayers();
    const target =
      players && typeof players === 'object' ? players[targetId] : null;
    if (!target || target.dead) return null;
    return { id: targetId, ...target };
  }

  function selectTarget(selection) {
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
    const mobs = gameState.getLatestMobs().filter((mob) => !mob.dead && mob.hp > 0);
    const inRange = mobs
      .map((mob) => {
        const dx = mob.x - me.x;
        const dz = mob.z - me.z;
        return { mob, dist2: dx * dx + dz * dz };
      })
      .filter((entry) => entry.dist2 <= range2)
      .sort((a, b) => {
        if (a.dist2 !== b.dist2) return a.dist2 - b.dist2;
        return String(a.mob.id).localeCompare(String(b.mob.id));
      });
    if (!inRange.length) {
      selectTarget(null);
      return;
    }
    const currentMobId = ctx.selectedTarget?.kind === 'mob' ? ctx.selectedTarget.id : null;
    const idx = inRange.findIndex((entry) => entry.mob.id === currentMobId);
    const next = inRange[(idx + 1) % inRange.length].mob;
    selectTarget({ kind: 'mob', id: next.id });
  }

  function useAbility(slot) {
    const currentMe = ctx.currentMe;
    if (ui.isUiBlocking()) return;
    const classId = ui.getCurrentClassId(currentMe);
    const weaponDef = getEquippedWeapon(currentMe?.equipment, classId);
    const abilities = getAbilitiesForClass(classId, currentMe?.level ?? 1, weaponDef);
    const ability = abilities.find((item) => item.slot === slot);
    if (!ability) return;
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
    sendWithSeq({ type: 'action', kind: 'ability', slot });
  }

  const ABILITY_COLORS = {
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

  function handleCombatEvent(event, now, serverTime) {
    if (!event) return;
    const timestamp = Number.isFinite(serverTime) ? serverTime : gameState.getServerNow();
    recordCombatEvent(event, timestamp);

    if (event.kind === 'basic_attack') {
      renderSystem?.triggerAttack?.(event.attackerId, now, event.durationMs);
      if (event.attackType === 'ranged') {
        renderSystem.spawnProjectile(event.from, event.to, event.durationMs, now);
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
          if (event.from && event.to) renderSystem.spawnProjectile(event.from, event.to, dur, now);
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
          if (event.from && event.to) renderSystem.spawnProjectile(event.from, event.to, dur, now);
      }
      renderSystem?.triggerAttack?.(event.attackerId, now, dur);
    }
  }

  function getPlacementMode() {
    return placementMode;
  }

  function confirmPlacement(pos) {
    if (!placementMode || !pos) return;
    const { slot } = placementMode;
    placementMode = null;
    renderSystem?.setPlacementIndicator?.(false);
    sendWithSeq({ type: 'action', kind: 'ability', slot, placementX: pos.x, placementZ: pos.z });
  }

  function cancelPlacement() {
    if (!placementMode) return;
    placementMode = null;
    renderSystem?.setPlacementIndicator?.(false);
  }

  function updatePlacementCursor(pos) {
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
