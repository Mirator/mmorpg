# Network Protocol Specification

This document defines the implemented HTTP + WebSocket protocol contracts for the game runtime.

## 1. Scope

- Authenticated HTTP endpoints for account/character lifecycle and WS ticket issuance.
- Real-time WebSocket message contracts between client and server.
- Sequence and rate-limit semantics.
- AOI and delta-state behavior.

Primary sources:

- [shared/protocol.js](../../shared/protocol.js)
- [server/http.js](../../server/http.js)
- [server/ws.js](../../server/ws.js)
- [server/ws/handlers/index.js](../../server/ws/handlers/index.js)

## 2. Connection Flow

1. Client signs up or logs in via HTTP.
2. Server sets HttpOnly session cookie (default auth mode).
3. Client requests short-lived one-time WS ticket:
   - `POST /api/ws-ticket` with `{ characterId }`.
4. Client connects to WebSocket URL with query params:
   - authenticated: `?characterId=<id>&ticket=<ticket>`
   - guest: `?guest=1`
5. On success server sends `welcome`, then periodic `state` and `me` updates.

## 3. Client -> Server Messages

All client messages are JSON and validated by `parseClientMessage`.

| Type | Payload | Validation / Notes |
|---|---|---|
| `hello` | `{ type: 'hello', seq? }` | Accepted by parser; currently a no-op on server handlers. |
| `respawn` | `{ type: 'respawn', seq? }` | Only meaningful while dead. |
| `input` | `{ type: 'input', keys: { w,a,s,d }, seq? }` | Keys are sanitized to booleans. |
| `moveTarget` | `{ type: 'moveTarget', x, z, y?, seq? }` | `x/z` finite required, `y` defaults to `0`. |
| `targetSelect` | `{ type: 'targetSelect', targetId?, targetKind?, seq? }` | `targetId` can be `null` to clear target. |
| `action` interact | `{ type: 'action', kind: 'interact', seq? }` | Harvest/vendor/corpse interaction trigger. |
| `action` ability | `{ type: 'action', kind: 'ability', slot, placementX?, placementZ?, seq? }` | `slot >= 1`; placement fields optional (required by placement abilities). |
| `classSelect` | `{ type: 'classSelect', classId, seq? }` | Class id must be valid. |
| `inventorySwap` | `{ type: 'inventorySwap', from, to, seq? }` | Slot indices are integers. |
| `equipSwap` | `{ type: 'equipSwap', fromType, fromSlot, toType, toSlot, seq? }` | `fromType/toType` in `{inventory,equipment}`; equipment slot names validated. |
| `vendorSell` | `{ type: 'vendorSell', vendorId, slot, seq? }` | Requires in-range vendor and sellable item. |
| `vendorBuy` | `{ type: 'vendorBuy', vendorId, kind, count?, seq? }` | `count` clamped to `1..99`. |
| `chat` | `{ type: 'chat', channel, text, seq? }` | Channel in `{global,area,trade,party}`, text trimmed and max length enforced. |
| `partyInvite` | `{ type: 'partyInvite', targetId, seq? }` | Invites target player. |
| `partyAccept` | `{ type: 'partyAccept', inviterId, seq? }` | Accepts pending invite from inviter. |
| `partyLeave` | `{ type: 'partyLeave', seq? }` | Leaves current party. |
| `craft` | `{ type: 'craft', recipeId, count?, seq? }` | `count` clamped to `1..99`. |
| `duelRequest` | `{ type: 'duelRequest', targetId, seq? }` | Challenges target player to a duel. |
| `duelAccept` | `{ type: 'duelAccept', challengerId, seq? }` | Accepts pending duel from challenger. |
| `duelDecline` | `{ type: 'duelDecline', challengerId, seq? }` | Declines duel from challenger. |
| `duelForfeit` | `{ type: 'duelForfeit', seq? }` | Ends active duel early. |
| `tradeRequest` | `{ type: 'tradeRequest', targetId, seq? }` | Requests trade with target player. |
| `tradeAccept` | `{ type: 'tradeAccept', traderId, seq? }` | Accepts pending trade from requester. |
| `tradeDecline` | `{ type: 'tradeDecline', traderId, seq? }` | Declines trade from requester. |
| `tradeOffer` | `{ type: 'tradeOffer', op: 'add'|'remove', slot?, copper?, seq? }` | Add/remove item (by inv slot or offer index) or copper. |
| `tradeConfirm` | `{ type: 'tradeConfirm', seq? }` | Locks and executes trade when both confirmed. |
| `tradeCancel` | `{ type: 'tradeCancel', seq? }` | Aborts active trade. |

