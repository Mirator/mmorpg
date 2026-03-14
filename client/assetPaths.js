// @ts-check
import { MEDIEVAL_BUILDING_KINDS } from '../shared/medievalBuildings.js';
import { assetUrl } from './asset-url.js';

const ASSET_ROOT = '/assets/quaternius';
const NATURE_ROOT = '/assets/nature';
const MEDIEVAL_ROOT = '/assets/medieval';
const MEDIEVAL_PARTS_ROOT = '/assets/medieval/parts';
const ENV_ROOT = '/assets/environment';
const RESOURCES_ROOT = '/assets/resources';
const RESOURCES_CRYSTALS_ROOT = `${RESOURCES_ROOT}/crystals`;
const WEAPONS_ROOT = '/assets/weapons';

/**
 * @param {string} root
 * @param {string} [relative]
 */
function assetPath(root, relative = '') {
  const normalizedRelative = String(relative ?? '').replace(/^\/+/, '');
  return assetUrl(normalizedRelative ? `${root}/${normalizedRelative}` : root);
}

export const ASSET_PATHS = {
  playerModel: assetPath(ASSET_ROOT, 'outfits/Male_Peasant.gltf'),
  vendorModel: assetPath(ASSET_ROOT, 'outfits/Male_Ranger.gltf'),
  villageCenterModel: assetPath(ENV_ROOT, 'TownCenter_FirstAge_Level1.gltf'),
  corpseMarker: assetPath(ENV_ROOT, 'graveyard/grave.glb'),
  playerBase: assetPath(ASSET_ROOT, 'base/Superhero_Male_FullBody.gltf'),
  playerHeadSource: assetPath(ASSET_ROOT, 'base/Superhero_Male_FullBody.gltf'),
  playerHeadHoodSource: assetPath(ASSET_ROOT, 'base/Hair_SimpleParted.gltf'),
  playerOutfit: assetPath(ASSET_ROOT, 'outfits/Male_Peasant.gltf'),
  playerAnimations: assetPath(ASSET_ROOT, 'animations/UAL1_Standard.glb'),
  monsters: {
    orc: assetUrl('/assets/monsters/Orc.gltf'),
    demon: assetUrl('/assets/monsters/Demon.gltf'),
    yeti: assetUrl('/assets/monsters/Yeti.gltf'),
    tribal: assetUrl('/assets/monsters/Tribal.gltf'),
    wolf: assetUrl('/assets/animals/Wolf.gltf'),
    fox: assetUrl('/assets/animals/Fox.gltf'),
    bull: assetUrl('/assets/animals/Bull.gltf'),
    stag: assetUrl('/assets/animals/Stag.gltf'),
    dummy: assetPath(ENV_ROOT, 'Practice_Dummy.glb'),
  },
  groundTexture: assetUrl('/assets/textures/grass.png'),
  rocks: [
    assetPath(NATURE_ROOT, 'Rock_Medium_1.gltf'),
    assetPath(NATURE_ROOT, 'Rock_Medium_2.gltf'),
    assetPath(NATURE_ROOT, 'Rock_Medium_3.gltf'),
  ],
  environment: {
    bellTower: assetPath(ENV_ROOT, 'Bell_Tower.glb'),
    market: assetPath(ENV_ROOT, 'Inn.glb'),
    houseA: assetPath(ENV_ROOT, 'House_1.glb'),
    houseB: assetPath(ENV_ROOT, 'House_2.glb'),
    barracks: assetPath(ENV_ROOT, 'Blacksmith.glb'),
    storage: assetPath(ENV_ROOT, 'Mill.glb'),
    trees: assetPath(ASSET_ROOT, 'environment/Resource_Tree_Group_Cut.gltf'),
  },
  medieval: {
    floor: assetPath(MEDIEVAL_ROOT, 'Floor_Brick.gltf'),
    corner: assetPath(MEDIEVAL_ROOT, 'Corner_Exterior_Brick.gltf'),
    parts: {
      floorWoodLight: assetPath(MEDIEVAL_PARTS_ROOT, 'Floor_WoodLight.gltf'),
      floorWoodDark: assetPath(MEDIEVAL_PARTS_ROOT, 'Floor_WoodDark.gltf'),
      floorBrick: assetPath(MEDIEVAL_PARTS_ROOT, 'Floor_Brick.gltf'),
      floorRedBrick: assetPath(MEDIEVAL_PARTS_ROOT, 'Floor_RedBrick.gltf'),
      wallPlasterStraight: assetPath(MEDIEVAL_PARTS_ROOT, 'Wall_Plaster_Straight.gltf'),
      wallUnevenStraight: assetPath(MEDIEVAL_PARTS_ROOT, 'Wall_UnevenBrick_Straight.gltf'),
      wallPlasterDoorFlat: assetPath(MEDIEVAL_PARTS_ROOT, 'Wall_Plaster_Door_Flat.gltf'),
      wallUnevenDoorFlat: assetPath(MEDIEVAL_PARTS_ROOT, 'Wall_UnevenBrick_Door_Flat.gltf'),
      doorFrameFlatWoodDark: assetPath(MEDIEVAL_PARTS_ROOT, 'DoorFrame_Flat_WoodDark.gltf'),
      doorFrameFlatBrick: assetPath(MEDIEVAL_PARTS_ROOT, 'DoorFrame_Flat_Brick.gltf'),
      doorFlat: assetPath(MEDIEVAL_PARTS_ROOT, 'Door_2_Flat.gltf'),
      wallArch: assetPath(MEDIEVAL_PARTS_ROOT, 'Wall_Arch.gltf'),
      cornerWood: assetPath(MEDIEVAL_PARTS_ROOT, 'Corner_Exterior_Wood.gltf'),
      cornerBrick: assetPath(MEDIEVAL_PARTS_ROOT, 'Corner_Exterior_Brick.gltf'),
      roofWood: assetPath(MEDIEVAL_PARTS_ROOT, 'Roof_Wooden_2x1.gltf'),
      roofRound: assetPath(MEDIEVAL_PARTS_ROOT, 'Roof_RoundTile_2x1.gltf'),
      roofRound6x6: assetPath(MEDIEVAL_PARTS_ROOT, 'Roof_RoundTiles_6x6.gltf'),
      roofRound6x8: assetPath(MEDIEVAL_PARTS_ROOT, 'Roof_RoundTiles_6x8.gltf'),
      roofRound6x10: assetPath(MEDIEVAL_PARTS_ROOT, 'Roof_RoundTiles_6x10.gltf'),
      roofRound8x8: assetPath(MEDIEVAL_PARTS_ROOT, 'Roof_RoundTiles_8x8.gltf'),
      roofRound8x10: assetPath(MEDIEVAL_PARTS_ROOT, 'Roof_RoundTiles_8x10.gltf'),
      roofRound8x12: assetPath(MEDIEVAL_PARTS_ROOT, 'Roof_RoundTiles_8x12.gltf'),
      roofFrontBrick6: assetPath(MEDIEVAL_PARTS_ROOT, 'Roof_Front_Brick6.gltf'),
      roofFrontBrick8: assetPath(MEDIEVAL_PARTS_ROOT, 'Roof_Front_Brick8.gltf'),
      roofTower: assetPath(MEDIEVAL_PARTS_ROOT, 'Roof_Tower_RoundTiles.gltf'),
    },
  },
  armorOutfits: {
    cloth: assetPath(ASSET_ROOT, 'outfits/Male_Peasant.gltf'),
    leather: assetPath(ASSET_ROOT, 'outfits/Male_Ranger.gltf'),
  },
  consumables: {
    healthPotion: assetUrl('/assets/consumables/Bottle1.glb'),
    manaPotion: assetUrl('/assets/consumables/Bottle2.glb'),
  },
  weapons: {
    sword: assetPath(WEAPONS_ROOT, 'Sword.glb'),
    bow: assetPath(WEAPONS_ROOT, 'Bow_Wooden.glb'),
    staff: assetPath(WEAPONS_ROOT, 'Staff_Wizard.glb'),
    wand: assetPath(WEAPONS_ROOT, 'Wand_Apprentice.glb'),
    offhandFocus: assetPath(WEAPONS_ROOT, 'Offhand_Wooden_Focus.glb'),
    axe: assetPath(WEAPONS_ROOT, 'Axe.glb'),
    spear: assetPath(WEAPONS_ROOT, 'Spear.glb'),
    dagger: assetPath(WEAPONS_ROOT, 'Dagger.glb'),
  },
  resourceNodes: {
    crystal: assetPath(RESOURCES_ROOT, 'Crystal1.glb'),
    ore: assetPath(RESOURCES_ROOT, 'nodes/ore/Resource_Rock_1.gltf'),
    herb: assetPath(RESOURCES_ROOT, 'nodes/herb/Plant_1.gltf'),
    tree: assetPath(NATURE_ROOT, 'CommonTree_1.gltf'),
    flower: assetPath(RESOURCES_ROOT, 'nodes/flower/Flower_3_Single.gltf'),
  },
  resourceNodeVariants: {
    crystal: [
      assetPath(RESOURCES_CRYSTALS_ROOT, 'Crystal.glb'),
      assetPath(RESOURCES_CRYSTALS_ROOT, 'Crystal-MlhTJAFuJY.glb'),
      assetPath(RESOURCES_CRYSTALS_ROOT, 'Crystal-WzWPKHFMkL.glb'),
    ],
  },
};

