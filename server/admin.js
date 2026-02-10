import { worldSnapshot } from './logic/world.js';
import { xpToNext } from '../shared/progression.js';
import { getEquippedWeapon } from '../shared/equipment.js';

export function resolveAdminPassword(env = process.env) {
  return env.ADMIN_PASSWORD ?? '1234';
}

export function serializePlayers(players) {
  const out = {};
  for (const [id, p] of players.entries()) {
    out[id] = {
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      hp: p.hp,
      maxHp: p.maxHp,
      classId: p.classId ?? null,
      level: p.level ?? 1,
      xp: p.xp ?? 0,
      xpToNext: xpToNext(p.level ?? 1),
      inv: p.inv,
      invCap: p.invCap,
      invSlots: p.invSlots,
      invStackMax: p.invStackMax,
      inventory: p.inventory,
      currencyCopper: p.currencyCopper ?? 0,
      equipment: p.equipment ?? null,
      weaponKind: getEquippedWeapon(p.equipment, p.classId)?.kind ?? null,
      dead: p.dead,
      respawnAt: p.respawnAt ?? 0,
    };
  }
  return out;
}

export function serializePlayersPublic(players) {
  const out = {};
  for (const [id, p] of players.entries()) {
    out[id] = {
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      hp: p.hp,
      maxHp: p.maxHp,
      inv: p.inv,
      currencyCopper: p.currencyCopper ?? 0,
      dead: p.dead,
      classId: p.classId ?? null,
      level: p.level ?? 1,
    };
  }
  return out;
}

export function serializePlayerPrivate(player) {
  if (!player) return null;
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
    equipment: player.equipment ?? null,
    weaponKind: getEquippedWeapon(player.equipment, player.classId)?.kind ?? null,
  };
}

export function serializeResources(resources) {
  return resources.map((r) => ({
    id: r.id,
    x: r.x,
    z: r.z,
    available: r.available,
    respawnAt: r.respawnAt,
  }));
}

export function serializeMobs(mobs) {
  return mobs.map((m) => ({
    id: m.id,
    x: m.pos.x,
    z: m.pos.z,
    state: m.state,
    targetId: m.targetId,
    level: m.level ?? 1,
    hp: m.hp ?? 0,
    maxHp: m.maxHp ?? 0,
    dead: !!m.dead,
    respawnAt: m.respawnAt ?? 0,
  }));
}

export function buildAdminState({ world, players, resources, mobs, now = Date.now() }) {
  return {
    t: now,
    world: worldSnapshot(world),
    players: serializePlayers(players),
    resources: serializeResources(resources),
    mobs: serializeMobs(mobs),
  };
}

export function getProvidedAdminPassword(req) {
  const headerPass = typeof req.get === 'function' ? req.get('x-admin-pass') : '';
  return headerPass || '';
}

export function createAdminStateHandler({ password, world, players, resources, mobs }) {
  return (req, res) => {
    const provided = getProvidedAdminPassword(req);
    if (provided !== password) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    res.json(buildAdminState({ world, players, resources, mobs }));
  };
}
