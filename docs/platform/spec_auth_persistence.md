# Auth and Persistence Specification

This document defines implemented account/session/character auth contracts and player-state persistence behavior.

Primary sources:

- [server/http.js](../../server/http.js)
- [server/ws.js](../../server/ws.js)
- [server/wsTicket.js](../../server/wsTicket.js)
- [server/persistence.js](../../server/persistence.js)
- [server/db/playerState.js](../../server/db/playerState.js)
- [server/db/playerRepo.js](../../server/db/playerRepo.js)
- [prisma/schema.prisma](../../prisma/schema.prisma)

## 1. Data Model and Boundaries

## 1.1 Persistent models

- `Account`:
  - `id`, `username`, `usernameLower` (unique), password hash+salt, timestamps.
- `Session`:
  - `id` (SHA-256 hash of session token), `accountId`, `expiresAt`, `lastSeenAt`.
- `Player` (character):
  - `id`, optional `accountId`, `name`, `nameLower` (unique), `state` JSON, `stateVersion`, `lastSeenAt`.

## 1.2 Persisted player-state fields

`serializePlayerState(player)` persists:

- `pos {x,y,z}`
- `hp`, `maxHp`
- `inventory`
- `currencyCopper`
- `equipment`
- `classId`, `level`, `xp`
- `invSlots`, `invStackMax`

Not persisted as durable character state (runtime-only): active WS connection data, movement keys/targets, cooldown timers, cast/runtime combat flags, AOI caches.

## 2. HTTP Auth Contracts

## 2.1 Signup/login/logout

- `POST /api/auth/signup` validates username/password, creates account + session, sets session cookie.
- `POST /api/auth/login` validates credentials, creates new session, sets session cookie.
- `POST /api/auth/logout` requires auth, deletes session, clears session cookie.
- Cookie-authenticated mutating routes enforce CSRF checks (`Origin`/`Referer` allowlist + Fetch Metadata).

## 2.2 Session transport

- Primary: HttpOnly cookie (`SESSION_COOKIE_NAME`, default `mmorpg_session`).
- Optional: `Authorization: Bearer <token>` for API auth.
- `requireAuth` checks bearer first, then cookie.
- Session TTL: `SESSION_TTL_MS = 30 days`.
- Session tokens are hashed before DB persistence/lookup; DB rows are not bearer-equivalent secrets.
- Valid sessions are touched (`lastSeenAt`) on authenticated API usage.

`EXPOSE_AUTH_TOKEN=true` optionally includes token in signup/login JSON for dev/testing.
Session-token hashing invalidates previously persisted plaintext sessions; users must sign in again after rollout.

## 3. WS Ticket and WebSocket Auth

## 3.1 Ticket issuance

- `POST /api/ws-ticket` (authenticated) with `{ characterId }`.
- Server checks character exists and belongs to the authenticated account.
- Returns a short-lived ticket bound to `(accountId, characterId)`.

## 3.2 Ticket semantics

- Ticket TTL: `60s`.
- One-time use: `validateAndConsumeTicket` deletes ticket on first validation attempt.
- Expired or unknown tickets are rejected.

## 3.3 WebSocket auth flow

- Authenticated connect: `?characterId=<id>&ticket=<ticket>`.
- Guest connect: `?guest=1`.
- Server validates ticket/account/character ownership before loading player.
- If no valid ticket is supplied, WS path can still auth via session cookie + `characterId`.

## 4. Character Lifecycle Contracts

Authenticated endpoints:

- `GET /api/characters`:
  - returns only requesting account's characters.
- `POST /api/characters` `{ name, classId }`:
  - validates name/class,
  - enforces global case-insensitive name uniqueness,
  - creates base state via `createBasePlayerState`, stores with current `PLAYER_STATE_VERSION`.
- `DELETE /api/characters/:id`:
  - ownership check required,
  - if character is online, server closes the active WS and removes runtime player,
  - deletes DB row for the owned character.

## 5. State Migration and Hydration

## 5.1 Versioning

- Current runtime version: `PLAYER_STATE_VERSION = 2`.
- DB schema default may be older (`stateVersion` default `1`), so migration runs on load.

## 5.2 Migration behavior

`migratePlayerState(rawState, version)`:

- `version > current`: preserve as-is (no downgrade), `didUpgrade=false`.
- `version < current`: apply step migrations and return `version=current`, `didUpgrade=true`.

If WS load upgraded state, server immediately persists upgraded state.

## 5.3 Hydration behavior

`hydratePlayerState` sanitizes loaded state:

- clamps position to world bounds,
- normalizes inventory slots/counts,
- normalizes equipment and class id,
- clamps hp and recomputes `maxHp` from current derived stats,
- computes runtime capacity fields (`inv`, `invCap`).

## 6. Persistence Loop

## 6.1 Dirty marking

`markDirty(player)` is skipped for guests; otherwise sets `player.dirty = true`.

Implemented dirty triggers include:

- class changes,
- inventory/equipment swaps,
- vendor sell/buy,
- harvest and corpse loot,
- craft,
- party accept/leave,
- combat XP/level changes,
- death and respawn.

## 6.2 Save conditions

`shouldPersistPlayer(player, now)` is true when any applies:

- `player.dirty === true`,
- force interval elapsed (`now - lastPersistedAt >= persistForceMs`),
- position changed by at least `persistPosEps`,
- no prior persisted position snapshot.

Defaults from config:

- `persistIntervalMs = 5000`
- `persistForceMs = 30000`
- `persistPosEps = 0.6`

## 6.3 Save operation

`persistPlayer` serializes state and `savePlayer` writes:

- `state`
- `stateVersion = PLAYER_STATE_VERSION`
- `lastSeenAt`

On success it clears dirty flag and refreshes last-persisted markers.

## 7. Disconnect and Shutdown Guarantees

- On WS close for an authenticated non-guest player, server attempts immediate `persistPlayer`.
- Server stop sequence:
  1. stop broadcast/heartbeat/persistence loop/game loop,
  2. close all WS clients,
  3. `flushAll()` persist pass across all runtime players,
  4. disconnect Prisma.

## 8. Ownership and Access Rules

- Character operations require authenticated account context.
- WS runtime load rejects character/account mismatches.
- WS ticket creation rejects non-owned characters.
- Expired/invalid sessions are rejected and cookies cleared on HTTP auth middleware.
