# mmorpg

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser. Open multiple tabs to see multiplayer sync.

## Admin

Visit `http://localhost:3000/admin` for the admin dashboard. Provide the admin password via header
`x-admin-pass`. Default password is `1234` (override with `ADMIN_PASSWORD`).

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
- `ADMIN_PASSWORD` (default `1234`)
- `AUTO_MIGRATE_DEV` (`true` to auto-run `prisma migrate dev` on localhost; default `true`)
- `DEV_ACCOUNT_USER` (default `test`, only when HOST is `127.0.0.1` or `localhost`)
- `DEV_ACCOUNT_PASSWORD` (default `test1234`, only when HOST is `127.0.0.1` or `localhost`)
- `ALLOWED_ORIGINS` (comma-separated)
- `TRUST_PROXY` (`true` to trust `x-forwarded-for`)
- `ALLOW_NO_ORIGIN` (`true` to allow missing Origin header)
- `ALLOW_NO_ORIGIN_REMOTE` (`true` to allow missing Origin header on non-localhost hosts)
- `MAX_CONNECTIONS_PER_IP` (default `5`)
- `MAX_PAYLOAD_BYTES` (default `16384`)
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
- `EXPOSE_AUTH_TOKEN` (`true` to include auth token in login/signup JSON response; default `false`)

## Structure

- `server/` Node server (entry: `server/index.js`)
- `client/` Web client assets
- `shared/` Shared constants + protocol/schema helpers

## Test

```bash
npm test
```

### E2E

```bash
npm run test:e2e
```

Requires `DATABASE_URL_E2E` in `.env` and a Postgres database created for e2e.

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

Auth endpoints also set an HttpOnly session cookie; browsers should send cookies on same-origin requests.

### WebSocket

Pass `token` and `characterId` as query params when opening the WebSocket. Use `?guest=1`
for local/dev guest sessions.
