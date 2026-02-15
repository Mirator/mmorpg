# World Entities Specification

This document describes how locations, mobs, resources, vendors, and related world entities are configured and used in the game. It serves as the single source of truth for entity types and map config schema.

---

## 1. Overview

The game has a **single world/location** (no zones or multiple maps). All world entities are defined in one map config file and loaded at server startup.

**Config flow:**
1. `server/data/world-map.json` (or path from `MAP_CONFIG_PATH` env) is loaded at server startup
2. `shared/mapConfig.js` validates and normalizes the config
3. `server/logic/world.js` builds the runtime world from the config
4. Mobs and resources are created from `world.mobSpawns` and `world.resourceNodes`

---

## 2. Map Config Schema

**Source:** [server/data/world-map.json](../../server/data/world-map.json)  
**Validation:** [shared/mapConfig.js](../../shared/mapConfig.js)  
**Entity types registry:** [shared/entityTypes.js](../../shared/entityTypes.js)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | number | yes | Must be 1 |
| mapSize | number | yes | Half-extent; map bounds are ±mapSize/2 on x/z |
| mapYMin | number | no | Optional Y clamp (min) |
| mapYMax | number | no | Optional Y clamp (max) |
| base | object | yes | Safe zone center |
| base.x | number | yes | X coordinate |
| base.y | number | no | Y coordinate (default 0) |
| base.z | number | yes | Z coordinate |
| base.radius | number | yes | Radius of safe zone |
| spawnPoints | array | yes | Player respawn positions |
| spawnPoints[].x, .y?, .z | number | yes | Position |
| obstacles | array | yes | Block movement and pathing |
| obstacles[].x, .y?, .z | number | yes | Center position |
| obstacles[].radius | number | yes | Obstacle radius (alias: r) |
| resourceNodes | array | yes | Harvestable nodes |
| resourceNodes[].id | string | yes | Unique ID (e.g. r1, r2) |
| resourceNodes[].x, .y?, .z | number | yes | Position |
| resourceNodes[].type | string | no | One of: crystal, ore, herb, tree, flower (default: crystal) |
| resourceNodes[].respawnMs | number | no | Per-node respawn override (ms). If absent, uses type default |
| vendors | array | yes | NPC vendors |
| vendors[].id | string | yes | Unique ID |
| vendors[].name | string | yes | Display name |
| vendors[].x, .y?, .z | number | yes | Position |
| vendors[].buyItems | array | no | Per-vendor buy catalog: `[{ kind, priceCopper? }]`. If absent, uses global `VENDOR_BUY_ITEMS` |
| mobSpawns | array | yes | Mob spawn points |
| mobSpawns[].id | string | yes | Unique ID (e.g. m1, m2) |
| mobSpawns[].x, .y?, .z | number | yes | Position |
| mobSpawns[].mobType | string | no | One of: orc, demon, yeti, tribal, wolf, fox, bull, stag, dummy (default: orc) |
| mobSpawns[].aggressive | boolean | no | If false, mob never aggroes (default: true) |
| mobSpawns[].level | number | no | Predetermined level (1–35). If absent, derived from distance |
| mobSpawns[].levelVariance | number | no | If > 0, randomize level ± variance (clamped 1–35). 0 = fixed |

---

## 3. Mob Types

**Registry:** `MOB_TYPES` in [shared/entityTypes.js](../../shared/entityTypes.js)

| mobType | 3D Model Path | Source |
|---------|---------------|--------|
| orc | `/assets/monsters/Orc.gltf` | Ultimate Monsters |
| demon | `/assets/monsters/Demon.gltf` | Ultimate Monsters |
| yeti | `/assets/monsters/Yeti.gltf` | Ultimate Monsters |
| tribal | `/assets/monsters/Tribal.gltf` | Ultimate Monsters |
| wolf | `/assets/animals/Wolf.gltf` | Ultimate Animated Animals |
| fox | `/assets/animals/Fox.gltf` | Ultimate Animated Animals |
| bull | `/assets/animals/Bull.gltf` | Ultimate Animated Animals |
| stag | `/assets/animals/Stag.gltf` | Ultimate Animated Animals |
| dummy | `/assets/environment/Practice_Dummy.glb` | Training dummy (1 HP, 0 damage, stationary) |

**Usage:**
- Map config `mobSpawns[].mobType` selects which model spawns at each point
- Server: [server/logic/mobs.js](../../server/logic/mobs.js) — `createMobs`, `createMobsFromSpawns`
- Client: [client/world.js](../../client/world.js) — `getMobPrototype`, `hydrateMobMesh`
- Assets: [client/assetPaths.js](../../client/assetPaths.js) — `ASSET_PATHS.monsters`

**Per-mob-type stats** (`MOB_STATS` in [shared/entityTypes.js](../../shared/entityTypes.js), merged with `MOB_CONFIG` defaults):

