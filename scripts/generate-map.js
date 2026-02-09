import fs from 'node:fs';
import path from 'node:path';
import { createSimulatedWorld } from '../server/logic/world.js';
import { createMobs } from '../server/logic/mobs.js';
import { WORLD_CONFIG } from '../shared/config.js';
import { MAP_CONFIG_VERSION } from '../shared/mapConfig.js';

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const world = createSimulatedWorld();
const mobRng = mulberry32(WORLD_CONFIG.seed + 1);
const mobs = createMobs(world.mobCount, world, { random: mobRng });

const mapConfig = {
  version: MAP_CONFIG_VERSION,
  mapSize: world.mapSize,
  base: {
    x: world.base.x,
    z: world.base.z,
    radius: world.base.radius,
  },
  spawnPoints: world.spawnPoints.map((point) => ({
    x: point.x,
    z: point.z,
  })),
  obstacles: world.obstacles.map((obs) => ({
    x: obs.x,
    z: obs.z,
    radius: obs.r,
  })),
  resourceNodes: world.resourceNodes.map((node) => ({
    id: node.id,
    x: node.x,
    z: node.z,
  })),
  vendors: world.vendors.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    x: vendor.x,
    z: vendor.z,
  })),
  mobSpawns: mobs.map((mob) => ({
    id: mob.id,
    x: mob.pos.x,
    z: mob.pos.z,
  })),
};

const outPath = path.resolve(
  process.cwd(),
  'server',
  'data',
  'world-map.json'
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(mapConfig, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath}`);
