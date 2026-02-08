const WORLD_SEED = 1337;

const MAP_SIZE = 400;
const BASE_RADIUS = 9;
const OBSTACLE_COUNT = 12;
const RESOURCE_COUNT = 80;
const MOB_COUNT = 8;

const HARVEST_RADIUS = 2.2;
const RESOURCE_RESPAWN_MS = 15_000;

const PLAYER_MAX_HP = 100;
const PLAYER_SPEED = 3;
const PLAYER_INV_SLOTS = 20;
const PLAYER_INV_STACK_MAX = 20;
const PLAYER_INV_CAP = PLAYER_INV_SLOTS * PLAYER_INV_STACK_MAX;
const VENDOR_INTERACT_RADIUS = 2.5;

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRange(rng, min, max) {
  return min + (max - min) * rng();
}

function distance2(x1, z1, x2, z2) {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return dx * dx + dz * dz;
}

function farEnoughFromObstacles(x, z, obstacles, minDist) {
  for (const obs of obstacles) {
    if (distance2(x, z, obs.x, obs.z) < (obs.r + minDist) ** 2) {
      return false;
    }
  }
  return true;
}

function generateObstacles(rng) {
  const half = MAP_SIZE / 2;
  const obstacles = [];
  const maxTries = OBSTACLE_COUNT * 30;
  let tries = 0;

  while (obstacles.length < OBSTACLE_COUNT && tries < maxTries) {
    tries += 1;
    const r = randomRange(rng, 5, 14);
    const x = randomRange(rng, -half + r, half - r);
    const z = randomRange(rng, -half + r, half - r);
    const distFromBase = Math.sqrt(distance2(x, z, 0, 0));
    if (distFromBase < BASE_RADIUS + r + 8) continue;
    if (!farEnoughFromObstacles(x, z, obstacles, 8)) continue;
    obstacles.push({ x, z, r });
  }

  return obstacles;
}

function generateResourceNodes(rng, obstacles) {
  const half = MAP_SIZE / 2;
  const nodes = [];
  const maxTries = RESOURCE_COUNT * 40;
  let tries = 0;

  while (nodes.length < RESOURCE_COUNT && tries < maxTries) {
    tries += 1;
    const x = randomRange(rng, -half + 4, half - 4);
    const z = randomRange(rng, -half + 4, half - 4);
    const distFromBase = Math.sqrt(distance2(x, z, 0, 0));
    if (distFromBase < BASE_RADIUS + 6) continue;
    if (!farEnoughFromObstacles(x, z, obstacles, 6)) continue;
    nodes.push({ id: `r${nodes.length + 1}`, x, z });
  }

  return nodes;
}

function generateSpawnPoints() {
  const points = [];
  const count = 6;
  const radius = BASE_RADIUS * 0.7;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    points.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
    });
  }
  return points;
}

export function createWorld() {
  const rng = mulberry32(WORLD_SEED);
  const obstacles = generateObstacles(rng);
  const resourceNodes = generateResourceNodes(rng, obstacles);
  const spawnPoints = generateSpawnPoints();
  const base = { x: 0, z: 0, radius: BASE_RADIUS };
  const vendors = [
    {
      id: 'vendor-1',
      name: 'General Vendor',
      x: base.x + base.radius + 4,
      z: base.z - 2,
    },
  ];

  return {
    mapSize: MAP_SIZE,
    base,
    obstacles,
    resourceNodes,
    spawnPoints,
    mobCount: MOB_COUNT,
    harvestRadius: HARVEST_RADIUS,
    resourceRespawnMs: RESOURCE_RESPAWN_MS,
    playerMaxHp: PLAYER_MAX_HP,
    playerSpeed: PLAYER_SPEED,
    playerInvCap: PLAYER_INV_CAP,
    playerInvSlots: PLAYER_INV_SLOTS,
    playerInvStackMax: PLAYER_INV_STACK_MAX,
    vendors,
    vendorInteractRadius: VENDOR_INTERACT_RADIUS,
  };
}

export function worldSnapshot(world) {
  return {
    mapSize: world.mapSize,
    base: world.base,
    obstacles: world.obstacles,
    harvestRadius: world.harvestRadius,
    playerSpeed: world.playerSpeed,
    playerInvSlots: world.playerInvSlots,
    playerInvStackMax: world.playerInvStackMax,
    vendors: world.vendors ?? [],
    vendorInteractRadius: world.vendorInteractRadius ?? VENDOR_INTERACT_RADIUS,
  };
}
