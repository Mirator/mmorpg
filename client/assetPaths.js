// @ts-check
const ASSET_ROOT = '/assets/quaternius';
const NATURE_ROOT = '/assets/nature';
const MEDIEVAL_ROOT = '/assets/medieval';
const ENV_ROOT = '/assets/environment';
const RESOURCES_ROOT = '/assets/resources';
const RESOURCES_CRYSTALS_ROOT = `${RESOURCES_ROOT}/crystals`;
const WEAPONS_ROOT = '/assets/weapons';

export const ASSET_PATHS = {
  playerModel: `${ASSET_ROOT}/outfits/Male_Peasant.gltf`,
  vendorModel: `${ASSET_ROOT}/outfits/Male_Ranger.gltf`,
  villageCenterModel: `${ENV_ROOT}/TownCenter_FirstAge_Level1.gltf`,
  corpseMarker: `${ENV_ROOT}/graveyard/grave.glb`,
  playerBase: `${ASSET_ROOT}/base/Superhero_Male_FullBody.gltf`,
  playerHeadSource: `${ASSET_ROOT}/base/Superhero_Male_FullBody.gltf`,
  playerHeadHoodSource: `${ASSET_ROOT}/base/Hair_SimpleParted.gltf`,
  playerOutfit: `${ASSET_ROOT}/outfits/Male_Peasant.gltf`,
  playerAnimations: `${ASSET_ROOT}/animations/UAL1_Standard.glb`,
  monsters: {
    orc: `/assets/monsters/Orc.gltf`,
    demon: `/assets/monsters/Demon.gltf`,
    yeti: `/assets/monsters/Yeti.gltf`,
    tribal: `/assets/monsters/Tribal.gltf`,
    wolf: `/assets/animals/Wolf.gltf`,
    fox: `/assets/animals/Fox.gltf`,
    bull: `/assets/animals/Bull.gltf`,
    stag: `/assets/animals/Stag.gltf`,
    dummy: `${ENV_ROOT}/Practice_Dummy.glb`,
  },
  groundTexture: '/assets/textures/grass.png',
  rocks: [
    `${NATURE_ROOT}/Rock_Medium_1.gltf`,
    `${NATURE_ROOT}/Rock_Medium_2.gltf`,
    `${NATURE_ROOT}/Rock_Medium_3.gltf`,
  ],
  environment: {
    bellTower: `${ENV_ROOT}/Bell_Tower.glb`,
    market: `${ENV_ROOT}/Inn.glb`,
    houseA: `${ENV_ROOT}/House_1.glb`,
    houseB: `${ENV_ROOT}/House_2.glb`,
    barracks: `${ENV_ROOT}/Blacksmith.glb`,
    storage: `${ENV_ROOT}/Mill.glb`,
    trees: `${ASSET_ROOT}/environment/Resource_Tree_Group_Cut.gltf`,
  },
  medieval: {
    floor: `${MEDIEVAL_ROOT}/Floor_Brick.gltf`,
    corner: `${MEDIEVAL_ROOT}/Corner_Exterior_Brick.gltf`,
  },
  armorOutfits: {
    cloth: `${ASSET_ROOT}/outfits/Male_Peasant.gltf`,
    leather: `${ASSET_ROOT}/outfits/Male_Ranger.gltf`,
  },
  consumables: {
    healthPotion: '/assets/consumables/Bottle1.glb',
    manaPotion: '/assets/consumables/Bottle2.glb',
  },
  weapons: {
    sword: `${WEAPONS_ROOT}/Sword.glb`,
    bow: `${WEAPONS_ROOT}/Bow_Wooden.glb`,
    staff: `${WEAPONS_ROOT}/Staff_Wizard.glb`,
    wand: `${WEAPONS_ROOT}/Wand_Apprentice.glb`,
    offhandFocus: `${WEAPONS_ROOT}/Offhand_Wooden_Focus.glb`,
    axe: `${WEAPONS_ROOT}/Axe.glb`,
    spear: `${WEAPONS_ROOT}/Spear.glb`,
    dagger: `${WEAPONS_ROOT}/Dagger.glb`,
  },
  resourceNodes: {
    crystal: `${RESOURCES_ROOT}/Crystal1.glb`,
    ore: `${RESOURCES_ROOT}/nodes/ore/Resource_Rock_1.gltf`,
    herb: `${RESOURCES_ROOT}/nodes/herb/Plant_1.gltf`,
    tree: `${NATURE_ROOT}/CommonTree_1.gltf`,
    flower: `${RESOURCES_ROOT}/nodes/flower/Flower_3_Single.gltf`,
  },
  resourceNodeVariants: {
    crystal: [
      `${RESOURCES_CRYSTALS_ROOT}/Crystal.glb`,
      `${RESOURCES_CRYSTALS_ROOT}/Crystal-MlhTJAFuJY.glb`,
      `${RESOURCES_CRYSTALS_ROOT}/Crystal-WzWPKHFMkL.glb`,
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
  return {
    player: ['assemblePlayerModel', 'loadPlayerAnimations'],
    vendor: [ASSET_PATHS.vendorModel],
    villageCenter: [ASSET_PATHS.villageCenterModel],
    corpses: [ASSET_PATHS.corpseMarker],
    mobs: Object.values(ASSET_PATHS.monsters),
    environment: Object.values(ASSET_PATHS.environment),
    rocks: ASSET_PATHS.rocks ?? [],
    textures: [ASSET_PATHS.groundTexture],
    resourceNodes: [...new Set([...Object.values(ASSET_PATHS.resourceNodes), ...resourceNodeVariants])],
  };
}
