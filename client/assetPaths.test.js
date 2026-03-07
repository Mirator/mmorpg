import { describe, it, expect } from 'vitest';
import {
  ASSET_PATHS,
  ARMOR_TO_OUTFIT,
  EQUIPMENT_MODEL_PATHS,
  OUTFIT_STYLE_MODEL_PATHS,
  getPreloadAssetList,
} from './assetPaths.js';

describe('assetPaths', () => {
  it('has expected ASSET_PATHS structure', () => {
    expect(ASSET_PATHS).toHaveProperty('playerModel');
    expect(ASSET_PATHS).toHaveProperty('vendorModel');
    expect(ASSET_PATHS).toHaveProperty('villageCenterModel');
    expect(ASSET_PATHS).toHaveProperty('corpseMarker');
    expect(ASSET_PATHS).toHaveProperty('playerBase');
    expect(ASSET_PATHS).toHaveProperty('playerHeadSource');
    expect(ASSET_PATHS).toHaveProperty('playerHeadHoodSource');
    expect(ASSET_PATHS).toHaveProperty('playerOutfit');
    expect(ASSET_PATHS).toHaveProperty('playerAnimations');
    expect(ASSET_PATHS).toHaveProperty('monsters');
    expect(ASSET_PATHS.monsters).toHaveProperty('orc');
    expect(ASSET_PATHS).toHaveProperty('environment');
    expect(ASSET_PATHS.environment).toHaveProperty('market');
    expect(ASSET_PATHS.environment).toHaveProperty('houseA');
    expect(ASSET_PATHS.environment).toHaveProperty('houseB');
    expect(ASSET_PATHS.environment).toHaveProperty('barracks');
    expect(ASSET_PATHS.environment).toHaveProperty('storage');
    expect(ASSET_PATHS.environment).toHaveProperty('trees');
    expect(ASSET_PATHS).toHaveProperty('medieval');
    expect(ASSET_PATHS.medieval).toHaveProperty('parts');
    expect(ASSET_PATHS.medieval.parts).toHaveProperty('wallPlasterStraight');
    expect(ASSET_PATHS.medieval.parts).toHaveProperty('wallPlasterDoorFlat');
    expect(ASSET_PATHS.medieval.parts).toHaveProperty('wallUnevenDoorFlat');
    expect(ASSET_PATHS.medieval.parts).toHaveProperty('doorFrameFlatWoodDark');
    expect(ASSET_PATHS.medieval.parts).toHaveProperty('doorFrameFlatBrick');
    expect(ASSET_PATHS.medieval.parts).toHaveProperty('roofFrontBrick6');
    expect(ASSET_PATHS.medieval.parts).toHaveProperty('roofFrontBrick8');
    expect(ASSET_PATHS.medieval.parts).toHaveProperty('roofTower');
    expect(ASSET_PATHS.medieval.parts).toHaveProperty('roofRound8x12');
    expect(ASSET_PATHS).toHaveProperty('resourceNodes');
    expect(ASSET_PATHS).toHaveProperty('resourceNodeVariants');
    expect(ASSET_PATHS.resourceNodeVariants.crystal).toEqual([
      '/assets/resources/crystals/Crystal.glb',
      '/assets/resources/crystals/Crystal-MlhTJAFuJY.glb',
      '/assets/resources/crystals/Crystal-WzWPKHFMkL.glb',
    ]);
    expect(ASSET_PATHS.resourceNodes.ore).toBe('/assets/resources/nodes/ore/Resource_Rock_1.gltf');
    expect(ASSET_PATHS.resourceNodes.tree).toBe('/assets/nature/CommonTree_1.gltf');
    expect(ASSET_PATHS.resourceNodes.herb).toBe('/assets/resources/nodes/herb/Plant_1.gltf');
    expect(ASSET_PATHS.resourceNodes.flower).toBe('/assets/resources/nodes/flower/Flower_3_Single.gltf');
    expect(ARMOR_TO_OUTFIT.armor_chest_crude_plate).toBe('leather');
    expect(OUTFIT_STYLE_MODEL_PATHS.cloth).toBe(ASSET_PATHS.armorOutfits.cloth);
    expect(OUTFIT_STYLE_MODEL_PATHS.leather).toBe(ASSET_PATHS.armorOutfits.leather);
    expect(EQUIPMENT_MODEL_PATHS.weapon_training_sword).toBe(ASSET_PATHS.weapons.sword);
    expect(EQUIPMENT_MODEL_PATHS.weapon_training_bow).toBe(ASSET_PATHS.weapons.bow);
    expect(EQUIPMENT_MODEL_PATHS.weapon_training_staff).toBe(ASSET_PATHS.weapons.staff);
    expect(EQUIPMENT_MODEL_PATHS.weapon_apprentice_wand).toBe(ASSET_PATHS.weapons.wand);
    expect(EQUIPMENT_MODEL_PATHS.offhand_wooden_focus).toBe(ASSET_PATHS.weapons.offhandFocus);
  });

  it('ASSET_PATHS uses /assets/ root for models and environment', () => {
    expect(ASSET_PATHS.playerModel).toMatch(/^\/assets\//);
    expect(ASSET_PATHS.villageCenterModel).toMatch(/^\/assets\//);
    expect(ASSET_PATHS.corpseMarker).toMatch(/^\/assets\//);
    expect(ASSET_PATHS.playerHeadSource).toMatch(/^\/assets\//);
    expect(ASSET_PATHS.playerHeadHoodSource).toMatch(/^\/assets\//);
    expect(ASSET_PATHS.monsters.orc).toMatch(/^\/assets\//);
    expect(ASSET_PATHS.environment.market).toMatch(/^\/assets\//);
    expect(ASSET_PATHS.environment.trees).toMatch(/^\/assets\//);
    expect(ASSET_PATHS.medieval.parts.floorBrick).toMatch(/^\/assets\//);
  });

  it('getPreloadAssetList returns player, mobs, and environment', () => {
    const list = getPreloadAssetList();

    expect(list).toHaveProperty('player');
    expect(Array.isArray(list.player)).toBe(true);
    expect(list.player).toContain('assemblePlayerModel');
    expect(list.player).toContain('loadPlayerAnimations');

    expect(list).toHaveProperty('vendor');
    expect(Array.isArray(list.vendor)).toBe(true);
    expect(list.vendor).toContain(ASSET_PATHS.vendorModel);

    expect(list).toHaveProperty('villageCenter');
    expect(Array.isArray(list.villageCenter)).toBe(true);
    expect(list.villageCenter).toEqual([]);

    expect(list).toHaveProperty('corpses');
    expect(Array.isArray(list.corpses)).toBe(true);
    expect(list.corpses).toContain(ASSET_PATHS.corpseMarker);

    expect(list).toHaveProperty('mobs');
    expect(Array.isArray(list.mobs)).toBe(true);
    expect(list.mobs.length).toBeGreaterThanOrEqual(1);
    expect(list.mobs).toContain(ASSET_PATHS.monsters.orc);

    expect(list).toHaveProperty('environment');
    expect(Array.isArray(list.environment)).toBe(true);
    expect(list.environment).toHaveLength(1);
    expect(list.environment).toContain(ASSET_PATHS.environment.trees);

    expect(list).toHaveProperty('medievalParts');
    expect(Array.isArray(list.medievalParts)).toBe(true);
    expect(list.medievalParts).toContain(ASSET_PATHS.medieval.parts.floorBrick);
    expect(list.medievalParts).toContain(ASSET_PATHS.medieval.parts.roofTower);
    expect(list.medievalParts).toContain(ASSET_PATHS.medieval.parts.roofRound6x6);
    expect(list.medievalParts).toContain(ASSET_PATHS.medieval.parts.roofRound8x12);
    expect(list.resourceNodes).toContain('/assets/resources/crystals/Crystal.glb');
    expect(list.resourceNodes).toContain('/assets/resources/crystals/Crystal-MlhTJAFuJY.glb');
    expect(list.resourceNodes).toContain('/assets/resources/crystals/Crystal-WzWPKHFMkL.glb');
  });
});
