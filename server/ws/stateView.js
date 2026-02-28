// @ts-check
import {
  serializeResources,
  serializeMobs,
  serializeCorpses,
} from '../admin.js';
import { getPartyForPlayer } from '../logic/party.js';

/** @typedef {import('../types/domain.d.ts').Corpse} Corpse */
/** @typedef {import('../types/domain.d.ts').MobEntity} MobEntity */
/** @typedef {import('../types/domain.d.ts').PlayerMap} PlayerMap */
/** @typedef {import('../types/domain.d.ts').Position3D} Position3D */
/** @typedef {import('../types/domain.d.ts').PublicPlayersById} PublicPlayersById */
/** @typedef {import('../types/domain.d.ts').PublicStateMessage} PublicStateMessage */
/** @typedef {import('../types/domain.d.ts').ResourceNode} ResourceNode */
/** @typedef {import('../types/domain.d.ts').ServerPlayer} ServerPlayer */

/**
 * @param {{
 *   players: PlayerMap,
 *   resources: ResourceNode[],
 *   mobs: MobEntity[],
 *   corpses: Corpse[] | null | undefined,
 *   aoiRadius?: number | null,
 * }} deps
 * @returns {(player: ServerPlayer, now: number) => PublicStateMessage}
 */
export function createPublicStateBuilder({
  players,
  resources,
  mobs,
  corpses,
  aoiRadius = 80,
}) {
  const safeCorpses = Array.isArray(corpses) ? corpses : [];
  const normalizedAoiRadius = Number(aoiRadius);
  const effectiveAoiRadius = Number.isFinite(normalizedAoiRadius) ? normalizedAoiRadius : 80;
  const aoiRadius2 = effectiveAoiRadius * effectiveAoiRadius;

  /**
   * @param {Position3D | null | undefined} pos
   * @param {Position3D | null | undefined} centerPos
   * @param {number} [radius2]
   * @returns {boolean}
   */
  function isInAOI(pos, centerPos, radius2 = aoiRadius2) {
    if (!pos || !centerPos) return false;
    const dx = (pos.x ?? 0) - (centerPos.x ?? 0);
    const dz = (pos.z ?? 0) - (centerPos.z ?? 0);
    return dx * dx + dz * dz <= radius2;
  }

  /**
   * @param {unknown} dir
   * @returns {{ x: number, z: number } | null}
   */
  function normalizeFacingDir(dir) {
    if (!dir || typeof dir !== 'object') return null;
    const x = Number(/** @type {any} */ (dir).x);
    const z = Number(/** @type {any} */ (dir).z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const dist = Math.hypot(x, z);
    if (dist <= 0.0001) return null;
    return { x: x / dist, z: z / dist };
  }

  /**
   * @param {string | null | undefined} playerId
   * @returns {string[]}
   */
  function getPartyMemberIds(playerId) {
    if (!playerId) return [];
    const party = getPartyForPlayer(playerId, players);
    return party ? party.memberIds : [];
  }

  /**
   * @param {Position3D} centerPos
   * @param {string[]} [includeIds]
   * @param {number} [now]
   * @returns {PublicPlayersById}
   */
  function filterPlayersByAOI(centerPos, includeIds = [], now = Date.now()) {
    /** @type {PublicPlayersById} */
    const out = {};
    const includeSet = new Set(includeIds ?? []);
    for (const [id, p] of players.entries()) {
      if (!p?.pos) continue;
      if (includeSet.has(id) || isInAOI(p.pos, centerPos)) {
        /** @type {import('../types/domain.d.ts').PublicPlayerState} */
        const playerState = {
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
        };
        const harvest = p.harvest;
        if (
          harvest &&
          Number.isFinite(harvest.endsAt) &&
          harvest.endsAt > now
        ) {
          playerState.harvesting = true;
          playerState.harvestType = harvest.resourceType ?? null;
        }
        const facingDir = normalizeFacingDir(p.lastMoveDir);
        if (facingDir) {
          playerState.dirX = facingDir.x;
          playerState.dirZ = facingDir.z;
        }
        out[id] = playerState;
      }
    }
    return out;
  }

  /**
   * @param {Position3D} centerPos
   * @returns {ResourceNode[]}
   */
  function filterResourcesByAOI(centerPos) {
    return resources.filter((r) =>
      isInAOI({ x: r.x, z: r.z }, centerPos)
    );
  }

  /**
   * @param {Position3D} centerPos
   * @returns {MobEntity[]}
   */
  function filterMobsByAOI(centerPos) {
    return mobs.filter((m) =>
      isInAOI(m?.pos ?? { x: m.x, z: m.z }, centerPos)
    );
  }

  /**
   * @param {Position3D} centerPos
   * @returns {Corpse[]}
   */
  function filterCorpsesByAOI(centerPos) {
    return safeCorpses.filter((c) => {
      const pos = c.pos;
      return isInAOI(pos, centerPos);
    });
  }

  /**
   * @param {ServerPlayer} player
   * @param {number} now
   * @returns {PublicStateMessage}
   */
  return function buildPublicStateForPlayer(player, now) {
    const pos = player?.pos ?? { x: 0, y: 0, z: 0 };
    const partyIds = getPartyMemberIds(player?.id);
    const filteredPlayers = filterPlayersByAOI(pos, partyIds, now);
    const filteredResources = filterResourcesByAOI(pos);
    const filteredMobs = filterMobsByAOI(pos);
    const filteredCorpses = filterCorpsesByAOI(pos);
    return {
      type: 'state',
      t: now,
      players: filteredPlayers,
      resources: serializeResources(filteredResources),
      mobs: serializeMobs(filteredMobs),
      corpses: serializeCorpses(filteredCorpses),
    };
  };
}
