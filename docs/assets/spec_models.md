# 3D Models Specification

This document lists all available 3D models in the game, their asset paths, and expected usage. Asset paths are configured in [client/assetPaths.js](../../client/assetPaths.js).

---

## 1. Characters

### 1.1 Player

| Path | Model | Usage |
|------|-------|-------|
| `/assets/quaternius/outfits/Male_Peasant.gltf` | Male Peasant | Default player outfit; `playerModel`, `playerOutfit` |
| `/assets/quaternius/outfits/Male_Ranger.gltf` | Male Ranger | Vendor NPC; `vendorModel` |
| `/assets/quaternius/base/Superhero_Male_FullBody.gltf` | Superhero Base | Player skeleton base for outfit assembly |
| `/assets/quaternius/animations/UAL1_Standard.glb` | UAL1 Standard | Player animation clips (idle, walk, run, etc.) |

**Source:** Modular Character Outfits (quaternius), Universal Animation Library

---

## 2. Monsters (Mobs)

Models are selected by `mobType` from spawn config. Used in `buildMobMesh` / `hydrateMobMesh`.

| mobType | Path | Model |
|---------|------|-------|
| orc | `/assets/monsters/Orc.gltf` | Orc |
| demon | `/assets/monsters/Demon.gltf` | Demon |
| yeti | `/assets/monsters/Yeti.gltf` | Yeti |
| tribal | `/assets/monsters/Tribal.gltf` | Tribal |
| wolf | `/assets/animals/Wolf.gltf` | Wolf |
| fox | `/assets/animals/Fox.gltf` | Fox |
| bull | `/assets/animals/Bull.gltf` | Bull |
| stag | `/assets/animals/Stag.gltf` | Stag |
| dummy | `/assets/environment/Practice_Dummy.glb` | Practice Dummy |

**Source:** Ultimate Monsters, Ultimate Animated Animals (quaternius)

---

## 3. Environment

### 3.1 Village Buildings (Modular MegaKit)

All migrated building kinds are assembled at runtime from `ASSET_PATHS.medieval.parts` via shared templates in [shared/medievalBuildings.js](../../shared/medievalBuildings.js), not from single `.glb` structure files.

| Kind | Template footprint (tiles) | Doors/openings | Notes |
|------|----------------------------|----------------|-------|
| houseA | 3x3 | 1 south door | Wood light floor, plaster walls |
| houseB | 4x3 | 1 south door | Wood dark floor, plaster walls |
| market | 5x4 | South arch opening + rear door | Brick floor, plaster walls |
| barracks | 5x3 | 1 south door | Wood dark floor, uneven-brick walls |
| storage | 4x4 | 1 east door | Red-brick floor, uneven-brick walls |
| bellTower | 2x2 | 1 south door | Tower roof variant |
| villageCenter | 6x5 | South + north doors | Brick/wood mixed floor |

### 3.2 Corpse Marker + Legacy Rollback Assets

| Purpose | Path | Status |
|---------|------|--------|
| Corpse marker | `/assets/environment/graveyard/grave.glb` | Active |
| Legacy village-center model | `/assets/environment/TownCenter_FirstAge_Level1.gltf` | Kept on disk for rollback; not used in migrated runtime path |

**Source:** Kenney Graveyard Kit, Ultimate Fantasy RTS (legacy rollback asset)

### 3.3 Additional Environment (Legacy / Unused in Current Placements)

| Path | Model |
|------|-------|
| `/assets/environment/House_3.glb` | House 3 |
| `/assets/environment/House_4.glb` | House 4 |
| `/assets/environment/Sawmill.glb` | Sawmill |
| `/assets/environment/Stable.glb` | Stable |
| `/assets/quaternius/environment/Resource_Tree_Group_Cut.gltf` | Tree Group (preloaded/reserved; not currently placed by map structures) |

### 3.4 Obstacles (Rocks)

Randomly placed as obstacles. One of three variants per obstacle.

