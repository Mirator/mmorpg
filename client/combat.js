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
    const cost = ability.resourceCost ?? 0;
    if (cost > 0 && (currentMe?.resource ?? 0) < cost) return;
    const localCooldownDuration = ability.windUpMs ?? ability.cooldownMs ?? 0;
    ui.setLocalCooldown(slot, now + localCooldownDuration);
    ui.updateAbilityBar(currentMe, now);
    sendWithSeq({ type: 'action', kind: 'ability', slot });
  }

  function handleCombatEvent(event, now, serverTime) {
    if (!event || event.kind !== 'basic_attack') return;
    const timestamp = Number.isFinite(serverTime) ? serverTime : gameState.getServerNow();
    recordCombatEvent(event, timestamp);
    renderSystem?.triggerAttack?.(event.attackerId, now, event.durationMs);
    if (event.attackType === 'ranged') {
      renderSystem.spawnProjectile(event.from, event.to, event.durationMs, now);
    } else {
      renderSystem.spawnSlash(event.from, event.to, event.durationMs, now);
    }
  }

  return {
    useAbility,
    selectTarget,
    cycleTarget,
    handleCombatEvent,
    pruneCombatEvents,
    getTargetSelectRange,
    getCombatEvents: () => combatEvents,
  };
}