## 4. Server -> Client Messages

| Type | Payload | Notes |
|---|---|---|
| `welcome` | `{ type: 'welcome', id, snapshot, config }` | First post-auth payload. `snapshot` includes `world` and initial public state. |
| `state` | `{ type: 'state', t, full?, players?, resources?, mobs?, corpses?, removedPlayers?, removedResources?, removedMobs?, removedCorpses? }` | Full or delta world state payload. |
| `me` | `{ type: 'me', t, id, data }` | Private player state (`inventory`, `currency`, `equipment`, `resource`, `cooldowns`, `attributes`, `derivedStats`, `duelOpponentId`, etc.). |
| `combatEvent` | `{ type: 'combatEvent', t, events: [...] }` | AOI-filtered combat VFX event stream. |
| `abilityFailed` | `{ type: 'abilityFailed', reason, slot }` | Returned when ability request is rejected. |
| `chat` | `{ type: 'chat', channel, authorId, author, text, timestamp }` | Chat channel broadcast payload. |
| `combatLog` | `{ type: 'combatLog', entries: [...] }` | Structured combat log entries. |
| `partyInviteReceived` | `{ type: 'partyInviteReceived', inviterId, inviterName }` | Invite notification to target player. |
| `duelRequestReceived` | `{ type: 'duelRequestReceived', challengerId, challengerName }` | Duel challenge notification. |
| `duelActive` | `{ type: 'duelActive', opponentId, opponentName }` | Duel started; both players can deal PvP damage. |
| `duelEnded` | `{ type: 'duelEnded', reason }` | Duel ended (`reason`: `forfeit`, `death`, `disconnect`). |
| `duelDeclined` | `{ type: 'duelDeclined', targetId, targetName }` | Target declined the duel. |
| `tradeRequestReceived` | `{ type: 'tradeRequestReceived', traderId, traderName }` | Trade request notification. |
| `tradeOpened` | `{ type: 'tradeOpened', partnerId, partnerName, myOffer, theirOffer }` | Trade window opened. |
| `tradeOfferUpdate` | `{ type: 'tradeOfferUpdate', myOffer, theirOffer, confirmed?, theirConfirmed? }` | Offer changed or confirmed. |
| `tradeCompleted` | `{ type: 'tradeCompleted' }` | Trade executed successfully. |
| `tradeCancelled` | `{ type: 'tradeCancelled' }` | Trade aborted. |
| `tradeDeclined` | `{ type: 'tradeDeclined', targetId? }` | Target declined the trade. |
| `tradeError` | `{ type: 'tradeError', error }` | Trade validation or execution error. |

## 5. Sequence Semantics

- Optional `seq` exists on most client messages.
- If provided and `seq <= lastInputSeq`, the message is ignored.
- Otherwise, `lastInputSeq` is updated and message is processed.
- This gives monotonic client ordering without explicit server ACKs.

## 6. Rate-Limit Semantics

- Global message limiter per connection:
  - Window: `config.msgRateIntervalMs`
  - Max: `config.msgRateMax`
  - On exceed: connection closed with code `1008` (`Rate limit`).
- Chat-specific limiter:
  - Window: `config.chat.rateLimitIntervalMs`
  - Max: `config.chat.rateLimitMax`
  - On exceed: chat message is dropped (connection remains open).

## 7. `abilityFailed.reason` Values

Implemented reasons:

- `unknown_ability`
- `casting`
- `gcd`
- `cooldown`
- `resource`
- `no_target`
- `pvp_not_allowed`
- `salvation_pve_only`
- `out_of_range`
- `no_placement`
- `no_direction`

## 8. AOI and Delta State

Public state is filtered by area of interest (AOI):

- Players: inside AOI radius, plus explicit inclusion of party members.
- Resources, mobs, corpses: AOI-filtered around local player position.

Delta mode behavior:

- Server tracks last sent state per player.
- Changed entities are sent as partial arrays/maps.
- Removed entities are sent via `removed*` arrays.
- If delta payload size is large relative to current state (`>= 0.8` threshold), server falls back to full payload (`full: true`).

## 9. Transport and Auth Guards

Upgrade/auth guard behaviors:

- Origin not allowed: HTTP `403` on upgrade.
- Per-IP connection cap exceeded: HTTP `429` on upgrade.
- Invalid/missing auth or ownership: WS close with policy error (`1008`).
- Session/DB failures: WS close with server error (`1011`).
