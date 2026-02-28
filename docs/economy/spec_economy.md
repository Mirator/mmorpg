# Economy and Crafting Specification

This document describes the currency system, vendor trading, contracts, resource harvesting, profession crafting, and item-maintenance systems as implemented in the codebase.

---

# 1. Currency

## 1.1 Units

All currency is stored as **copper** (integer). Display uses gold, silver, and copper:

| Unit   | Conversion              |
|--------|-------------------------|
| Copper | 1c = 1 copper           |
| Silver | 1s = 100 copper         |
| Gold   | 1g = 100 silver = 10,000 copper |

Constants: `COPPER_PER_SILVER = 100`, `SILVER_PER_GOLD = 100`, `COPPER_PER_GOLD = 10,000`

## 1.2 Display

- `splitCurrency(totalCopper)` → `{ gold, silver, copper }`
- `formatCurrency(totalCopper)` → `"Xg Ys Zc"` (e.g. `"1g 25s 50c"`)

**Source:** [shared/economy.js](../../shared/economy.js)

---

# 2. Inventory

## 2.1 Structure

- **Slots:** Array of `{ id?, kind, name?, count, rarity?, durability?, maxDurability?, craftedProfession?, isStarter?, sourceRecipeId? } | null`
- **Slot count:** From world config `playerInvSlots` (default: 20)
- **Stack max:** From world config `playerInvStackMax` (default: 20)
- **Capacity:** `invSlots × invStackMax` total items

## 2.2 Operations

| Function        | Description                                      |
|-----------------|--------------------------------------------------|
| `countInventory`| Total item count across all slots                |
| `countItem`     | Total count of a specific `kind`                 |
| `addItem`       | Add item(s), stacking when possible              |
| `consumeItems`  | Remove `count` of `kind`; returns false if short |
| `canAddItem`    | Whether inventory can accept more of `kind`      |

**Source:** [server/logic/inventory.js](../../server/logic/inventory.js)

## 2.3 Death

On death, inventory is dropped at the death location as a **corpse**. Currency and equipment are retained. The player respawns at base after a timer. To recover items, the player must return to their corpse and press E (interact) within `corpseLootRadius` (default: 2.5). Only the corpse owner can loot. Corpses expire after `corpseExpiryMs` (default: 10 minutes); unclaimed items are lost.

---

# 3. Resource Harvesting

## 3.1 Resource Nodes

Resource nodes are placed in the world (from map config). Each node has:

- `id`, `x`, `z`, `type` (crystal | ore | herb | tree | flower)

## 3.2 Harvest Flow

1. Player presses E within `harvestRadius` (default: 2.2) of an available node
2. Server finds closest available node
3. Item is added to inventory based on node `type`
4. Node becomes unavailable for `respawnMs` — **per resource type** (see table below)

## 3.3 Resource Types and Output

| Type    | Item Kind | Item Name   | Sell Price | Respawn (ms) |
|---------|-----------|-------------|------------|--------------|
| crystal | crystal   | Crystal     | 10c        | 15,000       |
| ore     | ore       | Iron Ore    | 15c        | 20,000       |
| herb    | herb      | Healing Herb| 12c        | 12,000       |
| tree    | wood      | Wood        | 8c         | 25,000       |
| flower  | flower    | Flower      | 10c        | 10,000       |

**Source:** [shared/economy.js](../../shared/economy.js) `RESOURCE_TYPES`, `getResourceRespawnMs(type)`, [server/logic/resources.js](../../server/logic/resources.js)

---

# 4. Vendor Trading

## 4.1 Interaction

- Player must be within `vendorInteractRadius` (default: 2.5) of vendor
- Press E to open vendor dialog; "Trade" opens the trade panel
- The trade panel contains:
  - `Buy`
  - `Sell`
  - `Contracts`

## 4.2 Selling

- Drag item from inventory to vendor drop zone
- Only items with a configured sell price can be sold
- Sell prices (per unit):

| Kind   | Price |
|--------|-------|
| crystal| 10c   |
| ore    | 15c   |
| herb   | 12c   |
| wood   | 8c    |
| flower | 10c   |

