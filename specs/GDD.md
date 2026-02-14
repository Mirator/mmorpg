**Title**
MMORPG Game Design Document (Current Functionality)

**Purpose**
This document describes the game as it exists today in the codebase. It is meant to capture current functionality for extension in future work. It does not include planned features, speculative design, or dev/testing hooks.

**Overview**
Genre: lightweight top-down multiplayer RPG with real-time combat, harvesting, and trading.
Core loop: sign in → create/select character → move around world → harvest resources → sell to vendor → fight mobs → gain XP and level up.
Multiplayer: all connected players share the same world state and see each other in real time.

**World And Map**
The world is a square map centered at (0, 0) with a village base at the center.
Source of truth: the map config JSON file loaded at server startup. The server provides a world snapshot to clients on WebSocket welcome and during state updates.
Default map values (from config):
- Map size: 400
- Base radius: 9
- Obstacles: 12 static circular obstacles
- Resource nodes: 80 static nodes
- Mob spawns: determined by map config (8 random in simulated mode)
- Vendors: list from map config
Spawn points: a ring around the base.
Obstacles: circular, block movement and mob pathing.
Resource nodes: fixed points that can be harvested.
Mob spawns: fixed points in configured maps or procedurally placed in simulated mode.

Map editor: `http://localhost:3000/admin/map`
- Requires admin password.
- Edits map config (base, spawn points, obstacles, resource nodes, vendors, mob spawns).
- Validates on save and returns errors if invalid.
- Saved changes require server restart to apply to the live world.

**Player Character**
Core stats:
- Position: x, z
- HP and Max HP
- Inventory: slot-based with stack counts
- Currency: copper total
- Class, level, XP
- Equipment: weapon, offhand, head, chest, legs, feet

Movement:
- WASD uses camera-relative axes and cancels active click-to-move targets.
- Click-to-move sets a target point on the ground plane.
- Movement is constrained to map bounds and pushed away from obstacles.

Death and respawn:
- HP ≤ 0 triggers death.
- Inventory is cleared on death.
- Respawn occurs after 5 seconds at the next spawn point.
- On respawn, HP is restored to max and attack cooldown is reset.

**Interaction Systems**
Harvesting:
- Press E near an available resource node.
- Harvest radius: 2.2 units.
- Item gained: `Crystal` (kind `crystal`, count 1).
- Resource node becomes unavailable and respawns after 15 seconds.
- Harvest is blocked if inventory cannot accept the item.

Vendor interaction:
- Press E near a vendor within 2.5 units to open dialog.
- Trade panel opens from dialog and allows selling.
- Sell by dragging an item to the vendor drop zone.
- Only items with a configured price can be sold.
- Buy tab exists in UI but no buying is implemented.

**Inventory And Equipment**
Inventory:
- Slots: 20
- Stack max per item: 20
- Total capacity: slots × stack max
- Drag-and-drop swaps slots (client-side) and sends swap to server.

Equipment:
- Slots: weapon, offhand, head, chest, legs, feet
- Items are restricted by prefix rules per slot.
- Drag-and-drop swaps between inventory and equipment or between equipment slots.

Default weapons by class:
- Guardian: Training Sword
- Fighter: Training Sword
- Ranger: Training Bow
- Priest: Training Staff
- Mage: Apprentice Wand

**Economy**
Currency model:
- Copper is the stored base unit.
- 100 copper = 1 silver, 100 silver = 1 gold.

Sell prices:
- Crystal: 10 copper

Selling rules:
- Item removed from inventory.
- Currency added to player total.

**Combat And Progression**
Basic attack:
- Ability slot: 1
- Damage: 10
- Cooldown: 900 ms
- Range and attack type derived from equipped weapon or class default.

Mobs:
- States: idle, wander, chase, dead
- Aggro radius: 12 units
- Leash radius: 18 units
- Attack range: 1.4 units
- Chase speed: 2.2 units/sec
- Wander speed: 1.4 units/sec
- Attack cooldown: 900 ms
- Damage per hit: 6 + (2 × mob level)
- Respawn after 10 seconds

Mob levels:
- Level scales with distance from base.
- Max level: 30
- Max HP formula: 20 + 8 × level

XP and leveling:
- XP is awarded on mob kill.
- XP gain uses mob level vs player level with a smooth multiplier (clamp 0.25–1.75).
- Level cap: 30
- XP to next level uses a quadratic curve (XP_K × lvl²).

**UI And UX**
HUD:
- Level, XP, HP
- Inventory count
- Coins
- Respawn timer

Menus:
- Sign in and sign up forms
- Character list with last played indicator
- Character creation with class selection
- Character deletion with confirmation

Panels and controls:
- Inventory: `I`
- Skills: `K`
- Interact (harvest or vendor): `E`
- Trade tab switch: `B` (buy), `S` (sell)
- Fullscreen toggle: `F`

