# Party and Chat Specification

This document describes the implemented party lifecycle, party-linked visibility behavior, and chat channel rules.

Primary sources:

- [server/logic/party.js](../../server/logic/party.js)
- [server/ws/handlers/party.js](../../server/ws/handlers/party.js)
- [server/ws/handlers/chat.js](../../server/ws/handlers/chat.js)
- [server/logic/chat.js](../../server/logic/chat.js)
- [server/logic/combat.js](../../server/logic/combat.js)
- [client/chat.js](../../client/chat.js)

## 1. Party Lifecycle

### 1.1 Create and Invite

- Parties are created lazily: when inviter sends `partyInvite` and is not already in a party.
- Party IDs are server-generated (`party-...`).
- Invite is stored as a pending invite keyed by target player.

Invite constraints:

- Inviter cannot be guest.
- Target must exist, be connected, and not be dead.
- Inviter cannot invite self.
- Target cannot already be in inviter party.
- Target cannot already be in another party.

### 1.2 Accept

- `partyAccept` requires a matching pending invite (`targetId -> inviterId`).
- Invite is consumed on accept.
- Target receives `partyId`, persistence is marked dirty.
- Server sends refreshed private state (`me`) to all party members.

### 1.3 Leave and Disband

- `partyLeave` clears player `partyId`.
- If party becomes empty, it is disbanded.
- Remaining members receive updated `me` payload.

### 1.4 Disconnect Behavior

- On WS close, server calls `leaveParty(playerId, players)` for the disconnected player.
- This prevents stale party membership.

## 2. Party and Visibility/AOI

Party membership affects visibility even beyond raw AOI:

- Public player state filtering includes party members explicitly.
- This ensures party members are included in `state.players` even when outside normal AOI radius.
- Resources/mobs/corpses remain AOI-filtered.

## 3. Party and Progression (XP Link)

Party XP logic is implemented in combat resolution:

- Party XP path activates when killer is in party with at least 2 members.
- Eligible member requirements:
  - within XP radius (`35m`)
  - and either dealt at least `10%` of mob max HP or provided support credit.
- Distribution model:
  - `totalXpPool = baseXp * levelMult * partyBonus(size)`
  - contribution weight: `damageShare + 0.5 * supportShare`
  - anti-boost dampener based on party-average level gap.

Support contribution is tracked by support-tagged priest abilities (`heal`, `renew`, `divine_shield`) during active combat contexts.

## 4. Chat Channels

### 4.1 Channels and Broadcast Scope

- `global`: broadcast to all non-guest connected players.
- `trade`: broadcast to all non-guest connected players.
- `area`: proximity broadcast inside `areaRadius` (default `80`).
- `party`: broadcast only to members of sender's party.

### 4.2 Write Rules

Server-side:

- Guests cannot send chat.
- Party channel requires an active party.
- Text is sanitized and empty messages are dropped.

Client-side:

- `general` tab sends to `area`.
- `party` input is writable only when player is in a party.

## 5. Message Buffers and Retention

Server ring buffers (`server/logic/chat.js`):

- `global`: 500
- `area`: 500
- `trade`: 500
- `party`: 500
- `combat`: 100

Note: combat log delivery uses dedicated `combatLog` messages and does not currently read from chat ring buffers.

Client retention (`client/chat.js`):

- `general`: 200
- `combat`: 50
- Other channels: append-only in current session (no hard cap implemented in client code).

## 6. Combat Log Routing in Chat UI

- Combat log entries are delivered via `combatLog` WS messages.
- General tab includes only selected combat kinds:
  - `xp_gain`, `level_up`, `death`
- Other combat events remain in combat tab only.

## 7. Adjacent Social Features

**Duel:** Opt-in PvP via `duelRequest` / `duelAccept`. Players must be in range (5m). See [Combat spec §12](../combat/spec_combat.md#12-pvp-duels).

**Trade:** Player-to-player trading via `tradeRequest` / `tradeAccept`. Same 5m range constraint. See [Economy spec §5](../economy/spec_economy.md#5-player-to-player-trading).

## 8. Known Boundaries

- No kick/promote/leader-transfer mechanics are implemented.
- No invite timeout/expiry is currently enforced in pending invite storage.
- Duel and trade requests have no timeout; they persist until accepted/declined or requester disconnects.
- No server-side historical replay is sent on connect (buffers are for current runtime only).
