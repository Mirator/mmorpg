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

**Source:** Ultimate Monsters, Ultimate Animated Animals (quaternius)

---

## 3. Environment

### 3.1 Village Buildings

Placed around the base in `loadEnvironmentModels`. Keys map to placement slots.

| Key | Path | Model | Placement |
|-----|------|-------|-----------|
| market | `/assets/environment/Inn.glb` | Inn | Central gathering |
| houseA | `/assets/environment/House_1.glb` | House 1 | South |
| houseB | `/assets/environment/House_2.glb` | House 2 | NE diagonal |
| barracks | `/assets/environment/Blacksmith.glb` | Blacksmith | West |
| storage | `/assets/environment/Mill.glb` | Mill | North |
| trees | `/assets/quaternius/environment/Resource_Tree_Group_Cut.gltf` | Tree Group | Tree clusters |

**Source:** Medieval Village Pack (Buildings), Ultimate Fantasy RTS (trees)

### 3.2 Additional Environment (Unused in Placements)

| Path | Model |
|------|-------|
| `/assets/environment/House_3.glb` | House 3 |
| `/assets/environment/House_4.glb` | House 4 |
| `/assets/environment/Sawmill.glb` | Sawmill |
| `/assets/environment/Stable.glb` | Stable |
| `/assets/environment/Bell_Tower.glb` | Bell Tower |

### 3.3 Obstacles (Rocks)

Randomly placed as obstacles. One of three variants per obstacle.

| Path | Model |
|------|-------|
| `/assets/nature/Rock_Medium_1.gltf` | Rock Medium 1 |
| `/assets/nature/Rock_Medium_2.gltf` | Rock Medium 2 |
| `/assets/nature/Rock_Medium_3.gltf` | Rock Medium 3 |

**Source:** Stylized Nature MegaKit

### 3.4 Medieval Structures (Unused)

| Path | Model |
|------|-------|
| `/assets/medieval/Floor_Brick.gltf` | Floor Brick |
| `/assets/medieval/Corner_Exterior_Brick.gltf` | Corner Exterior Brick |

**Source:** Medieval Village MegaKit

---

## 4. Resource Nodes

Mineable resource visuals. Selected by `resource.type` in `buildResourceMesh` / `hydrateResourceMesh`.

| resourceType | Path | Model |
|--------------|------|-------|
| crystal | `/assets/resources/Crystal1.glb` | Crystal 1 |
| ore | `/assets/resources/Crystal2.glb` | Crystal 2 |
| herb | `/assets/resources/Crystal3.glb` | Crystal 3 |
| tree | `/assets/resources/Crystal1.glb` | Crystal 1 |
| flower | `/assets/resources/Crystal3.glb` | Crystal 3 |

**Source:** Ultimate RPG Items Pack

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

Paths defined for future weapon visuals on characters (attach to hand/bone). Not yet wired to equipment.

| weapon kind (logical) | Path | Model |
|-----------------------|------|-------|
| sword | `/assets/weapons/Sword.glb` | Sword |
| bow | `/assets/weapons/Bow_Wooden.glb` | Bow Wooden |
| axe | `/assets/weapons/Axe.glb` | Axe |
| spear | `/assets/weapons/Spear.glb` | Spear |
| dagger | `/assets/weapons/Dagger.glb` | Dagger |

**Current weapon kinds:** `weapon_training_sword`, `weapon_training_bow`, `weapon_training_staff`, `weapon_apprentice_wand` — no model mapping yet.

**Source:** Medieval Weapons Pack

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
3. Mob models (all 8)
4. Environment models (6)
5. Rocks (3)
6. Resource node models (Crystal1, Crystal2, Crystal3)
7. Ground texture

---

## 10. Asset Conversion

FBX models from `hidden_resources` are converted to glTF/GLB via:

```bash
node scripts/convert-fbx-to-gltf.js
```

The script skips files that already have a `.glb` equivalent. Source packs:

- **Ultimate Food Pack** → consumables
- **Medieval Village Pack** → environment
- **Medieval Weapons Pack** → weapons
- **Ultimate RPG Items Pack** → resources
