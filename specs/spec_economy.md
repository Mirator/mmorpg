# Economy and Crafting Specification

This document describes the currency system, vendor trading, resource harvesting, and crafting/recipe system as implemented in the codebase.

---

# 1. Currency

## 1.1 Units

All currency is stored as **copper** (integer). Display uses gold, silver, and copper:

| Unit   | Conversion              |
|--------|-------------------------|
| Copper | 1c = 1 copper           |
| Silver | 1s = 100 copper         |
| Gold   | 1g = 1 silver = 100 copper |

Constants: `COPPER_PER_SILVER = 100`, `SILVER_PER_GOLD = 100`, `COPPER_PER_GOLD = 10,000`

## 1.2 Display

- `splitCurrency(totalCopper)` → `{ gold, silver, copper }`
- `formatCurrency(totalCopper)` → `"Xg Ys Zc"` (e.g. `"1g 25s 50c"`)

**Source:** [shared/economy.js](shared/economy.js)

---

# 2. Inventory

## 2.1 Structure

- **Slots:** Array of `{ id?, kind, name?, count } | null`
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

**Source:** [server/logic/inventory.js](server/logic/inventory.js)

## 2.3 Death

Inventory is cleared on death. Currency is retained.

---

# 3. Resource Harvesting

## 3.1 Resource Nodes

Resource nodes are placed in the world (from map config). Each node has:

- `id`, `x`, `z`, `type` (crystal | ore | herb)

## 3.2 Harvest Flow

1. Player presses E within `harvestRadius` (default: 2.2) of an available node
2. Server finds closest available node
3. Item is added to inventory based on node `type`
4. Node becomes unavailable for `respawnMs` (default: 15,000 ms)

## 3.3 Resource Types and Output

| Type    | Item Kind | Item Name   | Sell Price |
|---------|-----------|-------------|------------|
| crystal | crystal   | Crystal     | 10c        |
| ore     | ore       | Iron Ore    | 15c        |
| herb    | herb      | Healing Herb| 12c        |

**Source:** [shared/economy.js](shared/economy.js) `RESOURCE_TYPES`, [server/logic/resources.js](server/logic/resources.js)

---

# 4. Vendor Trading

## 4.1 Interaction

- Player must be within `vendorInteractRadius` (default: 2.5) of vendor
- Press E to open vendor dialog; "Trade" opens the trade panel

## 4.2 Selling

- Drag item from inventory to vendor drop zone
- Only items with a configured sell price can be sold
- Sell prices (per unit):

| Kind   | Price |
|--------|-------|
| crystal| 10c   |
| ore    | 15c   |
| herb   | 12c   |

- Item is removed from inventory; copper is added to player

## 4.3 Buying

- Buy tab lists items from `VENDOR_BUY_ITEMS`
- Each item has `kind`, `name`, `priceCopper`, `category`
- Player pays `priceCopper × count`; item is added to inventory
- Count is clamped to 1–99 per transaction

### Buy Catalog

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

**Source:** [shared/economy.js](shared/economy.js), [server/ws.js](server/ws.js) (vendorSell, vendorBuy handlers)

---

# 5. Crafting

## 5.1 Overview

Crafting consumes ingredients from inventory and produces output items. No location or station required; crafting can be done anywhere.

## 5.2 Recipe Format

```js
{
  id: string,           // Unique recipe identifier
  name?: string,        // Display name for output
  inputs: [             // Required ingredients
    { kind: string, count: number },
    ...
  ],
  output: { kind: string, count: number },
  category?: string      // e.g. "weapon", "consumable"
}
```

## 5.3 Recipes

| ID                 | Inputs              | Output                    | Category   |
|--------------------|---------------------|---------------------------|------------|
| ore_crystal_sword  | 2 ore, 1 crystal   | Training Sword × 1        | weapon     |
| herb_health_potion | 2 herb             | Minor Health Potion × 1   | consumable |
| herb_mana_potion   | 2 herb, 1 crystal  | Minor Mana Potion × 1     | consumable |

## 5.4 Protocol

**Client → Server:** `craft` message

```json
{
  "type": "craft",
  "recipeId": "ore_crystal_sword",
  "count": 1,
  "seq": 1
}
```

- `recipeId`: Required, non-empty string
- `count`: Optional, integer 1–99, default 1 (number of times to craft)

## 5.5 Server Logic

1. Look up recipe by `recipeId`; reject if not found
2. For each input: `countItem(inventory, kind) >= input.count × craftCount`
3. Consume all inputs via `consumeItems`
4. Create output: weapons use `createWeaponItem`, others use generic `{ id, kind, name, count }`
5. Add output to inventory; if add fails, rollback consumed ingredients
6. Update `player.inv` and mark dirty for persistence

**Source:** [shared/recipes.js](shared/recipes.js), [shared/protocol.js](shared/protocol.js), [server/ws.js](server/ws.js)

## 5.6 UI

- Craft tab in inventory panel (I key)
- Recipe list with ingredients (have/need), output, count input, Craft button
- Craft button disabled when ingredients insufficient
- `getItemDisplayName(kind)` used for display names

**Source:** [client/crafting.js](client/crafting.js), [client/ui-state.js](client/ui-state.js)

---

# 6. Item Display Names

`getItemDisplayName(kind)` resolves display names in order:

1. `VENDOR_BUY_ITEMS` (weapons, consumables, armor)
2. `RESOURCE_TYPES` (crystal, ore, herb)
3. Fallback: `kind` with underscores replaced by spaces, title-cased

**Source:** [shared/economy.js](shared/economy.js)

---

# 7. Configuration Summary

| Config              | Default | Description                    |
|---------------------|---------|--------------------------------|
| playerInvSlots      | 20      | Inventory slot count          |
| playerInvStackMax   | 20      | Max stack per slot             |
| harvestRadius       | 2.2     | Distance to harvest resources  |
| respawnMs           | 15,000  | Resource node respawn (ms)     |
| vendorInteractRadius| 2.5     | Distance to interact with vendor |

**Source:** [shared/config.js](shared/config.js), [server/logic/world.js](server/logic/world.js)
