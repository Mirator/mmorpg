// @ts-check

export function distance2(/** @type {any} */ a, /** @type {any} */ b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function toCombatPoint(/** @type {any} */ pos) {
  if (!pos) return null;
  const x = Number(pos.x);
  const z = Number(pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const y = Number(pos.y);
  return Number.isFinite(y) ? { x, y, z } : { x, z };
}

export function buildImpact(/** @type {any} */ { kind, amount, isCrit, targetId, targetKind, pos }) {
  if ((kind !== 'damage' && kind !== 'heal') || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const point = toCombatPoint(pos);
  if (!point) return null;
  return {
    kind,
    amount: Math.max(0, Math.floor(amount)),
    ...(kind === 'damage' && isCrit ? { isCrit: true } : {}),
    ...(targetId ? { targetId: String(targetId) } : {}),
    ...(targetKind === 'mob' || targetKind === 'player' ? { targetKind } : {}),
    ...point,
  };
}

export function normalizeImpacts(/** @type {any} */ impacts) {
  if (!Array.isArray(impacts)) return [];
  const /** @type {any} */ normalized = [];
  for (const impact of impacts) {
    const safe = buildImpact({
      kind: impact?.kind,
      amount: impact?.amount,
      isCrit: impact?.isCrit,
      targetId: impact?.targetId,
      targetKind: impact?.targetKind,
      pos: impact,
    });
    if (safe) normalized.push(safe);
  }
  return normalized;
}

export function makeDamageImpactForTarget(/** @type {any} */ target, /** @type {any} */ amount, /** @type {any} */ isCrit, /** @type {any} */ targetId, /** @type {any} */ targetKind) {
  return buildImpact({
    kind: 'damage',
    amount,
    isCrit,
    targetId,
    targetKind,
    pos: target?.pos ?? target,
  });
}

export function makeHealImpactForTarget(/** @type {any} */ target, /** @type {any} */ amount, /** @type {any} */ targetId, /** @type {any} */ targetKind) {
  return buildImpact({
    kind: 'heal',
    amount,
    targetId,
    targetKind,
    pos: target?.pos ?? target,
  });
}

export function normalizeDirection(/** @type {any} */ dir) {
  if (!dir) return null;
  const x = Number(dir.x);
  const z = Number(dir.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const dist = Math.hypot(x, z);
  if (dist <= 0.0001) return null;
  return { x: x / dist, z: z / dist };
}

export function getDirectionBetweenPoints(/** @type {any} */ from, /** @type {any} */ to) {
  if (!from || !to) return null;
  const dx = (to.x ?? 0) - (from.x ?? 0);
  const dz = (to.z ?? 0) - (from.z ?? 0);
  return normalizeDirection({ x: dx, z: dz });
}

export function resolveCastFacingDirection(/** @type {any} */ { player, abilityDir, targetMob, targetPlayer, placementCenter }) {
  return (
    normalizeDirection(abilityDir) ??
    getDirectionBetweenPoints(player?.pos, targetMob?.pos) ??
    getDirectionBetweenPoints(player?.pos, targetPlayer?.pos) ??
    getDirectionBetweenPoints(player?.pos, placementCenter)
  );
}

export function applyFacingDirection(/** @type {any} */ player, /** @type {any} */ direction) {
  const dir = normalizeDirection(direction);
  if (!player || !dir) return;
  player.lastMoveDir = dir;
}
