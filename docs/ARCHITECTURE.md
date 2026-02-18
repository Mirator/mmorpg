# Architecture

## Runtime Topology

The server is composed in `server/createServer.js`:

- `server/http.js` serves static assets and HTTP APIs (auth, characters, admin, WS ticket).
- `server/ws.js` manages WebSocket auth, connection lifecycle, and realtime messaging.
- `server/gameLoop.js` runs deterministic world updates (movement, resources, mobs, combat).
- `server/persistence.js` flushes dirty player state to Postgres via Prisma.

`server/index.js` only handles process lifecycle (boot + graceful shutdown).

## Data Flow

1. Client authenticates over HTTP (`/api/auth/signup` or `/api/auth/login`) and receives a session cookie.
2. Client selects a character and requests a short-lived WS ticket (`POST /api/ws-ticket`).
3. Client opens WebSocket with `characterId` and `ticket`.
4. Server validates account/character, sends `welcome` + state snapshot, then private `me` updates.
5. Client sends validated protocol messages (`shared/protocol.js`); server handlers mutate world/player state.
6. Server broadcasts delta state, combat events, chat/combat log entries, and private player updates.

## Module Map

### Server

- `server/ws/handlers/*`: message-specific handlers (ability, movement/input, inventory/equipment, party, chat, vendor, craft, duel, trade, respawn).
- `server/logic/*`: gameplay rules and tick-step logic (combat, loot, duel, trade, party, etc.).
- `server/db/*`: repository layer and state migration/serialization.
- `server/authParsing.js`: shared cookie/id parsing used by both HTTP and WS paths.

### Client

- `client/client.js`: composition root (menu/auth, connection, rendering, UI, input).
- `client/connection.js`: WebSocket lifecycle, reconnect, and inbound message routing.
- `client/ui-state.js`: inventory/character/vendor/death UI state and interactions.
- `client/style/*.css`: domain-scoped styling (`chat.css` for chat/party/duel/trade, `vendor.css` for vendor UI).

### Shared

- `shared/protocol.js`: client message validation.
- `shared/config.js`: runtime config snapshot sent to clients.
- `shared/classes.js`, `shared/progression.js`, `shared/economy.js`, `shared/equipment.js`: gameplay constants/rules shared by client and server.

## Stability Boundaries

- No protocol version bump unless wire payload contracts change.
- Existing HTTP route contracts are treated as stable public interfaces.
- Shared helpers should remain single-source to prevent runtime path drift and duplication regressions.
