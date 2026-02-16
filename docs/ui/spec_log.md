# Log Specification

Specification for chat channels, combat log entries, and system messages as implemented.

## 1. Channel Model

`general` is a client-side aggregate tab. It is not a server chat channel.

| Channel | Writable | Delivery scope | Retention behavior |
|---|---|---|---|
| `general` | Yes (client maps to `area`) | Aggregate tab; shows chat/system and selected combat kinds | Client keeps last 200 entries |
| `area` | Yes | Players within `chat.areaRadius` (default `80`) | Server ring buffer: 500 |
| `global` | Yes | All connected non-guest players | Server ring buffer: 500 |
| `trade` | Yes | All connected non-guest players | Server ring buffer: 500 |
| `party` | Yes (only when in party) | Current party members only | Server ring buffer: 500 |
| `combat` | No (server-authored only) | Combat log entries sent to a specific player | Direct WS delivery (`combatLog`); client keeps last 50 |

Sources:

- [client/chat.js](../../client/chat.js)
- [server/logic/chat.js](../../server/logic/chat.js)
- [server/ws/handlers/chat.js](../../server/ws/handlers/chat.js)

## 2. Write and Routing Rules

- Client typing in `general` sends to `area` (`GENERAL_SENDS_TO = 'area'`).
- Client `party` tab is writable only when `isInParty()` is true.
- Server rejects guest chat sends.
- Server rejects `party` chat when sender is not in a party.
- Server sanitizes author/text (control chars removed, whitespace normalized).

## 3. Wire Message Contracts

### 3.1 Chat message (`chat`)

```json
{
  "type": "chat",
  "channel": "area",
  "authorId": "player-id",
  "author": "PlayerName",
  "text": "hello",
  "timestamp": 1730000000000
}
```

### 3.2 Combat log message (`combatLog`)

```json
{
  "type": "combatLog",
  "entries": [
    { "kind": "damage_done", "text": "Slash hit Enemy (Lv.2) for 18 damage", "t": 1730000000000 }
  ]
}
```

## 4. Combat Log Kinds and General Filter

Common implemented combat kinds:

- `damage_done`
- `damage_received`
- `heal`
- `xp_gain`
- `level_up`
- `death`

General tab includes only these combat kinds:

- `xp_gain`
- `level_up`
- `death`

Other combat kinds remain in `combat` tab only.

Source:

- [client/chat.js](../../client/chat.js) (`GENERAL_COMBAT_KINDS`)

## 5. System Messages

System messages are client-generated status entries (connection, errors, etc.) and are shown in `general` only.

Source:

- [client/chat.js](../../client/chat.js) (`addSystemMessage`)

## 6. Buffer Notes

- Server chat buffers are runtime-only ring buffers and are currently not replayed automatically on connect.
- Combat logs are not sourced from chat ring buffers; they are emitted directly as `combatLog` payloads.
- Client buffers are UI/session-local and reset on page reload.
