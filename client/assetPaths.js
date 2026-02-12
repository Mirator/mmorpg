const ASSET_ROOT = '/assets/quaternius';

export const ASSET_PATHS = {
  playerModel: `${ASSET_ROOT}/outfits/Male_Peasant.gltf`,
  vendorModel: `${ASSET_ROOT}/outfits/Male_Ranger.gltf`,
  playerBase: `${ASSET_ROOT}/base/Superhero_Male_FullBody.gltf`,
  playerOutfit: `${ASSET_ROOT}/outfits/Male_Peasant.gltf`,
  playerAnimations: `${ASSET_ROOT}/animations/UAL1_Standard.glb`,
  monsters: {
    orc: `${ASSET_ROOT}/monsters/Orc.gltf`,
  },
  environment: {
    market: `${ASSET_ROOT}/environment/Market_FirstAge_Level1.gltf`,
    houseA: `${ASSET_ROOT}/environment/Houses_FirstAge_2_Level1.gltf`,
    houseB: `${ASSET_ROOT}/environment/Houses_FirstAge_3_Level1.gltf`,
    barracks: `${ASSET_ROOT}/environment/Barracks_FirstAge_Level1.gltf`,
    storage: `${ASSET_ROOT}/environment/Storage_FirstAge_Level1.gltf`,
    trees: `${ASSET_ROOT}/environment/Resource_Tree_Group_Cut.gltf`,
  },
};

/**
 * Returns the list of assets to preload for game entry.
 * Used by preloadAllAssets and by unit tests.
 */
export function getPreloadAssetList() {
  return {
    player: ['assemblePlayerModel', 'loadPlayerAnimations'],
    vendor: [ASSET_PATHS.vendorModel],
    mobs: [ASSET_PATHS.monsters.orc],
    environment: Object.values(ASSET_PATHS.environment),
  };
}