| Path | Model |
|------|-------|
| `/assets/nature/Rock_Medium_1.gltf` | Rock Medium 1 |
| `/assets/nature/Rock_Medium_2.gltf` | Rock Medium 2 |
| `/assets/nature/Rock_Medium_3.gltf` | Rock Medium 3 |

**Source:** Stylized Nature MegaKit

### 3.5 Medieval MegaKit Parts (Active Runtime Set)

Synced into `client/assets/medieval/parts/` and loaded by key through `ASSET_PATHS.medieval.parts`.

| Path | Model |
|------|-------|
| `/assets/medieval/parts/Floor_WoodLight.gltf` | Wood light floor tile |
| `/assets/medieval/parts/Floor_WoodDark.gltf` | Wood dark floor tile |
| `/assets/medieval/parts/Floor_Brick.gltf` | Brick floor tile |
| `/assets/medieval/parts/Floor_RedBrick.gltf` | Red-brick floor tile |
| `/assets/medieval/parts/Wall_Plaster_Straight.gltf` | Plaster wall segment |
| `/assets/medieval/parts/Wall_UnevenBrick_Straight.gltf` | Uneven-brick wall segment |
| `/assets/medieval/parts/Door_2_Flat.gltf` | Door segment |
| `/assets/medieval/parts/Wall_Arch.gltf` | Arch opening segment |
| `/assets/medieval/parts/Corner_Exterior_Wood.gltf` | Wood corner |
| `/assets/medieval/parts/Corner_Exterior_Brick.gltf` | Brick corner |
| `/assets/medieval/parts/Roof_Wooden_2x1.gltf` | Wood roof segment |
| `/assets/medieval/parts/Roof_RoundTile_2x1.gltf` | Round-tile roof segment |
| `/assets/medieval/parts/Roof_Tower_RoundTiles.gltf` | Tower roof segment |

Shared MegaKit textures (`22` PNGs) are copied into the same folder and reused by these parts.

**Source:** Medieval Village MegaKit

---

## 4. Resource Nodes

Mineable resource visuals. Selected by `resource.type` in `buildResourceMesh` / `hydrateResourceMesh`.

| resourceType | Path | Model |
|--------------|------|-------|
| crystal | `/assets/resources/Crystal1.glb` (fallback), `/assets/resources/crystals/Crystal.glb`, `/assets/resources/crystals/Crystal-MlhTJAFuJY.glb`, `/assets/resources/crystals/Crystal-WzWPKHFMkL.glb` | Crystal Pack variants |
| ore | `/assets/resources/nodes/ore/Resource_Rock_1.gltf` | Resource Rock |
| herb | `/assets/resources/nodes/herb/Plant_1.gltf` | Plant 1 |
| tree | `/assets/resources/nodes/tree/Resource_Tree_Group_Cut.gltf` | Tree Group Cut |
| flower | `/assets/resources/nodes/flower/Flower_3_Single.gltf` | Flower 3 Single |

**Source:** Poly Pizza Crystal Pack by iPoly3D (CC0, crystal variants), Ultimate RPG Items Pack (legacy crystal fallback), Ultimate Fantasy RTS (ore/tree), Stylized Nature MegaKit (herb/flower)

---

## 5. Consumables

Item visuals for inventory/crafting UI. Mapped via `CONSUMABLE_MODEL_PATHS`.

| item kind | Path | Model |
|-----------|------|-------|
| consumable_minor_health_potion | `/assets/consumables/Bottle1.glb` | Bottle 1 |
| consumable_minor_mana_potion | `/assets/consumables/Bottle2.glb` | Bottle 2 |

**Source:** Ultimate Food Pack

---

## 6. Weapons

Paths used for weapon/offhand visuals on characters (attach to hand/bone).

| weapon kind (logical) | Path | Model |
|-----------------------|------|-------|
| sword | `/assets/weapons/Sword.glb` | Sword |
| bow | `/assets/weapons/Bow_Wooden.glb` | Bow Wooden |
| staff | `/assets/weapons/Staff_Wizard.glb` | Wizard Staff |
| wand | `/assets/weapons/Wand_Apprentice.glb` | Apprentice Wand |
| offhand focus | `/assets/weapons/Offhand_Wooden_Focus.glb` | Wooden Focus |
| axe | `/assets/weapons/Axe.glb` | Axe |
| spear | `/assets/weapons/Spear.glb` | Spear |
| dagger | `/assets/weapons/Dagger.glb` | Dagger |

