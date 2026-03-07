// @ts-check

export const TILE_SIZE = 2;
export const WALL_THICKNESS = 0.36;

export const MEDIEVAL_BUILDING_KIND_LIST = [
  'market',
  'barracks',
  'storage',
  'houseA',
  'houseB',
  'bellTower',
  'villageCenter',
];

export const MEDIEVAL_BUILDING_KINDS = new Set(MEDIEVAL_BUILDING_KIND_LIST);

const SIDE_NAMES = ['north', 'south', 'east', 'west'];

/** @typedef {'north' | 'south' | 'east' | 'west'} SideName */
/** @typedef {'door' | 'arch'} OpeningType */

/**
 * @typedef {{
 *   side: SideName,
 *   index: number,
 *   type: OpeningType,
 * }} TemplateOpening
 */

/**
 * @typedef {{
 *   key: string,
 *   widthTiles: number,
 *   depthTiles: number,
 *   floorMode: 'woodLight' | 'woodDark' | 'brick' | 'redBrick' | 'villageMix',
 *   wallMode: 'plaster' | 'uneven',
 *   roofMode: 'round' | 'tower',
 *   roofPartKey: 'roofRound6x6' | 'roofRound6x8' | 'roofRound6x10' | 'roofRound8x8' | 'roofRound8x10' | 'roofRound8x12' | 'roofTower',
 *   openings: TemplateOpening[],
 *   roofRotation?: number,
 *   roofY?: number,
 * }} TemplateSpec
 */

/** @type {Record<string, TemplateSpec>} */
const TEMPLATE_SPECS = {
  houseA: {
    key: 'houseA',
    widthTiles: 3,
    depthTiles: 3,
    floorMode: 'woodLight',
    wallMode: 'plaster',
    roofMode: 'round',
    roofPartKey: 'roofRound6x6',
    roofRotation: 0,
    roofY: 4.04,
    openings: [{ side: 'south', index: 1, type: 'door' }],
  },
  houseB: {
    key: 'houseB',
    widthTiles: 4,
    depthTiles: 3,
    floorMode: 'woodDark',
    wallMode: 'plaster',
    roofMode: 'round',
    roofPartKey: 'roofRound6x8',
    roofRotation: Math.PI / 2,
    roofY: 4.04,
    openings: [{ side: 'south', index: 1, type: 'door' }],
  },
  market: {
    key: 'market',
    widthTiles: 5,
    depthTiles: 4,
    floorMode: 'brick',
    wallMode: 'plaster',
    roofMode: 'round',
    roofPartKey: 'roofRound8x10',
    roofRotation: Math.PI / 2,
    roofY: 4.04,
    openings: [
      { side: 'south', index: 2, type: 'arch' },
      { side: 'south', index: 3, type: 'arch' },
      { side: 'north', index: 2, type: 'door' },
    ],
  },
  barracks: {
    key: 'barracks',
    widthTiles: 5,
    depthTiles: 3,
    floorMode: 'woodDark',
    wallMode: 'uneven',
    roofMode: 'round',
    roofPartKey: 'roofRound6x10',
    roofRotation: Math.PI / 2,
    roofY: 4.04,
    openings: [{ side: 'south', index: 2, type: 'door' }],
  },
  storage: {
    key: 'storage',
    widthTiles: 4,
    depthTiles: 4,
    floorMode: 'redBrick',
    wallMode: 'uneven',
    roofMode: 'round',
    roofPartKey: 'roofRound8x8',
    roofRotation: 0,
    roofY: 4.04,
    openings: [{ side: 'east', index: 2, type: 'door' }],
  },
  bellTower: {
    key: 'bellTower',
    widthTiles: 2,
    depthTiles: 2,
    floorMode: 'brick',
    wallMode: 'uneven',
    roofMode: 'tower',
    roofPartKey: 'roofTower',
    roofRotation: 0,
    openings: [{ side: 'south', index: 1, type: 'door' }],
    roofY: 3.18,
  },
  villageCenter: {
    key: 'villageCenter',
    widthTiles: 6,
    depthTiles: 5,
    floorMode: 'villageMix',
    wallMode: 'plaster',
    roofMode: 'round',
    roofPartKey: 'roofRound8x12',
    roofRotation: Math.PI / 2,
    roofY: 4.04,
    openings: [
      { side: 'south', index: 3, type: 'door' },
      { side: 'north', index: 3, type: 'door' },
    ],
  },
};