/**
 * Maps armor kind prefix to outfit style for character visuals.
 * Used when equipment-based outfit swapping is implemented.
 */
export const ARMOR_TO_OUTFIT = {
  armor_head_cloth: 'cloth',
  armor_chest_leather: 'leather',
  armor_legs_cloth: 'cloth',
  armor_feet_leather: 'leather',
  armor_chest_crude_plate: 'leather',
};

/** Maps normalized outfit style to full player outfit model path. */
export const OUTFIT_STYLE_MODEL_PATHS = {
  cloth: ASSET_PATHS.armorOutfits.cloth,
  leather: ASSET_PATHS.armorOutfits.leather,
};

/**
 * Maps item kind to hand-held model path. Null means use procedural placeholder.
 */
export const EQUIPMENT_MODEL_PATHS = {
  weapon_training_sword: ASSET_PATHS.weapons.sword,
  weapon_iron_blade: ASSET_PATHS.weapons.sword,
  weapon_reinforced_training_sword: ASSET_PATHS.weapons.sword,
  weapon_training_bow: ASSET_PATHS.weapons.bow,
  weapon_reinforced_training_bow: ASSET_PATHS.weapons.bow,
  weapon_training_staff: ASSET_PATHS.weapons.staff,
  weapon_apprentice_wand: ASSET_PATHS.weapons.wand,
  offhand_wooden_focus: ASSET_PATHS.weapons.offhandFocus,
};