**Current mapped item kinds:** `weapon_training_sword`, `weapon_iron_blade`, `weapon_reinforced_training_sword`, `weapon_training_bow`, `weapon_reinforced_training_bow`, `weapon_training_staff`, `weapon_apprentice_wand`, `offhand_wooden_focus`

**Source:** Medieval Weapons Pack, Low Poly Weapon Pack with Image Texture (Kickin It Studios), PP Free Fantasy RPG Weapons, Poly Pizza

### 6.1 Avatar Placeholder Audit

| Visual slot | Item kind | Current source | Status | Notes |
|-------------|-----------|----------------|--------|-------|
| weapon | `weapon_training_staff` | `/assets/weapons/Staff_Wizard.glb` | exact | Imported from new hidden-resource weapon pack |
| weapon | `weapon_apprentice_wand` | `/assets/weapons/Wand_Apprentice.glb` | exact | Imported from new hidden-resource weapon pack |
| offhand | `offhand_wooden_focus` | `/assets/weapons/Offhand_Wooden_Focus.glb` | exact | Imported from Poly Pizza model `2ZbaY1ZaW6e` |
| head | `armor_head_cloth` | Current skinned overlay path | missing exact asset | No open-face cloth cap/hood asset was found in the reviewed hidden-resource folders |

---

## 7. Armor Outfits

Maps armor item kinds to character outfit style. Used when equipment-based outfit swapping is implemented.

| armor kind | Outfit key | Path |
|------------|------------|------|
| armor_head_cloth | cloth | `/assets/quaternius/outfits/Male_Peasant.gltf` |
| armor_chest_leather | leather | `/assets/quaternius/outfits/Male_Ranger.gltf` |
| armor_legs_cloth | cloth | `/assets/quaternius/outfits/Male_Peasant.gltf` |
| armor_feet_leather | leather | `/assets/quaternius/outfits/Male_Ranger.gltf` |

**Source:** `ARMOR_TO_OUTFIT` in assetPaths.js

---

## 8. Textures

| Path | Usage |
|------|-------|
| `/assets/textures/grass.png` | Ground tile texture |

**Source:** Stylized Nature MegaKit

---

## 9. Preload Order

Assets preloaded at game entry (see `getPreloadAssetList`):

1. Player (assemble + animations)
2. Vendor model
3. Corpse marker model
4. Mob models (all 9, including dummy)
5. Non-migrated environment models (currently reserved `trees`)
6. Medieval MegaKit part set (`ASSET_PATHS.medieval.parts`)
7. Rocks (3)
8. Resource node models (crystal + ore/tree/herb/flower)
9. Ground texture

---

## 10. Asset Conversion

FBX models from `hidden_resources` are converted to glTF/GLB via:

```bash
node scripts/convert-fbx-to-gltf.js
```

For Medieval Village MegaKit building migration, required modular parts and textures are synced via:

```bash
node scripts/sync-medieval-megakit-parts.js
```

That sync copies only the used building part subset (`.gltf` + `.bin`) plus the shared texture set into `client/assets/medieval/parts/`.

The conversion script skips files that already have a `.glb` equivalent. Source packs:

- **Ultimate Food Pack** → consumables
- **Medieval Village Pack** → environment
- **Medieval Weapons Pack** → sword/bow/axe/spear/dagger
- **Low Poly Weapon Pack with Image Texture (Kickin It Studios)** → staff
- **PP Free Fantasy RPG Weapons** → wand
- **Poly Pizza (`2ZbaY1ZaW6e`)** → offhand wooden focus
- **Poly Pizza Crystal Pack (`AywAG7aywi`)** → crystal resource variants
- **Ultimate RPG Items Pack** → legacy crystal fallback