const PART_KEYS = {
  floor: {
    woodLight: 'floorWoodLight',
    woodDark: 'floorWoodDark',
    brick: 'floorBrick',
    redBrick: 'floorRedBrick',
  },
  wall: {
    plaster: 'wallPlasterStraight',
    uneven: 'wallUnevenStraight',
  },
  doorWall: {
    plaster: 'wallPlasterDoorFlat',
    uneven: 'wallUnevenDoorFlat',
  },
  doorFrame: {
    plaster: 'doorFrameFlatWoodDark',
    uneven: 'doorFrameFlatBrick',
  },
  corner: {
    plaster: 'cornerWood',
    uneven: 'cornerBrick',
  },
  roofFront: {
    roofRound6x6: 'roofFrontBrick6',
    roofRound6x8: 'roofFrontBrick6',
    roofRound6x10: 'roofFrontBrick6',
    roofRound8x8: 'roofFrontBrick8',
    roofRound8x10: 'roofFrontBrick8',
    roofRound8x12: 'roofFrontBrick8',
    roofTower: null,
  },
  door: 'doorFlat',
  arch: 'wallArch',
};

const DOOR_LATERAL_OFFSET = -0.513;
const DOOR_FRAME_OUTWARD_OFFSET = 0.02;
const DOOR_LEAF_OUTWARD_OFFSET = 0.03;

const ROOF_GABLE_Z_OFFSETS = {
  roofRound6x6: { front: 3.3, back: -3.603 },
  roofRound6x8: { front: 4.06, back: -4.494 },
  roofRound6x10: { front: 5.161, back: -5.563 },
  roofRound8x8: { front: 4.453, back: -4.75 },
  roofRound8x10: { front: 5.213, back: -5.517 },
  roofRound8x12: { front: 6.221, back: -6.782 },
  roofTower: null,
};

/**
 * @typedef {{
 *   partKey: string,
 *   role: 'floor' | 'wall' | 'door' | 'decor' | 'roof',
 *   x: number,
 *   y: number,
 *   z: number,
 *   rotation: number,
 * }} LocalPartPlacement
 */

/**
 * @typedef {{
 *   x: number,
 *   z: number,
 *   halfX: number,
 *   halfZ: number,
 *   rotation: number,
 * }} LocalRect
 */

/**
 * @typedef {{
 *   x: number,
 *   z: number,
 *   halfX: number,
 *   halfZ: number,
 *   rotation: number,
 * }} OrientedRect
 */

/**
 * @typedef {{
 *   kind: string,
 *   tileSize: number,
 *   parts: LocalPartPlacement[],
 *   localCollisionRects: LocalRect[],
 *   collisionRects: Array<OrientedRect & { kind: string, structureId: string }>,
 *   localInteriorBounds: OrientedRect,
 *   interiorBounds: OrientedRect,
 * }} MedievalStructureLayout
 */

function normalizeKind(/** @type {any} */ kind) {
  return typeof kind === 'string' ? kind.trim() : '';
}

export function isMedievalBuildingKind(/** @type {any} */ kind) {
  return MEDIEVAL_BUILDING_KINDS.has(normalizeKind(kind));
}

export function getMedievalBuildingTemplate(/** @type {any} */ kind) {
  const key = normalizeKind(kind);
  const template = TEMPLATE_SPECS[key];
  if (!template) return null;
  return {
    key: template.key,
    widthTiles: template.widthTiles,
    depthTiles: template.depthTiles,
    floorMode: template.floorMode,
    wallMode: template.wallMode,
    roofMode: template.roofMode,
    roofPartKey: template.roofPartKey,
    openings: template.openings.map((entry) => ({ ...entry })),
    roofRotation: template.roofRotation,
    roofY: template.roofY,
  };
}

function roundTo(/** @type {number} */ value) {
  return Math.round(value * 1000) / 1000;
}

function wallSpanTiles(/** @type {TemplateSpec} */ template, /** @type {SideName} */ side) {
  return side === 'north' || side === 'south'
    ? template.widthTiles
    : template.depthTiles;
}

