// @ts-check
import { worldSnapshot } from './logic/world.js';
import { xpToNext } from '../shared/progression.js';
import { getEquippedWeapon } from '../shared/equipment.js';
import { computeRawAttributes, computeDerivedStats } from '../shared/attributes.js';
import { getContractSnapshotForPlayer } from '../shared/contracts.js';

/** @typedef {import('./types/domain.d.ts').Corpse} Corpse */
/** @typedef {import('./types/domain.d.ts').HttpRequestLike} HttpRequestLike */
/** @typedef {import('./types/domain.d.ts').HttpResponseLike} HttpResponseLike */
/** @typedef {import('./types/domain.d.ts').MobEntity} MobEntity */
/** @typedef {import('./types/domain.d.ts').PlayerMap} PlayerMap */
/** @typedef {import('./types/domain.d.ts').ResourceNode} ResourceNode */
/** @typedef {import('./types/domain.d.ts').SerializedCorpse} SerializedCorpse */
/** @typedef {import('./types/domain.d.ts').SerializedMob} SerializedMob */
/** @typedef {import('./types/domain.d.ts').SerializedResource} SerializedResource */
/** @typedef {import('./types/domain.d.ts').ServerPlayer} ServerPlayer */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function resolveAdminPassword(env = process.env) {
  const value = env.ADMIN_PASSWORD;
  return (typeof value === 'string' && value.trim().length > 0) ? value.trim() : null;
}

/**
 * @param {PlayerMap} players
 * @returns {Record<string, {
 *   x: number, y: number, z: number, hp: number, maxHp: number,
 *   classId: string | null, level: number, xp: number, xpToNext: number,
 *   inv: number, invCap: number, invSlots: number, invStackMax: number,
 *   inventory: import('./types/domain.d.ts').Inventory, currencyCopper: number,
 *   equipment: Record<string, unknown> | null, weaponKind: string | null,
 *   dead: boolean, respawnAt: number
 * }>}
 */
export function serializePlayers(players) {
  /** @type {Record<string, {
   *   x: number, y: number, z: number, hp: number, maxHp: number,
   *   classId: string | null, level: number, xp: number, xpToNext: number,
   *   inv: number, invCap: number, invSlots: number, invStackMax: number,
   *   inventory: import('./types/domain.d.ts').Inventory, currencyCopper: number,
   *   equipment: Record<string, unknown> | null, weaponKind: string | null,
   *   dead: boolean, respawnAt: number
   * }>} */
  const out = {};
  for (const [id, p] of players.entries()) {
    if (!p.pos) continue;
    out[id] = {
      x: p.pos.x,
      y: p.pos.y ?? 0,
      z: p.pos.z,
      hp: p.hp ?? 0,
      maxHp: p.maxHp ?? 0,
      classId: p.classId ?? null,
      level: p.level ?? 1,
      xp: p.xp ?? 0,
      xpToNext: xpToNext(p.level ?? 1),
      inv: p.inv ?? 0,
      invCap: p.invCap ?? 0,
      invSlots: p.invSlots ?? 0,
      invStackMax: p.invStackMax ?? 0,
      inventory: p.inventory ?? [],
      currencyCopper: p.currencyCopper ?? 0,
      equipment: p.equipment ?? null,
      weaponKind: getEquippedWeapon(p.equipment, p.classId)?.kind ?? null,
      dead: Boolean(p.dead),
      respawnAt: p.respawnAt ?? 0,
    };
  }
  return out;
}

/**
 * @param {PlayerMap} players
 * @returns {import('./types/domain.d.ts').PublicPlayersById}
 */
export function serializePlayersPublic(players) {
  /** @type {import('./types/domain.d.ts').PublicPlayersById} */
  const out = {};
  for (const [id, p] of players.entries()) {
    if (!p.pos) continue;
    out[id] = {
      x: p.pos.x,
      y: p.pos.y ?? 0,
      z: p.pos.z,
      hp: p.hp ?? 0,
      maxHp: p.maxHp ?? 0,
      inv: p.inv ?? 0,
      currencyCopper: p.currencyCopper ?? 0,
      dead: Boolean(p.dead),
      classId: p.classId ?? null,
      level: p.level ?? 1,
      name: p.name ?? null,
      duelOpponentId: p.duelOpponentId ?? null,
    };
  }
  return out;
}

/**
 * @param {ServerPlayer | null | undefined} player
 * @returns {Record<string, unknown> | null}
 */
