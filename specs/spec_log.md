# Log Specification

Specification for chat channels and all log types (combat log, chat, system).

---

## Channels

| Channel | Writable | Description | Buffer size |
|---------|----------|-------------|-------------|
| **general** | Yes (sends to area) | Aggregate view; shows messages from other channels based on filter. Typing here sends to Area. | 200 |
| **area** | Yes | Proximity-based chat; players in range receive messages. | 500 |
| **global** | Yes | Broadcast to all players. | 500 |
| **combat** | No | Combat log entries (damage, heals, XP, death). | 50 |
| **trade** | Yes | Trade chat. | 500 |
| **party** | Yes (when in party) | Party chat. Reserved for future party system. | 500 |

**Client:** [client/chat.js](client/chat.js) – `messagesByChannel`, `WRITABLE_CHANNELS`, `GENERAL_SENDS_TO`  
**Server:** [server/logic/chat.js](server/logic/chat.js) – `CHAT_BUFFER_SIZES`

---

## Combat Log Entries

All combat log entries are sent via `combatLog` WebSocket message. Each entry has `kind`, `text`, and `t` (timestamp).

### 1. damage_done

**Source:** Player hits mob (basic attack or ability)

**Text format:** `{abilityName} hit {targetName} for {damage} damage` + optional ` (Critical!)`

**Examples:**
- `Firebolt hit Enemy (Lv.2) for 28 damage`
- `Shield Slam hit Enemy (Lv.5) for 42 damage (Critical!)`
- `Slash hit Enemy (Lv.1) for 18 damage`

**Where emitted:**
- [server/ws.js](server/ws.js) – `tryUseAbility` result (basic attack, shield_slam, power_strike, smite, firebolt)
- [server/gameLoop.js](server/gameLoop.js) – `stepPlayerCast` result (aimed_shot completion)

**Shown in:** Combat tab only (not General)

---

### 2. damage_received

**Source:** Mob hits player

**Text format:** `{mobName} hit you for {damage} damage`

**Examples:**
- `Enemy (Lv.3) hit you for 12 damage`

**Where emitted:**
- [server/createServer.js](server/createServer.js) – `onPlayerDamaged` callback from mobs.js

**Shown in:** Combat tab only (not General)

---

### 3. heal

**Source:** Priest heals self or ally

**Text format:** `You healed {target} for {amount}`

**Examples:**
- `You healed yourself for 42`
- `You healed Bob for 38`

**Where emitted:**
- [server/ws.js](server/ws.js) – `tryUseAbility` result (heal ability)

**Shown in:** Combat tab only (not General)

---

### 4. xp_gain

**Source:** Player kills a mob

**Text format:** `You gained {xp} XP from killing {targetName}`

**Examples:**
- `You gained 45 XP from killing Enemy (Lv.2)`
- `You gained 120 XP from killing Enemies` (cleave/frost_nova multi-kill)

**Where emitted:**
- [server/ws.js](server/ws.js) – `tryUseAbility` result
- [server/gameLoop.js](server/gameLoop.js) – `stepPlayerCast` result

**Shown in:** Combat tab and General tab

---

### 5. level_up

**Source:** Player gains enough XP to level up

**Text format:** `You gained a level!`

**Where emitted:**
- [server/ws.js](server/ws.js) – `tryUseAbility` result
- [server/gameLoop.js](server/gameLoop.js) – `stepPlayerCast` result

**Shown in:** Combat tab and General tab

---

### 6. death

**Source:** Player HP reaches 0

**Text format:** `You died`

**Where emitted:**
- [server/createServer.js](server/createServer.js) – `onPlayerDeath` callback from gameLoop.js `killPlayer()`

**Shown in:** Combat tab and General tab

---

## General Tab Filter

Shown in General:
- `xp_gain`
- `level_up`
- `death`

Not shown in General:
- `damage_done`
- `damage_received`
- `heal`

**Client:** [client/chat.js](client/chat.js) – `GENERAL_COMBAT_KINDS`

---

## Chat Messages

Chat messages (area, global, trade, party) have `channel`, `authorId`, `author`, `text`, `timestamp`. Server sanitizes text before storing and broadcasting.

---

## System Messages

System messages appear in General only. Used for connection status, errors, etc.

---

## Client Color Coding (Combat Log)

| kind | Color | CSS class |
|------|-------|-----------|
| damage_done | Green | `.chat-combat-damage_done` |
| damage_received | Red | `.chat-combat-damage_received` |
| heal | Green | `.chat-combat-heal` |
| xp_gain | Yellow | `.chat-combat-xp_gain` |
| level_up | Gold | `.chat-combat-level_up` |
| death | Danger red | `.chat-combat-death` |

---

## Future Improvements

| Event | Description | Suggestion |
|-------|-------------|------------|
| **Miss** | Attack misses (rollHit fails) | Add `kind: 'miss'`, e.g. "Your attack missed Enemy (Lv.2)" |
| **Healing received** | Player receives heal from ally | Add `kind: 'heal_received'` |
| **Respawn** | Player respawns | Add `kind: 'respawn'`, e.g. "You have respawned" |
| **Multi-kill XP clarity** | Cleave/frost_nova XP is vague | e.g. "You gained 90 XP from killing 3 enemies" |
| **Loot** | Item dropped from kill | Add `kind: 'loot'` when loot system exists |
| **Combat log verbosity** | Brief vs Full | Brief (XP, death, level up) vs Full (all damage, misses, heals) |
