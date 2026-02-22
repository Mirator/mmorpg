# Admin Web Pages Specification

This document defines the implemented phase-2 admin experience, page routes, and HTTP contracts.

Primary sources:

- [admin/index.html](../../admin/index.html)
- [admin/admin.js](../../admin/admin.js)
- [admin/map.html](../../admin/map.html)
- [admin/map.js](../../admin/map.js)
- [admin/patches.html](../../admin/patches.html)
- [admin/patches.js](../../admin/patches.js)
- [admin/assets.html](../../admin/assets.html)
- [admin/assets.js](../../admin/assets.js)
- [admin/events.html](../../admin/events.html)
- [admin/events.js](../../admin/events.js)
- [admin/nav.html](../../admin/nav.html)
- [admin/nav.js](../../admin/nav.js)
- [admin/collab.html](../../admin/collab.html)
- [admin/collab.js](../../admin/collab.js)
- [admin/playtest.html](../../admin/playtest.html)
- [admin/playtest.js](../../admin/playtest.js)
- [admin/designer-api.js](../../admin/designer-api.js)
- [admin/designer-store.js](../../admin/designer-store.js)
- [admin/admin-alias.js](../../admin/admin-alias.js)
- [shared/mapDesignerState.js](../../shared/mapDesignerState.js)
- [server/mapDesignerState.js](../../server/mapDesignerState.js)
- [server/http.js](../../server/http.js)
- [server/mapConfig.js](../../server/mapConfig.js)

## 1. Scope and Entry Points

Implemented admin pages:

- `GET /admin` - Dashboard
- `GET /admin/map` - Zone Canvas
- `GET /admin/patches` - Patch Manager
- `GET /admin/assets` - Asset Manager
- `GET /admin/events` - Event and Trigger Editor
- `GET /admin/nav` - Navmesh Editor
- `GET /admin/collab` - Collaboration
- `GET /admin/playtest` - Preview and Playtest

All pages are in-place replacements on the existing `/admin*` route space.

### 1.1 Visual Theme

Admin pages are styled with the same "Kingdom Ember" fantasy direction used by the player menu/loading flow:

- warm dark surfaces and leather-neutral panels
- primary accent: aged gold (`#c89b3c`)
- secondary accent: moss green (`#6f9f62`)
- warning/error/success tones aligned to fantasy palette tokens

Theme tokens live in `admin/style.css`, and all admin module pages plus canvas overlays consume those colors.

## 2. Access, Auth, and Alias

### 2.1 Password auth

Admin password source is unchanged:

- localhost (`127.0.0.1`/`localhost`): default `1234` if `ADMIN_PASSWORD` is unset
- non-localhost: `ADMIN_PASSWORD` is required at startup

### 2.2 Browser unlock behavior

- Password is entered once via `POST /admin/auth/unlock`.
- Server issues an HttpOnly admin session cookie (`/admin` path scope).
- Session is shared across admin pages/tabs in the same browser session.
- Session has 30-minute sliding inactivity timeout.
- A `Lock` button on admin pages calls `POST /admin/auth/logout` to invalidate the session immediately.
- Legacy scripted access via `x-admin-pass` remains supported.

### 2.3 Alias behavior

- Alias is prompted after unlock on admin pages.
- Alias persists in localStorage for convenience.
- All mutating phase-2 admin requests include `x-admin-alias`.
- Server fallback alias is `"admin"` if the header is missing.

## 3. Data and Persistence

### 3.1 Existing map-config persistence (unchanged)

- `GET /admin/map-config`
- `PUT /admin/map-config`
- File path from `MAP_CONFIG_PATH` (default `server/data/world-map.json`)
- Atomic write (`.tmp` + rename)

### 3.2 New designer-state persistence

- File path from `MAP_DESIGNER_STATE_PATH` (default `server/data/world-map.designer.json`)
- Bootstrap on missing file with default root state
- Atomic write (`.tmp` + rename)
- Root model:
  - `{ version, revision, zones }`
- Phase-2 zone key:
  - `world-map`

Zone state includes:

- `prefabs`
- `navAreas`
- `triggers`
- `paths`
- `lightingRegions`
- `comments`
- `locks` (zone + per-layer)
- `patches`
- `audit`
- `lastPublishedPatchId`

## 4. Dashboard (`/admin`)

Dashboard behavior:

- polls admin state on 1s cadence after unlock
- renders single-zone shell row (`world-map`)
- quick actions to Zone Canvas and module screens
- metrics:
  - players, player density, last activity from `/admin/state` + map config
  - errors from recent failed audit entries
  - last deploy from most recent published patch timestamp

## 5. Zone Canvas (`/admin/map`)

Canvas includes:

- top toolbar, left asset browser, center map viewport, right inspector, mini-map/readout
- layer controls: visibility, lock, opacity
- undo/redo and manual save controls

Modes:

- functional: `Edit`, `Spawn`, `Nav`, `Trigger`, `Path`, `Lighting`, `Playtest`

Layers:

- functional overlays: `terrain`, `props`, `spawns`, `navmesh`, `triggers`, `lighting`, `debug`

Persistence and drafts:

- map + designer edits track unsaved state
- `Save Draft` stores local combined draft
- `Save` persists `map-config` and revisioned `designer-state`

Concurrency semantics:

- client checks locks before mutation
- server enforces locks and returns `423` on conflicts
- revisioned designer saves require `expectedRevision` and return `409` on mismatch

