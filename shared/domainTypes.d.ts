export interface WorldConfig {
  seed: number;
  mapSize: number;
  baseRadius: number;
  obstacleCount: number;
  resourceCount: number;
  mobCount: number;
}

export interface PlayerConfig {
  maxHp: number;
  speed: number;
  sprintSpeed: number;
  walkSpeed: number;
  invSlots: number;
  invStackMax: number;
}

export interface ResourceConfig {
  harvestRadius: number;
  harvestDurationMs: number;
  respawnMs: number;
}

export interface MobConfig {
  respawnMs: number;
  attackDamageBase: number;
  attackDamagePerLevel: number;
  radius: number;
}

export interface CombatConfig {
  basicAttackBaseValue: number;
  basicAttackCoefficient: number;
  basicAttackCooldownMs: number;
  globalCooldownMs: number;
  targetSelectRange: number;
}

export interface VendorConfig {
  interactRadius: number;
}

export interface ChatConfig {
  areaRadius: number;
  maxLength: number;
  rateLimitMax: number;
  rateLimitIntervalMs: number;
}

export interface ContractsConfig {
  maxActive: number;
  rotationMs: number;
}

export interface ProfessionsConfig {
  maxLevel: number;
}

export interface GameConfigSnapshot {
  version: number;
  protocolVersion: number;
  world: WorldConfig;
  player: PlayerConfig;
  resource: ResourceConfig;
  mob: MobConfig;
  combat: CombatConfig;
  vendor: VendorConfig;
  chat: ChatConfig;
  contracts: ContractsConfig;
  professions: ProfessionsConfig;
  [key: string]: unknown;
}

export interface MapPoint {
  x: number;
  y?: number;
  z: number;
}

export interface MapCircle extends MapPoint {
  radius: number;
}

export interface StructureConfig extends MapPoint {
  id: string;
  kind: string;
  rotation: number;
  colliderRadius?: number;
  collides?: boolean;
}

export interface ResourceNodeConfig extends MapPoint {
  id: string;
  type: string;
  respawnMs?: number;
  allowOverlap?: boolean;
}

export interface VendorBuyItemConfig {
  kind: string;
  priceCopper?: number;
}

export interface VendorConfigEntry extends MapPoint {
  id: string;
  name: string;
  buyItems?: VendorBuyItemConfig[];
  allowOverlap?: boolean;
}

export interface MobSpawnConfig extends MapPoint {
  id: string;
  mobType: string;
  aggressive: boolean;
  level?: number;
  levelVariance: number;
  allowOverlap?: boolean;
}

export interface MapConfig {
  version: number;
  mapSize: number;
  mapYMin?: number;
  mapYMax?: number;
  base: MapCircle;
  spawnPoints: MapPoint[];
  obstacles: MapCircle[];
  structures: StructureConfig[];
  resourceNodes: ResourceNodeConfig[];
  vendors: VendorConfigEntry[];
  mobSpawns: MobSpawnConfig[];
}

