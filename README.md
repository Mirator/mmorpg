# mmorpg

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser. Open multiple tabs to see multiplayer sync.

## Admin

Visit `http://localhost:3000/admin` for the redesigned admin dashboard and `http://localhost:3000/admin/map`
for the Zone Canvas editor.

Available admin screens:

- `/admin` (Dashboard)
- `/admin/map` (Zone Canvas editor)
- `/admin/patches` (Patch Manager)
- `/admin/assets` (Asset Manager / prefab registry)
- `/admin/events` (Event & Trigger editor)
- `/admin/nav` (Navmesh editor)
- `/admin/collab` (Collaboration locks/comments/audit)
- `/admin/playtest` (Preview / playtest launcher)

Admin APIs require a valid admin session (cookie by default; `x-admin-session` header is also accepted).

Admin unlock/session endpoints:

- `POST /admin/auth/unlock` `{ password }` -> `{ ok: true }` + admin session cookie
- `GET /admin/auth/session` -> `{ ok: true }` when authorized
- `POST /admin/auth/logout` -> `{ ok: true }` and clears admin session cookie

Core admin APIs:

- `GET /admin/state`
- `GET /admin/map-config`
- `PUT /admin/map-config`

Phase-2 designer APIs (`x-admin-alias` on mutating requests):

- `GET|PUT /admin/designer-state?zone=world-map`
- `GET|POST /admin/prefabs?zone=world-map`
- `PUT|DELETE /admin/prefabs/:id?zone=world-map`
- `GET|POST /admin/patches?zone=world-map`
- `POST /admin/patches/:id/request-approval?zone=world-map`
- `POST /admin/patches/:id/approve?zone=world-map`
- `POST /admin/patches/:id/publish?zone=world-map`
- `POST /admin/patches/:id/rollback?zone=world-map`
- `GET|POST /admin/comments?zone=world-map`
- `POST /admin/comments/:id/resolve?zone=world-map` (`{ action: 'resolve' | 'reopen' }`)
- `GET /admin/locks?zone=world-map`
- `POST /admin/locks/zone?zone=world-map`
- `POST /admin/locks/layer/:layerId?zone=world-map`
- `GET /admin/audit?zone=world-map&limit=200`
- `POST /admin/playtest/session?zone=world-map`

For JSON API calls to `GET /admin/patches`, send `x-admin-api: 1` (otherwise the route serves HTML).

`ADMIN_PASSWORD` is required in every environment, including localhost.
For full admin behavior and API contracts, see
[`docs/platform/spec_admin_web_pages.md`](docs/platform/spec_admin_web_pages.md).

## Database (Postgres + Prisma)

Create local databases (one-time):

```bash
createdb mmorpg_dev
createdb mmorpg_test
createdb mmorpg_e2e
```

Copy `.env.example` to `.env` and update the connection strings.

Run the initial migration:

```bash
npm run db:migrate:dev
```

On localhost, the server auto-runs `prisma migrate dev` at startup (set `AUTO_MIGRATE_DEV=false` to disable).

## Environment Variables

- `PORT`, `HOST` (default `3000`, `127.0.0.1`)
- `ADMIN_PASSWORD` (**required** in all environments)
- `ADMIN_SESSION_COOKIE_NAME` (default `mmorpg_admin_session`)
- `ADMIN_SESSION_IDLE_TIMEOUT_MS` (default `1800000` = 30 minutes)
- `ADMIN_SESSION_COOKIE_SAMESITE` (`lax`, `strict`, or `none`; default `strict`)
- `ADMIN_SESSION_COOKIE_SECURE` (`true` to force Secure admin session cookie; default follows `SESSION_COOKIE_SECURE`)
- `MAP_CONFIG_PATH` (override map config file; default `server/data/world-map.json`)
- `MAP_DESIGNER_STATE_PATH` (override designer-state file; default `server/data/world-map.designer.json`)
- `AUTO_MIGRATE_DEV` (`true` to auto-run `prisma migrate dev` on localhost; default `true`)
- `DEV_ACCOUNT_USER` (default `test`, only when HOST is `127.0.0.1` or `localhost`)
- `DEV_ACCOUNT_PASSWORD` (default `test1234`, only when HOST is `127.0.0.1` or `localhost`)
- `ALLOWED_ORIGINS` (comma-separated)
- `TRUST_PROXY` (`true` to trust `x-forwarded-for`)
- `ALLOW_NO_ORIGIN` (`true` to allow missing Origin header)
- `ALLOW_NO_ORIGIN_REMOTE` (`true` to allow missing Origin header on non-localhost hosts)
- `MAX_CONNECTIONS_PER_IP` (default `5`)
- `MAX_PAYLOAD_BYTES` (default `16384`)
- `ADMIN_MAX_PAYLOAD_BYTES` (default `262144`; used for `/admin` JSON bodies like designer-state saves)
- `MSG_RATE_MAX` (default `60`)
- `MSG_RATE_INTERVAL_MS` (default `1000`)
- `HEARTBEAT_INTERVAL_MS` (default `30000`)
- `PERSIST_INTERVAL_MS` (default `5000`)
- `PERSIST_FORCE_MS` (default `30000`)
- `PERSIST_POS_EPS` (default `0.6`)
- `E2E_TEST` (`true` to spawn stable test mob/resource)
- `E2E_PORT` (default `3001` for e2e runner)
- `SESSION_COOKIE_NAME` (default `mmorpg_session`)
- `SESSION_COOKIE_SAMESITE` (`lax`, `strict`, or `none`; default `lax`)
- `SESSION_COOKIE_SECURE` (`true` to force Secure cookies; default `true` in production)
- `EXPOSE_AUTH_TOKEN` (`true` to include auth token in login/signup JSON response; default `false`; for dev/testing only; prefer cookie auth in production)

