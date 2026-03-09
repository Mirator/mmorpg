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

- **Composition + config**
  - `server/index.js`, `server/createServer.js`, `server/config.js`: process lifecycle, wiring of HTTP/WS/game loop/persistence, and environment-driven config.
- **Core game runtime (authoritative world)**
  - `server/gameLoop.js`, `server/gameLoopPhases.js`, `server/spawn.js`: tick orchestration and world bootstrap.
  - `server/logic/*`: gameplay rules and tick-step logic (combat, loot, duel, trade, party, mobs, world, resources, progression, collisions, tutorial, etc.).
- **Transport + boundary adapters**
  - `server/http.js`: HTTP routes for auth, characters, admin, and WS ticket.
  - `server/ws.js`, `server/ws/runtime.js`, `server/ws/stateView.js`: WebSocket server, connection lifecycle, and world → view projections.
  - `server/ws/handlers/*`: message-specific handlers (ability, movement/input, inventory/equipment, party, chat, vendor, craft, duel, trade, interact, respawn).
  - `server/httpErrors.js`, `server/sessionToken.js`, `server/csrfGuard.js`, `server/authParsing.js`: cross-cutting HTTP/WS boundary concerns.
- **Persistence + database access**
  - `server/persistence.js`: dirty-tracking and periodic flush of player state.
  - `server/db/*`: repository layer and serialization/migration helpers around Prisma.
  - `server/types/domain.d.ts`: server-side domain typing that mirrors `shared/` contracts.
- **Admin + map designer**
  - `server/admin.js`, `server/adminSession.js`: admin dashboard and session handling.
  - `server/mapConfig.js`, `server/mapDesignerState.js`, `server/mapDesignerStore.js`, `server/mapDesignerHandlers.js`: map designer and live map-config application.
  - `server/data/world-map*.json`: checked-in designer + runtime map snapshots.

### Client

- **Core runtime (game simulation on the client)**
  - `client/client.js`: composition root (menu/auth, connection, rendering, UI, input).
  - `client/frame-loop.js`: render/update loop timing and per-frame orchestration.
  - `client/world.js`, `client/render.js`, `client/playerVisual.js`, `client/assets.js`: world scene graph, Three.js wiring, and asset lookup.
  - `client/input.js`, `client/keybinds.js`: input capture and keybinding configuration.
  - `client/connection.js`, `client/net.js`: WebSocket lifecycle, reconnect, and inbound message routing.
- **Game UI shells (in-world HUD and panels)**
  - `client/ui.js`, `client/ui-audio.js`, `client/minimap.js`: HUD elements, feedback, and overlays directly tied to gameplay.
  - `client/equipment.js`, `client/trade.js`, `client/social-ui.js`, `client/journal.js`, `client/item-preview-renderer.js`: feature-specific panels layered on top of the core runtime.
- **Meta/auth/menu shell**
  - `client/menu.js`, `client/menuNetwork.js`, `client/landingContent.js`, `client/loading.js`, `client/overlays.js`, `client/pause-menu.js`: flows that wrap the game runtime (auth, character select, loading, pause/options, onboarding overlays).
- **Styling and visual assets**
  - `client/style/*.css`: domain-scoped styling (`chat.css` for chat/party/duel/trade, `menu.css` for auth/character flows, `overlay.css` for loading/onboarding, etc.).
  - `client/assets/**`: all 2D/3D assets (models, textures, icons, UI chrome) consumed by the runtime and UI shells.

## UI Flow Lifecycle (Auth to In-Game)

The menu/loading handoff is intentionally staged:

1. `data-progress=\"account\"`
   - Sign in or sign up, with local field validation and API error mapping.
2. `data-progress=\"character\"`
   - Character list/create flow with smart continue targeting (last-played fallback to first character).
3. `data-progress=\"enter\"`
   - Character connect starts loading overlay and websocket handshake.
4. Loading stage lifecycle (`client/client.js` + `client/connection.js`):
   - `Preparing session`
   - `Loading world assets` (determinate)
   - `Connecting realm` (indeterminate)
   - `Syncing world state` (indeterminate/finalize)
   - stage callback events: `socket_open`, `awaiting_welcome`, `world_ready`
5. Enter-world reveal:
   - menu closes
   - loading overlay hides
   - entry banner appears briefly

These steps are client-only presentation orchestration; backend auth/WS protocols remain unchanged.

### Shared

- `shared/protocol.js`: client message validation.
- `shared/config.js`: runtime config snapshot sent to clients.
- `shared/classes.js`, `shared/progression.js`, `shared/economy.js`, `shared/equipment.js`: gameplay constants/rules shared by client and server.

## Stability Boundaries

- No protocol version bump unless wire payload contracts change.
- Existing HTTP route contracts are treated as stable public interfaces.
- Shared helpers should remain single-source to prevent runtime path drift and duplication regressions.