Prompts and feedback:
- Contextual prompt for harvesting or vendor interaction.
- Event toasts for XP, level-up, harvesting, and sales.
- Damage flash when HP decreases.
- Combat VFX for melee slashes and ranged projectiles.

**Networking And Sync**
Architecture:
- HTTP for auth and character management.
- WebSocket for real-time game state.

Server timing:
- Game loop: 60 Hz
- Broadcast to clients: 20 Hz

Client sync:
- Interpolates between server snapshots.
- Predicts local movement based on input.
- Uses server time offset to align UI timers.

Message flow:
1. Client connects and sends `hello`.
2. Server sends `welcome` with snapshot and config.
3. Server continues to send `state` and `me` messages.
4. Server sends `combatEvent` for VFX.

**Persistence And Accounts**
Accounts and sessions:
- Accounts stored in Postgres via Prisma.
- Sessions stored in Postgres with 30-day TTL.
- Auth via HTTP-only session cookie; bearer token supported for HTTP API.

Characters:
- Character names are globally unique (case-insensitive).
- Character state stored as JSON with versioned migrations.
- Player state is persisted on interval and on disconnect.

**Admin Tools**
Admin dashboard:
- URL: `/admin`
- Auth: `x-admin-pass` header
- Live polling every 1s
- Paginated tables for players, resources, mobs

Map editor:
- URL: `/admin/map`
- Auth: `x-admin-pass` header
- Edit map entities and save to config
- Validation errors displayed in UI

**Appendix A: WebSocket Protocol**
Client → server messages:
- `hello` `{ type: 'hello', seq? }`
- `input` `{ type: 'input', keys: { w, a, s, d }, seq? }`
- `moveTarget` `{ type: 'moveTarget', x, z, seq? }`
- `action` (interact) `{ type: 'action', kind: 'interact', seq? }`
- `action` (ability) `{ type: 'action', kind: 'ability', slot, seq? }`
- `classSelect` `{ type: 'classSelect', classId, seq? }`
- `inventorySwap` `{ type: 'inventorySwap', from, to, seq? }`
- `equipSwap` `{ type: 'equipSwap', fromType, fromSlot, toType, toSlot, seq? }`
- `vendorSell` `{ type: 'vendorSell', vendorId, slot, seq? }`

Server → client messages:
- `welcome`
  - `{ type: 'welcome', id, snapshot, config }`
  - `snapshot` contains world, players, resources, mobs
- `state`
  - `{ type: 'state', t, players, resources, mobs }`
  - `players` are public-only fields
- `me`
  - `{ type: 'me', t, id, data }`
  - `data` contains private fields (inventory, currency, equipment, XP)
- `combatEvent`
  - `{ type: 'combatEvent', t, events: [ ... ] }`

**Appendix B: HTTP API**
Auth:
- `POST /api/auth/signup` `{ username, password }` → `{ account, token? }`
- `POST /api/auth/login` `{ username, password }` → `{ account, token? }`
- `POST /api/auth/logout` → `{ ok: true }`

Characters (requires auth):
- `GET /api/characters` → `{ characters }`
- `POST /api/characters` `{ name, classId }` → `{ character }`
- `DELETE /api/characters/:id` → `{ ok: true }`

Admin (requires `x-admin-pass`):
- `GET /admin/state` → `{ world, players, resources, mobs }`
- `GET /admin/map-config` → full map config JSON
- `PUT /admin/map-config` → `{ ok: true, config }` or validation errors

**Appendix C: Config And Defaults**
Shared config defaults:
- World
  - seed: 1337
  - mapSize: 400
  - baseRadius: 9
  - obstacleCount: 12
  - resourceCount: 80
  - mobCount: 8
- Resource
  - harvestRadius: 2.2
  - respawnMs: 15000
- Player
  - maxHp: 100
  - speed: 3
  - invSlots: 20
  - invStackMax: 20
- Vendor
  - interactRadius: 2.5
- Mob
  - respawnMs: 10000
  - attackDamageBase: 6
  - attackDamagePerLevel: 2
  - radius: 0.8
- Combat
  - basicAttackBaseValue: 10
  - basicAttackCoefficient: 0.4
  - basicAttackCooldownMs: 900

Server runtime defaults:
- tickHz: 60
- broadcastHz: 20
- playerRadius: 0.6
- respawnMs: 5000

Map config schema (default path: `server/data/world-map.json`):
- `version` (number)
- `mapSize` (number)
- `base` { x, z, radius }
- `spawnPoints` [ { x, z } ]
- `obstacles` [ { x, z, radius } ]
- `resourceNodes` [ { id, x, z } ]
- `vendors` [ { id, name, x, z } ]
- `mobSpawns` [ { id, x, z } ]