function getHalfSpan(/** @type {TemplateSpec} */ template) {
  return {
    halfW: (template.widthTiles * TILE_SIZE) / 2,
    halfD: (template.depthTiles * TILE_SIZE) / 2,
  };
}

function sideTileLocalCenter(
  /** @type {TemplateSpec} */ template,
  /** @type {SideName} */ side,
  /** @type {number} */ index
) {
  const { halfW, halfD } = getHalfSpan(template);

  if (side === 'north' || side === 'south') {
    const x = -halfW + TILE_SIZE * (index + 0.5);
    const z = side === 'south' ? halfD : -halfD;
    return { x, z, yaw: 0 };
  }

  const z = -halfD + TILE_SIZE * (index + 0.5);
  const x = side === 'east' ? halfW : -halfW;
  return { x, z, yaw: Math.PI / 2 };
}

function floorPartKey(
  /** @type {TemplateSpec} */ template,
  /** @type {number} */ ix,
  /** @type {number} */ iz
) {
  switch (template.floorMode) {
    case 'woodLight':
      return PART_KEYS.floor.woodLight;
    case 'woodDark':
      return PART_KEYS.floor.woodDark;
    case 'brick':
      return PART_KEYS.floor.brick;
    case 'redBrick':
      return PART_KEYS.floor.redBrick;
    case 'villageMix': {
      const parity = (ix + iz) % 2;
      return parity === 0 ? PART_KEYS.floor.brick : PART_KEYS.floor.woodLight;
    }
    default:
      return PART_KEYS.floor.brick;
  }
}

function getOpeningsBySide(/** @type {TemplateSpec} */ template) {
  /** @type {Record<SideName, Map<number, OpeningType>>} */
  const out = {
    north: new Map(),
    south: new Map(),
    east: new Map(),
    west: new Map(),
  };
  for (const opening of template.openings) {
    if (!SIDE_NAMES.includes(opening.side)) continue;
    out[opening.side].set(opening.index, opening.type);
  }
  return out;
}

function outwardVectorForSide(/** @type {SideName} */ side) {
  switch (side) {
    case 'north':
      return { x: 0, z: -1 };
    case 'south':
      return { x: 0, z: 1 };
    case 'east':
      return { x: 1, z: 0 };
    case 'west':
      return { x: -1, z: 0 };
    default:
      return { x: 0, z: 0 };
  }
}

function localXAxisFromYaw(/** @type {number} */ yaw) {
  return {
    x: Math.cos(yaw),
    z: Math.sin(yaw),
  };
}

function offsetPoint(
  /** @type {{ x: number, z: number }} */ point,
  /** @type {{ x: number, z: number }} */ vector,
  /** @type {number} */ amount
) {
  return {
    x: roundTo(point.x + vector.x * amount),
    z: roundTo(point.z + vector.z * amount),
  };
}

