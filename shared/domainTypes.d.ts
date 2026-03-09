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

