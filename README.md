# mmorpg

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser. Open multiple tabs to see multiplayer sync.

## Admin

Visit `http://localhost:3000/admin` for the admin dashboard. Provide the admin password via header
`x-admin-pass` or `?password=` query param. Default password is `1234` (override with `ADMIN_PASSWORD`).

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

## Environment Variables

- `PORT`, `HOST` (default `3000`, `127.0.0.1`)
- `ADMIN_PASSWORD` (default `1234`)
- `ALLOWED_ORIGINS` (comma-separated)
- `TRUST_PROXY` (`true` to trust `x-forwarded-for`)
- `ALLOW_NO_ORIGIN` (`true` to allow missing Origin header)
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