## Credits

- Ground texture: [Low Poly Texture](https://opengameart.org/content/low-poly-texture) by freeze111 (CC-BY 4.0)

## Structure

- `server/` Node server (entry: `server/index.js`)
- `client/` Web client assets
- `shared/` Shared constants + protocol/schema helpers

## Docs

- `README.md` is the quickstart and operational reference.
- `docs/README.md` is the canonical documentation index (single docs root).
- `docs/ARCHITECTURE.md` describes module boundaries and data flow.
- `docs/TESTING.md` documents unit/E2E workflow and failure artifacts.

## Test

```bash
npm test
```

`npm test` now runs local static checks first (`npm run check:tscheck:coverage` + `npm run typecheck`) and then unit/integration tests (`npm run test:unit`).
Type checks are JS-only and incremental: files participate when they opt in with `// @ts-check` + JSDoc.

Useful test commands:

- `npm test` - `@ts-check` coverage guard + typecheck (server + client + tools) + unit/integration tests.
- `npm run typecheck` - static typecheck only (server + client + tools).
- `npm run check:tscheck:coverage` - enforce `// @ts-check` headers on first-party non-test JS.
- `npm run test:unit` - unit/integration tests only (Vitest).
- `npm run test:e2e` - Playwright E2E only.

### E2E Testing

**Prerequisites**

- Postgres with `mmorpg_e2e` database (see [Database](#database-postgres--prisma) above)
- `DATABASE_URL_E2E` in `.env` (see [.env.example](.env.example))
- Playwright browsers: run once per machine:
  ```bash
  npx playwright install chromium
  ```
  (Or `npx playwright install` for all browsers. Without this, E2E will fail with "Executable doesn't exist".)

**Run**

```bash
npm run test:e2e
```

**Optional**

- `E2E_PORT` (default `3001`) – port used by the E2E server
- `E2E_TEST` / `E2E_SIMULATED_WORLD` – server-side flags used by the E2E script

## Protocol

WebSocket client messages are validated in `shared/protocol.js`. The server sends a
config snapshot (including `protocolVersion`) in the welcome payload.

## Auth + Characters

Accounts and characters are stored in Postgres. Usernames and character names are globally
unique (case-insensitive). The client uses HTTP auth endpoints before opening a WebSocket.

### Auth endpoints

- `POST /api/auth/signup` `{ username, password }` → `{ account }` (token optional via `EXPOSE_AUTH_TOKEN`)
- `POST /api/auth/login` `{ username, password }` → `{ account }` (token optional via `EXPOSE_AUTH_TOKEN`)
- `POST /api/auth/logout` (session cookie or Bearer token) → `{ ok: true }`
- `GET /api/characters` (session cookie or Bearer token) → `{ characters }`
- `POST /api/characters` (session cookie or Bearer token) `{ name, classId }` → `{ character }`
- `DELETE /api/characters/:id` (session cookie or Bearer token) → `{ ok: true }`

Auth endpoints set an HttpOnly session cookie by default. Browsers send cookies on same-origin
requests. Cookie-based auth is the default and preferred method; `EXPOSE_AUTH_TOKEN` is for
dev/testing only and should not be enabled in production. Cookie-authenticated mutating API routes
enforce CSRF checks (`Origin`/`Referer` allowlist + Fetch Metadata).

### WebSocket

Auth uses a short-lived ticket (60s) obtained via `POST /api/ws-ticket` before connecting.
The client fetches a ticket with `credentials: 'same-origin'` (session cookie), then opens the
WebSocket with `?ticket=...&characterId=...`. This keeps tokens out of URLs. For guest sessions,
use `?guest=1`.