- Item is removed from inventory; copper is added to player
- Broken durability-tracked crafted gear cannot be sold to vendors

## 4.3 Buying

- Buy tab lists items from the **vendor's catalog** — each vendor can have a custom `buyItems` in map config
- If vendor has no `buyItems`, uses global `VENDOR_BUY_ITEMS`
- Map config: `vendors[].buyItems` = `[{ kind, priceCopper? }]` — optional price override per item
- Player pays `priceCopper × count`; item is added to inventory
- Count is clamped to 1–99 per transaction

### Default Buy Catalog (when vendor has no buyItems)

| Kind                         | Name               | Price | Category   |
|-----------------------------|--------------------|-------|------------|
| weapon_training_sword       | Training Sword     | 50c   | weapon     |
| weapon_training_bow         | Training Bow       | 50c   | weapon     |
| weapon_training_staff       | Training Staff     | 50c   | weapon     |
| weapon_apprentice_wand      | Apprentice Wand    | 75c   | weapon     |
| consumable_minor_health_potion | Minor Health Potion | 25c | consumable |
| consumable_minor_mana_potion  | Minor Mana Potion  | 25c | consumable |
| armor_head_cloth            | Cloth Cap          | 40c   | armor      |
| armor_chest_leather         | Leather Vest       | 60c   | armor      |
| armor_legs_cloth            | Cloth Leggings     | 40c   | armor      |
| armor_feet_leather          | Leather Boots      | 45c   | armor      |

**Source:** [shared/economy.js](../../shared/economy.js), [server/ws/handlers/vendor.js](../../server/ws/handlers/vendor.js)

## 4.4 Vendor Contracts

- Vendors expose up to **3 rotating contract offers** at a time
- Rotation uses a deterministic 10-minute bucket (`CONTRACT_ROTATION_MS`)
- Contract types:
  - `hunt`
  - `gather`
  - `craft`
  - `delivery`
- Players may hold up to **3 active contracts** at once
- The same contract template cannot be accepted twice at the same time
- Contracts are turned in at the issuing vendor
- Rewards can include:
  - character XP
  - copper
  - profession mastery XP

The current pool is inferred from vendor identity:

- hub vendors (`vendor_c_*`) use the starter/general pool
- the outpost vendor (`vendor_sw_01`) uses the outpost/general pool

**Source:** [shared/contracts.js](../../shared/contracts.js), [server/logic/contracts.js](../../server/logic/contracts.js), [server/ws/handlers/contracts.js](../../server/ws/handlers/contracts.js), [client/ui-state.js](../../client/ui-state.js)

---

# 5. Player-to-Player Trading

## 5.1 Overview

Players can trade items and copper directly with each other. Trading is opt-in: one player requests a trade, the other must accept.

## 5.2 Flow

1. Player A targets Player B and clicks "Trade" (or sends `tradeRequest`).
2. Player B receives `tradeRequestReceived`; can Accept or Decline.
3. On Accept: both receive `tradeOpened`; trade panel opens.
4. Each player adds items (drag from inventory to offer area) and/or copper.
5. Both click Confirm; when both are confirmed, server executes the swap.
6. Either player can Cancel at any time before both confirm.

## 5.3 Constraints

- Both players must be within 5m range, alive, and not already trading.
- Offers are validated on execute: inventory space, copper availability.
- On disconnect or Cancel, offered items are returned to the owner.

## 5.4 Protocol

See [Network Protocol Specification](../network/spec_protocol.md) for full message contracts.

**Source:** [server/logic/trade.js](../../server/logic/trade.js), [server/ws/handlers/trade.js](../../server/ws/handlers/trade.js), [client/trade.js](../../client/trade.js)

---

# 6. Mob Loot Drops

## 6.1 Overview

When a mob is killed, the killer (or the player who applied the killing DOT) receives loot based on the mob's loot table. Each mob type has a configurable table of item drops with chance and quantity ranges.

## 6.2 Loot Table Format

**Source:** [shared/lootTables.js](../../shared/lootTables.js)