export function serializePlayerPrivate(player) {
  if (!player) return null;
  const attributes = computeRawAttributes(player);
  const derivedStats = computeDerivedStats(player);
  const contractSnapshot = getContractSnapshotForPlayer(player, Date.now());
  return {
    invCap: player.invCap,
    invSlots: player.invSlots,
    invStackMax: player.invStackMax,
    inventory: player.inventory,
    currencyCopper: player.currencyCopper ?? 0,
    respawnAt: player.respawnAt ?? 0,
    classId: player.classId ?? null,
    level: player.level ?? 1,
    xp: player.xp ?? 0,
    xpToNext: xpToNext(player.level ?? 1),
    attackCooldownUntil: player.attackCooldownUntil ?? 0,
    targetId: player.targetId ?? null,
    targetKind: player.targetKind ?? null,
    resourceType: player.resourceType ?? null,
    resourceMax: player.resourceMax ?? 0,
    resource: player.resource ?? 0,
    abilityCooldowns: player.abilityCooldowns ?? {},
    globalCooldownUntil: player.globalCooldownUntil ?? 0,
    cast: player.cast
      ? {
          id: player.cast.id,
          endsAt: player.cast.endsAt ?? 0,
          startedAt: player.cast.startedAt ?? 0,
          targetId: player.cast.targetId ?? null,
          firedTicks: player.cast.firedTicks ?? 0,
        }
      : null,
    harvest: player.harvest
      ? {
          resourceId: player.harvest.resourceId,
          resourceType: player.harvest.resourceType,
          startedAt: player.harvest.startedAt ?? 0,
          endsAt: player.harvest.endsAt ?? 0,
        }
      : null,
    moveSpeedMultiplier: player.moveSpeedMultiplier ?? 1,
    walking: !!player.keys?.walk,
    equipment: player.equipment ?? null,
    weaponKind: getEquippedWeapon(player.equipment, player.classId)?.kind ?? null,
    attributes,
    derivedStats,
    partyId: player.partyId ?? null,
    duelOpponentId: player.duelOpponentId ?? null,
    activeContracts: contractSnapshot.activeContracts,
    contractOffersByVendor: contractSnapshot.offersByVendor,
    professionMasteries: player.professionMasteries ?? null,
    knownRecipes: player.knownRecipes ?? [],
  };
}

/**
 * @param {ResourceNode[]} resources
 * @returns {SerializedResource[]}
 */
export function serializeResources(resources) {
  return resources.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y ?? 0,
    z: r.z,
    type: r.type ?? 'crystal',
    available: Boolean(r.available),
    respawnAt: r.respawnAt ?? 0,
  }));
}

/**
 * @param {Corpse[] | null | undefined} corpses
 * @returns {SerializedCorpse[]}
 */
export function serializeCorpses(corpses) {
  if (!Array.isArray(corpses)) return [];
  return corpses.map((c) => ({
    id: c.id,
    playerId: c.playerId,
    x: c.pos.x,
    y: c.pos.y ?? 0,
    z: c.pos.z,
    itemCount: (c.inventory ?? []).filter((slot) => slot !== null).length,
    expiresAt: c.expiresAt ?? 0,
  }));
}

/**
 * @param {MobEntity[]} mobs
 * @returns {SerializedMob[]}
 */
export function serializeMobs(mobs) {
  return mobs.map((m) => ({
    id: m.id,
    x: m.pos?.x ?? m.x ?? 0,
    y: m.pos?.y ?? m.y ?? 0,
    z: m.pos?.z ?? m.z ?? 0,
    state: typeof m.state === 'string' ? m.state : null,
    targetId: typeof m.targetId === 'string' ? m.targetId : null,
    level: m.level ?? 1,
    hp: m.hp ?? 0,
    maxHp: m.maxHp ?? 0,
    dead: !!m.dead,
    respawnAt: m.respawnAt ?? 0,
    mobType: m.mobType ?? 'orc',
  }));
}

/**
 * @param {{
 *   world: unknown,
 *   players: PlayerMap,
 *   resources: ResourceNode[],
 *   mobs: MobEntity[],
 *   now?: number
 * }} params
 */
export function buildAdminState({ world, players, resources, mobs, now = Date.now() }) {
  return {
    t: now,
    world: worldSnapshot(world),
    players: serializePlayers(players),
    resources: serializeResources(resources),
    mobs: serializeMobs(mobs),
  };
}

/**
 * @param {{
 *   isAuthorized: (req: HttpRequestLike) => boolean,
 *   world: unknown,
 *   players: PlayerMap,
 *   resources: ResourceNode[],
 *   mobs: MobEntity[]
 * }} params
 * @returns {(req: HttpRequestLike, res: HttpResponseLike) => void}
 */
export function createAdminStateHandler({ isAuthorized, world, players, resources, mobs }) {
  return (req, res) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    res.json(buildAdminState({ world, players, resources, mobs }));
  };
}