## 6. Functional Module Pages

### 6.1 Patch Manager (`/admin/patches`)

- patch list + detail pane
- create patch with dependency list and snapshot source
- transitions: request approval, approve, publish, rollback
- dependency checks before publish
- JSON diff and visual diff panel
- publish/rollback response displays restart-required notice

### 6.2 Asset Manager (`/admin/assets`)

- prefab registry CRUD
- `assetPath` validation (`/assets/` prefix)
- edit bumps prefab version
- prefabs integrate into Zone Canvas templates

### 6.3 Event and Trigger (`/admin/events`)

- trigger list and graph/list visualization
- region editing and reference bindings
- validation panel for malformed trigger data and missing refs

### 6.4 Navmesh (`/admin/nav`)

- nav area table + mini map editor
- walk/run cost editing
- deterministic client-side "bake preview" path overlay

### 6.5 Collaboration (`/admin/collab`)

- strict zone/layer lock controls
- pinned comments create/resolve/reopen
- audit timeline with alias/type/action filters

### 6.6 Playtest (`/admin/playtest`)

- preview launcher via iframe (client URL from API)
- telemetry panel from admin state
- explicit note: preview reflects saved state; runtime apply requires publish + restart

## 7. HTTP Endpoint Contracts

All endpoints below require either:

- valid admin session cookie, or
- valid `x-admin-pass` header (legacy compatibility)

### 7.0 Admin session auth endpoints

- `POST /admin/auth/unlock` body `{ password }` -> `{ ok: true }` + admin session cookie
- `GET /admin/auth/session` -> `{ ok: true }` when authorized
- `POST /admin/auth/logout` -> `{ ok: true }` and clears admin session cookie

### 7.1 Existing APIs (unchanged)

- `GET /admin/state`
- `GET /admin/map-config`
- `PUT /admin/map-config`

### 7.2 Designer-state APIs

- `GET /admin/designer-state?zone=world-map`
  - response: `{ zoneKey, revision, zoneState }`
- `PUT /admin/designer-state?zone=world-map`
  - body: `{ expectedRevision, zoneState }`
  - `200`: `{ revision, zoneState }`
  - `409`: `{ error: 'Revision conflict', revision }`
  - lock conflicts return `423`

### 7.3 Prefabs APIs

- `GET /admin/prefabs?zone=world-map` -> `{ prefabs }`
- `POST /admin/prefabs?zone=world-map` -> `{ prefab }` (`201`)
- `PUT /admin/prefabs/:id?zone=world-map` -> `{ prefab }`
- `DELETE /admin/prefabs/:id?zone=world-map` -> `{ ok: true }`

### 7.4 Patches APIs

- `GET /admin/patches?zone=world-map` -> `{ patches }`
- `POST /admin/patches?zone=world-map` -> `{ patch }` (`201`)
- `POST /admin/patches/:id/request-approval?zone=world-map` -> `{ patch }`
- `POST /admin/patches/:id/approve?zone=world-map` -> `{ patch }`
- `POST /admin/patches/:id/publish?zone=world-map` -> `{ ok: true, restartRequired: true }`
- `POST /admin/patches/:id/rollback?zone=world-map` -> `{ ok: true, restartRequired: true }`

Patch transitions:

- `Draft -> Review Requested -> Approved -> Published`
- `Published -> Rolled Back`
- invalid transition returns `400`

### 7.5 Comments APIs

- `GET /admin/comments?zone=world-map` -> `{ comments }`
- `POST /admin/comments?zone=world-map` -> `{ comment }` (`201`)
- `POST /admin/comments/:id/resolve?zone=world-map` -> `{ comment }`
  - default action resolves
  - body `{ action: 'reopen' }` (or `{ resolved: false }`) reopens

### 7.6 Locks APIs

- `GET /admin/locks?zone=world-map` -> `{ locks }`
- `POST /admin/locks/zone?zone=world-map` body `{ action: 'acquire'|'release', reason? }`
- `POST /admin/locks/layer/:layerId?zone=world-map` body `{ action: 'acquire'|'release', reason? }`

Rules:

- lock ownership is strict
- only lock owner can release
- zone lock blocks all mutations
- layer lock blocks matching layer mutations
- conflicts return `423`

### 7.7 Audit and playtest APIs

- `GET /admin/audit?zone=world-map&limit=200` -> `{ audit }`
- `POST /admin/playtest/session?zone=world-map` -> `{ clientUrl, note }`

## 8. Route Multiplexing Note

`GET /admin/patches` serves HTML for browser navigation. The same path serves patch API JSON when `x-admin-api: 1` is present (or legacy `x-admin-pass`), allowing page/API coexistence without path migration.

## 9. Error Model

Common responses:

- `401` unauthorized (admin session missing/expired and `x-admin-pass` missing/invalid)
- `400` validation, bad transitions, malformed payloads
- `404` missing prefab/patch/comment
- `409` designer revision conflict
- `423` lock conflict
- `500` unexpected server/storage error

## 10. Runtime Apply Semantics

- `PUT /admin/map-config` saves map config to disk immediately.
- patch publish/rollback saves both map-config and designer-state snapshots.
- publish/rollback responses include `restartRequired: true`.
- runtime world still requires restart for published patch effects to apply to live simulation.

## 11. Related Docs

- [Auth and Persistence](./spec_auth_persistence.md)
- [World Entities](../world/spec_world_entities.md)
- [Game Design](../game-design/GDD.md)
