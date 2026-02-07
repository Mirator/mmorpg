import { worldSnapshot } from './logic/world.js';

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
      inv: p.inv,
      invCap: p.invCap,
      score: p.score,
      dead: p.dead,
      respawnAt: p.respawnAt ?? 0,
    };
  }
  return out;
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
  const queryPass =
    typeof req.query?.password === 'string' ? req.query.password : '';
  return headerPass || queryPass || '';
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