| mobType | attackDamageBase | attackDamagePerLevel | speed | wanderSpeed | respawnMs |
|---------|------------------|----------------------|-------|-------------|-----------|
| orc | 6 | 2 | 2.2 | 1.4 | 10,000 |
| demon | 8 | 2.5 | 2.4 | 1.2 | 12,000 |
| yeti | 10 | 3 | 1.8 | 1.0 | 15,000 |
| tribal | 5 | 2 | 2.6 | 1.6 | 8,000 |
| wolf | 4 | 1.5 | 3.0 | 2.0 | 6,000 |
| fox | 3 | 1 | 2.8 | 1.8 | 5,000 |
| bull | 12 | 3 | 1.6 | 0.8 | 18,000 |
| stag | 5 | 2 | 2.4 | 1.5 | 9,000 |
| dummy | 0 | 0 | 0 | 0 | 3,000 |

Use `getMobStats(mobType)` to resolve stats. Dummy: 1 HP, no damage, no movement, no aggro.

---

## 4. Resource Types

**Registry:** `RESOURCE_TYPES` in [shared/entityTypes.js](../../shared/entityTypes.js) (economy data from [shared/economy.js](../../shared/economy.js))

| type | itemKind | itemName | Sell Price | Respawn (ms) | 3D Model |
|------|----------|----------|------------|--------------|----------|
| crystal | crystal | Crystal | 10c | 15,000 | `/assets/resources/Crystal1.glb` |
| ore | ore | Iron Ore | 15c | 20,000 | `/assets/resources/Crystal2.glb` |
| herb | herb | Healing Herb | 12c | 12,000 | `/assets/resources/Crystal3.glb` |
| tree | wood | Wood | 8c | 25,000 | `/assets/resources/Crystal1.glb` |
| flower | flower | Flower | 10c | 10,000 | `/assets/resources/Crystal3.glb` |

**Usage:**
- Map config `resourceNodes[].type` selects harvest output, visual, and respawn time
- Server: [server/logic/resources.js](../../server/logic/resources.js) — `tryHarvest` uses `getResourceConfig(type)` and `getResourceRespawnMs(type)` from economy
- Client: [client/world.js](../../client/world.js) — resource mesh by type
- Assets: [client/assetPaths.js](../../client/assetPaths.js) — `ASSET_PATHS.resourceNodes`

**Harvest config** (from `RESOURCE_CONFIG` and `RESOURCE_TYPES`):
- harvestRadius: 2.2 (global)
- respawnMs: per resource type (see table above)

---

## 5. Vendors

Vendors are placed in the map config. Each has:
- `id`, `name`, `x`, `y?`, `z`
- `buyItems` (optional): per-vendor buy catalog `[{ kind, priceCopper? }]`. If absent, uses global `VENDOR_BUY_ITEMS`
- All vendors use the same model: [client/assetPaths.js](../../client/assetPaths.js) `vendorModel`
- Interact radius: 2.5 (from `VENDOR_CONFIG`)

At runtime, `resolveVendorBuyItems(vendor)` in [shared/economy.js](../../shared/economy.js) resolves the full catalog; world vendors include `buyItems` in the snapshot for the client.

---

## 6. Config Sources Summary

| Config | Source | Purpose |
|--------|--------|---------|
| Map layout | world-map.json | Base, spawns, obstacles, resource nodes, vendors, mob spawns |
| Entity type lists | shared/entityTypes.js | MOB_TYPES, RESOURCE_TYPES — validation and UI |
| Economy (harvest output) | shared/economy.js | RESOURCE_TYPES (itemKind, itemName, sellPrice) |
| Runtime defaults | shared/config.js | WORLD_CONFIG, MOB_CONFIG, RESOURCE_CONFIG, VENDOR_CONFIG |
| 3D model paths | client/assetPaths.js | ASSET_PATHS.monsters, ASSET_PATHS.resourceNodes |

---

## 7. Data Flow

```
world-map.json
    → loadMapConfigSync (server/mapConfig.js)
    → validateMapConfig (shared/mapConfig.js) — uses MOB_TYPES, RESOURCE_TYPES from entityTypes
    → createWorldFromConfig (server/logic/world.js)
    → world { base, obstacles, resourceNodes, mobSpawns, vendors }
    → createMobsFromSpawns(world.mobSpawns) — server/logic/mobs.js
    → createResources(world.resourceNodes) — server/logic/resources.js
```

---

## 8. Admin Map Editor

**URL:** `http://localhost:3000/admin/map`

The map editor supports:
- Editing map size, base position/radius
- Adding/removing spawn points, obstacles, resource nodes, vendors, mob spawns
- **resourceNodes:** id, x, y, z, **type** (dropdown: crystal, ore, herb, tree, flower)
- **mobSpawns:** id, x, y, z, **mobType** (dropdown: orc, demon, yeti, tribal, wolf, fox, bull, stag)

Options for type and mobType come from [shared/entityTypes.js](../../shared/entityTypes.js).

---

## 9. Adding New Entity Types

**New mob type:**
1. Add to `MOB_TYPES` in shared/entityTypes.js
2. Add entry to `MOB_STATS` in shared/entityTypes.js (damage, speed, respawnMs, radius)
3. Add model path to `ASSET_PATHS.monsters` in client/assetPaths.js
4. Map config validation will accept it; admin editor will show it in dropdown

**New resource type:**
1. Add to `RESOURCE_TYPES` in shared/economy.js (itemKind, itemName, sellPrice) — entityTypes derives RESOURCE_TYPE_LIST from it
2. Add model path to `ASSET_PATHS.resourceNodes` in client/assetPaths.js
3. Update VENDOR_SELL_PRICES in economy.js if sellable
