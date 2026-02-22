# Admin Web Pages Specification

This document defines the implemented admin web pages, their HTTP contracts, and operational behavior.

Primary sources:

- [admin/index.html](../../admin/index.html)
- [admin/admin.js](../../admin/admin.js)
- [admin/map.html](../../admin/map.html)
- [admin/map.js](../../admin/map.js)
- [server/http.js](../../server/http.js)
- [server/admin.js](../../server/admin.js)
- [server/mapConfig.js](../../server/mapConfig.js)
- [server/config.js](../../server/config.js)
- [server/createServer.js](../../server/createServer.js)

## 1. Scope and Entry Points

Admin web pages:

- `GET /admin` serves the live world dashboard.
- `GET /admin/map` serves the map editor.

Admin APIs used by those pages:

- `GET /admin/state`
- `GET /admin/map-config`
- `PUT /admin/map-config`

All admin API requests must include `x-admin-pass`.

## 2. Access and Auth Model

## 2.1 Server password resolution

`getServerConfig` resolves admin password from `ADMIN_PASSWORD`.

- On localhost hosts (`127.0.0.1` or `localhost`), password defaults to `1234` if `ADMIN_PASSWORD` is unset.
- On non-localhost hosts, `ADMIN_PASSWORD` is required; startup throws if missing.

Admin handlers compare request header `x-admin-pass` against the resolved server password.
Query-parameter fallback is not accepted.

## 2.2 Browser-side password handling

Both admin pages:

- Require entering password in a form before API usage.
- Keep password in memory only (module variable in page script).
- Do not persist password to local storage/cookies/session storage.
- Require re-entry after page refresh.

## 3. Admin Dashboard (`/admin`)

## 3.1 Polling and connection behavior

- Unlock form submit stores password and starts polling.
- Poll interval is `1000ms`.
- Each poll sends `GET /admin/state` with `x-admin-pass`.
- On `401`, UI shows invalid-password status and polling stops.
- On transient fetch failure/non-401 failure, UI shows offline status and continues polling.

## 3.2 Display model

The page shows:

- Summary cards: player count, resource count, mob count, last update.
- World summary: map size, harvest radius, base summary, obstacle count.
- Paginated tables for players, resources, and mobs (`PAGE_SIZE = 20`).

Current player rows include identity/class/combat/lifecycle/position/inventory/currency fields from serialized admin state.

## 3.3 Status states

Implemented status transitions include:

- `Status: waiting for password`
- `Status: connecting...`
- `Status: connected`
- `Status: invalid password`
- `Status: offline`

## 4. Map Editor (`/admin/map`)

## 4.1 Unlock, load, reload, and save flow

- Unlock submits password and calls `GET /admin/map-config`.
- On successful load, Reload and Save buttons are enabled.
- Reload re-fetches map config from server and replaces in-memory editor state.
- Save sends current in-memory config to `PUT /admin/map-config`.

Save status messages include:

- `Loaded map config.`
- `Unsaved changes`
- `Reloaded map config.`
- `Saved successfully. Restart server to apply.`
- `Save failed.` / `Reload failed.`

## 4.2 Editable sections and fields

Editor sections cover:

- Map settings (`mapSize`)
- Base (`x`, `y`, `z`, `radius`)
- Spawn points
- Obstacles
- Structures (`id`, `kind`, `x`, `y`, `z`, `rotation`, `colliderRadius`, `collides`)
- Resource nodes (`id`, `type`, `x`, `y`, `z`, optional `respawnMs`)
- Vendors (`id`, `name`, `x`, `y`, `z`)
- Mob spawns (`id`, `mobType`, `x`, `y`, `z`, `aggressive`, optional `level`, optional `levelVariance`)

Type dropdown options are sourced from shared definitions:

- `MOB_TYPES`, `RESOURCE_TYPE_LIST` from `shared/entityTypes.js`
- `STRUCTURE_KIND_LIST` from `shared/mapConfig.js`

## 4.3 Canvas interaction model

- Click entity on canvas to select it.
- Drag selected entity to move it.
- Sidebar supports precise field editing.
- Add/Remove actions are available per list section.
- Positions are clamped to map bounds; circles/colliders clamp by radius.
- If `mapYMin`/`mapYMax` are present in config, drag updates clamp `y` into that range.

## 4.4 Validation error behavior

On save validation failure:

- API returns `400` with `{ error: 'Validation failed', details: string[] }`.
- UI renders `details` as an error list.

On auth failure:

- API returns `401`.
- UI sets status to invalid password and disables map actions.

## 5. HTTP Endpoint Contracts

## 5.1 `GET /admin/state`

Auth:

- Requires header `x-admin-pass`.

Success (`200`):

- Returns `{ t, world, players, resources, mobs }`.
- `world` is a world snapshot.
- `players`, `resources`, `mobs` are serialized admin views from runtime state.

Errors:

- `401` `{ error: 'Unauthorized' }` on missing/wrong password.

## 5.2 `GET /admin/map-config`

Auth:

- Requires header `x-admin-pass`.

Success (`200`):

- Returns normalized map config JSON from configured map file path.

Errors:

- `401` `{ error: 'Unauthorized' }` on missing/wrong password.
- `500` `{ error }` on file read/parse/load failure.

## 5.3 `PUT /admin/map-config`

Auth:

- Requires header `x-admin-pass`.

Body:

- Full map config object.

Success (`200`):

- Returns `{ ok: true, config }` with normalized/saved config.

Errors:

- `401` `{ error: 'Unauthorized' }` on missing/wrong password.
- `400` `{ error: 'Validation failed', details: string[] }` on schema/constraint failures.
- `500` `{ error }` on write/persistence failures.

## 6. Persistence and Apply Semantics

- Map config save is immediate to disk.
- Save is atomic (`write tmp` then `rename`).
- Config file path resolves from `MAP_CONFIG_PATH`; default is `server/data/world-map.json`.
- Runtime world uses map config loaded at server startup.
- Saved map changes do not hot-reload into the running world; restart server to apply.

## 7. Troubleshooting

- Invalid password in UI:
  - Ensure `x-admin-pass` value matches current server admin password.
  - On non-localhost host, ensure `ADMIN_PASSWORD` is set before server start.
- `Status: offline`:
  - Verify server is running and reachable on configured `HOST`/`PORT`.
- Save failed with validation details:
  - Fix listed constraints (duplicate IDs, out-of-bounds points, invalid `mobType`/`type`/`kind`, invalid radii).
- Startup failure about admin password:
  - For non-localhost `HOST`, set `ADMIN_PASSWORD` explicitly.
- Map load/save server error:
  - Verify `MAP_CONFIG_PATH` points to a valid writable location and JSON is parseable.

## 8. Related Documentation

- [Auth and Persistence](./spec_auth_persistence.md)
- [World Entities](../world/spec_world_entities.md)
- [Game Design](../game-design/GDD.md)
