const ASSET_ROOT = '/assets/quaternius';
const NATURE_ROOT = '/assets/nature';
const MEDIEVAL_ROOT = '/assets/medieval';
const ENV_ROOT = '/assets/environment';
const RESOURCES_ROOT = '/assets/resources';
const WEAPONS_ROOT = '/assets/weapons';

export const ASSET_PATHS = {
  playerModel: `${ASSET_ROOT}/outfits/Male_Peasant.gltf`,
  vendorModel: `${ASSET_ROOT}/outfits/Male_Ranger.gltf`,
  playerBase: `${ASSET_ROOT}/base/Superhero_Male_FullBody.gltf`,
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
  },
  groundTexture: '/assets/textures/grass.png',
  rocks: [
    `${NATURE_ROOT}/Rock_Medium_1.gltf`,
    `${NATURE_ROOT}/Rock_Medium_2.gltf`,
    `${NATURE_ROOT}/Rock_Medium_3.gltf`,
  ],
  environment: {
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
    axe: `${WEAPONS_ROOT}/Axe.glb`,
    spear: `${WEAPONS_ROOT}/Spear.glb`,
    dagger: `${WEAPONS_ROOT}/Dagger.glb`,
  },
  resourceNodes: {
    crystal: `${RESOURCES_ROOT}/Crystal1.glb`,
    ore: `${RESOURCES_ROOT}/Crystal2.glb`,
    herb: `${RESOURCES_ROOT}/Crystal3.glb`,
    tree: `${RESOURCES_ROOT}/Crystal1.glb`,
    flower: `${RESOURCES_ROOT}/Crystal3.glb`,
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
  return {
    player: ['assemblePlayerModel', 'loadPlayerAnimations'],
    vendor: [ASSET_PATHS.vendorModel],
    mobs: Object.values(ASSET_PATHS.monsters),
    environment: Object.values(ASSET_PATHS.environment),
    rocks: ASSET_PATHS.rocks ?? [],
    textures: [ASSET_PATHS.groundTexture],
    resourceNodes: [...new Set(Object.values(ASSET_PATHS.resourceNodes))],
  };
}