Each entry: `{ kind, minCount, maxCount, chancePct }`

- `chancePct`: 0–100; rolled once per kill (100 = guaranteed)
- `minCount` / `maxCount`: quantity range if drop succeeds

## 6.3 Per-Mob Tables

| mobType | Sample drops |
|---------|--------------|
| fox | flower (40%), herb (20%) |
| stag | herb (50%), flower (35%), wood (15%) |
| wolf | herb (60%), ore (25%), consumable_minor_health_potion (5%) |
| orc | ore (80%), crystal (30%), herb (25%), weapon_training_sword (2%), armor_chest_leather (1%) |
| dummy | (no loot) |

## 6.4 Integration

- Loot is granted in `applyDamageToMob` (combat.js) when `mob.hp <= 0`.
- Recipient is the attacker (solo) or DOT source player.
- Uses shared `nextItemIdRef` for new item IDs; items added via `addItem`.

**Source:** [server/logic/loot.js](../../server/logic/loot.js), [server/logic/combat.js](../../server/logic/combat.js)

---

# 7. Crafting

## 7.1 Overview

Crafting consumes ingredients from inventory and produces output items.

- **Portable recipes** can be crafted anywhere
- **Station recipes** require the player to stand near a structure-derived station

Current station mapping is inferred from existing structure kinds (no extra map field):

- `barracks` -> `forge`
- `market` -> `alchemy_table`
- `storage` -> `workbench`

## 7.2 Recipe Format

```js
{
  id: string,
  name?: string,
  inputs: [{ kind: string, count: number }, ...],
  output: { kind: string, count: number },
  category?: string,
  profession?: 'smithing' | 'alchemy' | 'woodcraft',
  stationType?: 'forge' | 'alchemy_table' | 'workbench' | null,
  masteryLevelRequired?: number,
  portable?: boolean,
  outputRarity?: 'common' | 'uncommon' | 'rare',
  unlockAtMasteryLevel?: number
}
```

## 7.3 Recipes

Starter portable recipes:

| ID | Inputs | Output | Notes |
|---|---|---|---|
| `ore_crystal_sword` | 2 ore, 1 crystal | Training Sword × 1 | portable |
| `herb_health_potion` | 2 herb | Minor Health Potion × 1 | portable |
| `herb_mana_potion` | 2 herb, 1 crystal | Minor Mana Potion × 1 | portable |

Profession recipes:

| ID | Profession | Station | Unlock | Output |
|---|---|---|---|---|
| `smith_iron_blade` | smithing | forge | level 2 | Iron Blade |
| `smith_reinforced_training_sword` | smithing | forge | level 4 | Reinforced Training Sword |
| `smith_crude_plate` | smithing | forge | level 5 | Crude Plate Vest |
| `alchemy_strong_health` | alchemy | alchemy_table | level 2 | Strong Health Potion |
| `alchemy_strong_mana` | alchemy | alchemy_table | level 3 | Strong Mana Potion |
| `alchemy_cleansing_tonic` | alchemy | alchemy_table | level 5 | Cleansing Tonic |
| `woodcraft_reinforced_bow` | woodcraft | workbench | level 2 | Reinforced Training Bow |
| `woodcraft_travel_kit` | woodcraft | workbench | level 3 | Travel Kit |
| `woodcraft_focus_component` | woodcraft | workbench | level 5 | Wooden Focus |

## 7.4 Protocol

**Client → Server:** `craft` message

```json
{
  "type": "craft",
  "recipeId": "smith_iron_blade",
  "count": 1,
  "seq": 1
}
```

- `recipeId`: Required, non-empty string
- `count`: Optional, integer `1..99`, default `1`

## 7.5 Server Logic

1. Look up recipe by `recipeId`; reject if not found
2. Reject if the recipe is not in `player.knownRecipes`
3. If the recipe has `stationType`, validate proximity to a matching station within `STATION_INTERACT_RADIUS` (`4.5`)
4. Validate ingredients using `countItem`
5. Consume ingredients via `consumeItems`
6. Create output:
   - weapons use `createWeaponItem`
   - other items use a generic item object