/** Maps item kind to consumable model path for inventory/crafting UI. */
export const CONSUMABLE_MODEL_PATHS = {
  consumable_minor_health_potion: ASSET_PATHS.consumables.healthPotion,
  consumable_minor_mana_potion: ASSET_PATHS.consumables.manaPotion,
};

/**
 * Returns the list of assets to preload for game entry.
 * Used by preloadAllAssets and by unit tests.
 */
export function getPreloadAssetList() {
  const resourceNodeVariants = Object.values(ASSET_PATHS.resourceNodeVariants ?? {}).flatMap((/** @type {any} */ list) =>
    Array.isArray(list) ? list : []
  );
  const environment = Object.entries(ASSET_PATHS.environment ?? {})
    .filter(([key]) => !MEDIEVAL_BUILDING_KINDS.has(key))
    .map(([, value]) => value);
  const medievalParts = Object.values(ASSET_PATHS.medieval?.parts ?? {});
  return {
    player: ['assemblePlayerModel', 'loadPlayerAnimations'],
    vendor: [ASSET_PATHS.vendorModel],
    villageCenter: [],
    corpses: [ASSET_PATHS.corpseMarker],
    mobs: Object.values(ASSET_PATHS.monsters),
    environment,
    medievalParts,
    rocks: ASSET_PATHS.rocks ?? [],
    textures: [ASSET_PATHS.groundTexture],
    resourceNodes: [...new Set([...Object.values(ASSET_PATHS.resourceNodes), ...resourceNodeVariants])],
  };
}