function buildLocalPartsAndRects(/** @type {TemplateSpec} */ template) {
  /** @type {LocalPartPlacement[]} */
  const parts = [];
  /** @type {LocalRect[]} */
  const collisionRects = [];

  const { halfW, halfD } = getHalfSpan(template);
  const wallPartKey = PART_KEYS.wall[template.wallMode];
  const doorWallPartKey = PART_KEYS.doorWall[template.wallMode];
  const doorFramePartKey = PART_KEYS.doorFrame[template.wallMode];
  const cornerPartKey = PART_KEYS.corner[template.wallMode];
  const roofPartKey = template.roofPartKey;
  const roofRotation = typeof template.roofRotation === 'number' ? template.roofRotation : 0;
  const roofY = typeof template.roofY === 'number' ? template.roofY : 3.02;

  for (let iz = 0; iz < template.depthTiles; iz += 1) {
    for (let ix = 0; ix < template.widthTiles; ix += 1) {
      parts.push({
        partKey: floorPartKey(template, ix, iz),
        role: 'floor',
        x: roundTo(-halfW + TILE_SIZE * (ix + 0.5)),
        y: 0,
        z: roundTo(-halfD + TILE_SIZE * (iz + 0.5)),
        rotation: 0,
      });
    }
  }

  const openingsBySide = getOpeningsBySide(template);
  for (const side of /** @type {SideName[]} */ (SIDE_NAMES)) {
    const span = wallSpanTiles(template, side);
    const sideOpenings = openingsBySide[side];
    for (let i = 0; i < span; i += 1) {
      const openingType = sideOpenings.get(i) ?? null;
      const center = sideTileLocalCenter(template, side, i);
      if (openingType) {
        if (openingType === 'door') {
          const doorAxis = localXAxisFromYaw(center.yaw);
          const outward = outwardVectorForSide(side);
          const framePos = offsetPoint(center, outward, DOOR_FRAME_OUTWARD_OFFSET);
          const doorPos = offsetPoint(
            offsetPoint(center, doorAxis, DOOR_LATERAL_OFFSET),
            outward,
            DOOR_LEAF_OUTWARD_OFFSET
          );

          parts.push({
            partKey: doorWallPartKey,
            role: 'door',
            x: roundTo(center.x),
            y: 0,
            z: roundTo(center.z),
            rotation: roundTo(center.yaw),
          });
          parts.push({
            partKey: doorFramePartKey,
            role: 'decor',
            x: framePos.x,
            y: 0,
            z: framePos.z,
            rotation: roundTo(center.yaw),
          });
          parts.push({
            partKey: PART_KEYS.door,
            role: 'decor',
            x: doorPos.x,
            y: 0,
            z: doorPos.z,
            rotation: roundTo(center.yaw),
          });
        } else {
          parts.push({
            partKey: PART_KEYS.arch,
            role: 'decor',
            x: roundTo(center.x),
            y: 0,
            z: roundTo(center.z),
            rotation: roundTo(center.yaw),
          });
        }
        continue;
      }

      parts.push({
        partKey: wallPartKey,
        role: 'wall',
        x: roundTo(center.x),
        y: 0,
        z: roundTo(center.z),
        rotation: roundTo(center.yaw),
      });

      const alongX = side === 'north' || side === 'south';
      collisionRects.push({
        x: roundTo(center.x),
        z: roundTo(center.z),
        halfX: alongX ? TILE_SIZE / 2 : WALL_THICKNESS / 2,
        halfZ: alongX ? WALL_THICKNESS / 2 : TILE_SIZE / 2,
        rotation: roundTo(center.yaw),
      });
    }
  }

  const cornerPoints = [
    { x: -halfW, z: -halfD },
    { x: halfW, z: -halfD },
    { x: halfW, z: halfD },
    { x: -halfW, z: halfD },
  ];
  for (const corner of cornerPoints) {
    parts.push({
      partKey: cornerPartKey,
      role: 'decor',
      x: roundTo(corner.x),
      y: 0,
      z: roundTo(corner.z),
      rotation: 0,
    });
  }

  if (template.roofMode === 'tower') {
    parts.push({
      partKey: roofPartKey,
      role: 'roof',
      x: 0,
      y: roundTo(roofY),
      z: 0,
      rotation: roundTo(roofRotation),
    });
  } else {
    parts.push({
      partKey: roofPartKey,
      role: 'roof',
      x: 0,
      y: roundTo(roofY),
      z: 0,
      rotation: roundTo(roofRotation),
    });
    const roofFrontPartKey = PART_KEYS.roofFront[roofPartKey];
    const gableOffsets = ROOF_GABLE_Z_OFFSETS[roofPartKey];
    if (roofFrontPartKey && gableOffsets) {
      const frontPoint = rotatePoint(0, gableOffsets.front, roofRotation);
      const backPoint = rotatePoint(0, gableOffsets.back, roofRotation);
      parts.push({
        partKey: roofFrontPartKey,
        role: 'decor',
        x: roundTo(frontPoint.x),
        y: roundTo(roofY),
        z: roundTo(frontPoint.z),
        rotation: roundTo(roofRotation),
      });
      parts.push({
        partKey: roofFrontPartKey,
        role: 'decor',
        x: roundTo(backPoint.x),
        y: roundTo(roofY),
        z: roundTo(backPoint.z),
        rotation: roundTo(roofRotation + Math.PI),
      });
    }
  }

  const localInteriorBounds = {
    x: 0,
    z: 0,
    halfX: Math.max(0.5, halfW - 0.65),
    halfZ: Math.max(0.5, halfD - 0.65),
    rotation: 0,
  };

  return {
    parts,
    collisionRects,
    localInteriorBounds,
  };
}