7. Profession gear outputs can receive durability metadata (`rarity`, `durability`, `maxDurability`, `craftedProfession`, `sourceRecipeId`)
8. Add output to inventory; rollback consumed inputs on failure
9. Update:
   - `player.inv`
   - profession mastery XP for the crafting profession
   - recipe unlocks when mastery thresholds are crossed
   - matching craft-contract progress

**Source:** [shared/recipes.js](../../shared/recipes.js), [shared/professions.js](../../shared/professions.js), [server/ws/handlers/craft.js](../../server/ws/handlers/craft.js), [server/logic/contracts.js](../../server/logic/contracts.js)

## 7.6 UI

- Inventory panel now contains:
  - `Inventory`
  - `Craft`
  - `Journal`
- Craft tab shows:
  - known recipes only
  - ingredients (`have / need`)
  - required station badges
  - count input
  - craft button
- The HUD shows a compact objective tracker for active contracts
- Journal shows:
  - active contracts
  - profession masteries
  - known recipes
  - maintenance actions (repair / salvage)

**Source:** [client/crafting.js](../../client/crafting.js), [client/journal.js](../../client/journal.js), [client/ui-state.js](../../client/ui-state.js), [client/ui.js](../../client/ui.js)

## 7.7 Profession Mastery

Implemented profession tracks:

- `gathering`
- `smithing`
- `alchemy`
- `woodcraft`

Rules:

- gathering XP is earned on successful harvest
- profession XP is earned on successful profession craft
- contracts may also grant mastery XP
- mastery level curve: `100 + (level - 1) * 50`
- mastery cap: `10`

Mastery progression unlocks additional recipes and modifies:

- repair cost discounts at levels `3`, `6`, `9`
- salvage yield increases at levels `4`, `8`

## 7.8 Durability, Repair, and Salvage

- Only non-starter crafted gear uses durability
- Current durability tiers:
  - `common = 20`
  - `uncommon = 30`
  - `rare = 40`
  - `epic = 50`
- Broken items remain equipped/in inventory but:
  - contribute no stats
  - cannot be sold to vendors
- Repair:
  - only works near a vendor
  - restores full durability
  - costs copper based on missing durability
  - `rare` items also consume one profession material
- Salvage:
  - only works on unequipped crafted items in inventory
  - destroys the item
  - returns deterministic material output from the source recipe

**Source:** [shared/equipment.js](../../shared/equipment.js), [server/ws/handlers/inventory.js](../../server/ws/handlers/inventory.js)

---

# 8. Item Display Names

`getItemDisplayName(kind)` resolves fallback display names in order:

1. `VENDOR_BUY_ITEMS` (weapons, consumables, armor)
2. `RESOURCE_TYPES` (crystal, ore, herb)
3. Fallback: `kind` with underscores replaced by spaces, title-cased

Most UI surfaces prefer the stored item name (`item.name`) when present, then fall back to `getItemDisplayName(kind)`.

**Source:** [shared/economy.js](../../shared/economy.js), [client/ui-state.js](../../client/ui-state.js), [client/crafting.js](../../client/crafting.js)

---

# 9. Configuration Summary

| Config              | Default | Description                    |
|---------------------|---------|--------------------------------|
| playerInvSlots      | 20      | Inventory slot count          |
| playerInvStackMax   | 20      | Max stack per slot             |
| harvestRadius       | 2.2     | Distance to harvest resources  |
| stationInteractRadius | 4.5   | Distance to use profession stations |
| contractRotationMs  | 600,000 | Contract offer rotation window |
| maxActiveContracts  | 3       | Maximum active contracts |
| respawnMs           | per-type| Resource respawn (ms) — see RESOURCE_TYPES |
| vendorInteractRadius| 2.5     | Distance to interact with vendor |
| corpseExpiryMs      | 600,000 | Corpse despawn (ms, 10 min)    |
| corpseLootRadius    | 2.5     | Distance to loot corpse        |

**Source:** [shared/config.js](../../shared/config.js), [shared/professions.js](../../shared/professions.js), [server/logic/world.js](../../server/logic/world.js)