function rotatePoint(
  /** @type {number} */ x,
  /** @type {number} */ z,
  /** @type {number} */ rotation
) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: x * cos - z * sin,
    z: x * sin + z * cos,
  };
}

export function transformPartPlacement(
  /** @type {LocalPartPlacement} */ part,
  /** @type {{ x?: number, y?: number, z?: number, rotation?: number }} */ structure
) {
  const baseRot = Number(structure?.rotation ?? 0);
  const baseX = Number(structure?.x ?? 0);
  const baseY = Number(structure?.y ?? 0);
  const baseZ = Number(structure?.z ?? 0);
  const rotated = rotatePoint(part.x, part.z, baseRot);
  return {
    ...part,
    x: roundTo(rotated.x + baseX),
    y: roundTo((part.y ?? 0) + baseY),
    z: roundTo(rotated.z + baseZ),
    rotation: roundTo((part.rotation ?? 0) + baseRot),
  };
}

function transformRect(
  /** @type {LocalRect} */ rect,
  /** @type {{ x?: number, z?: number, rotation?: number }} */ structure
) {
  const baseRot = Number(structure?.rotation ?? 0);
  const baseX = Number(structure?.x ?? 0);
  const baseZ = Number(structure?.z ?? 0);
  const rotated = rotatePoint(rect.x, rect.z, baseRot);
  return {
    x: roundTo(rotated.x + baseX),
    z: roundTo(rotated.z + baseZ),
    halfX: rect.halfX,
    halfZ: rect.halfZ,
    rotation: roundTo(rect.rotation + baseRot),
  };
}

function transformInteriorBounds(
  /** @type {OrientedRect} */ rect,
  /** @type {{ x?: number, z?: number, rotation?: number }} */ structure
) {
  const transformed = transformRect(rect, structure);
  return {
    x: transformed.x,
    z: transformed.z,
    halfX: transformed.halfX,
    halfZ: transformed.halfZ,
    rotation: transformed.rotation,
  };
}

export function buildMedievalStructureLayout(/** @type {any} */ structure) {
  const kind = normalizeKind(structure?.kind);
  const template = TEMPLATE_SPECS[kind];
  if (!template) return null;

  const local = buildLocalPartsAndRects(template);
  const structureId = typeof structure?.id === 'string' && structure.id.length > 0
    ? structure.id
    : kind;

  return {
    kind,
    tileSize: TILE_SIZE,
    parts: local.parts,
    localCollisionRects: local.collisionRects,
    collisionRects: local.collisionRects.map((rect) => ({
      ...transformRect(rect, structure),
      kind,
      structureId,
    })),
    localInteriorBounds: local.localInteriorBounds,
    interiorBounds: transformInteriorBounds(local.localInteriorBounds, structure),
  };
}

export function buildStructureCollisionRects(/** @type {any} */ structure) {
  const layout = buildMedievalStructureLayout(structure);
  return layout?.collisionRects ?? [];
}

export function buildStructureInteriorBounds(/** @type {any} */ structure) {
  const layout = buildMedievalStructureLayout(structure);
  return layout?.interiorBounds ?? null;
}

export function buildStructureVisualParts(/** @type {any} */ structure) {
  const layout = buildMedievalStructureLayout(structure);
  return layout?.parts ?? [];
}

export function pointInOrientedRect(
  /** @type {{ x?: number, z?: number } | null | undefined} */ point,
  /** @type {OrientedRect | null | undefined} */ rect
) {
  if (!point || !rect) return false;
  const px = Number(point.x ?? 0);
  const pz = Number(point.z ?? 0);
  const cx = Number(rect.x ?? 0);
  const cz = Number(rect.z ?? 0);
  const rot = Number(rect.rotation ?? 0);
  const halfX = Number(rect.halfX ?? 0);
  const halfZ = Number(rect.halfZ ?? 0);
  if (!Number.isFinite(halfX) || !Number.isFinite(halfZ) || halfX <= 0 || halfZ <= 0) return false;

  const dx = px - cx;
  const dz = pz - cz;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const lx = dx * cos + dz * sin;
  const lz = -dx * sin + dz * cos;

  return Math.abs(lx) <= halfX && Math.abs(lz) <= halfZ;
}
