export interface InventoryItem {
  id?: string;
  kind?: string;
  name?: string;
  count?: number;
  [key: string]: unknown;
}

export type InventorySlot = InventoryItem | null;
export type Inventory = InventorySlot[];

export interface Position3D {
  x: number;
  y?: number;
  z: number;
}

export interface SocketLike {
  readyState?: number;
  send: (payload: string) => void;
  [key: string]: unknown;
}

export interface WsClient extends SocketLike {
  OPEN: number;
  isAlive?: boolean;
  ping: () => void;
  terminate: () => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface ServerPlayer {
  id: string;
  ws?: WsClient | null;
  pos?: Position3D | null;
  keys?: { w: boolean; a: boolean; s: boolean; d: boolean };
  lastInputSeq?: number;
  hp?: number;
  maxHp?: number;
  inventory: Inventory;
  invCap?: number;
  invSlots?: number;
  invStackMax?: number;
  currencyCopper?: number;
  inv?: number;
  dead?: boolean;
  respawnAt?: number;
  classId?: string | null;
  level?: number;
  xp?: number;
  targetId?: string | null;
  target?: unknown;
  name?: string | null;
  nameLower?: string | null;
  persistName?: string | null;
  persistNameLower?: string | null;
  accountId?: string | null;
  isGuest?: boolean;
  persistId?: string;
  persistAccountId?: string | null;
  connectionId?: string;
  equipment?: Record<string, unknown> | null;
  attackCooldownUntil?: number;
  resourceType?: string | null;
  resourceMax?: number;
  resource?: number;
  abilityCooldowns?: Record<string, number>;
  globalCooldownUntil?: number;
  combatTagUntil?: number;
  lastMoveDir?: string | null;
  movedThisTick?: boolean;
  cast?: {
    id: string;
    endsAt?: number;
    startedAt?: number;
    targetId?: string | null;
    firedTicks?: number;
  } | null;
  moveSpeedMultiplier?: number;
  damageTakenMultiplier?: number;
  slowImmuneUntil?: number;
  defensiveStanceUntil?: number;
  duelOpponentId?: string;
  partyId?: string | null;
  targetKind?: string | null;
  [key: string]: unknown;
}

export type PlayerMap = Map<string, ServerPlayer>;

export interface TradeOffer {
  items: InventorySlot[];
  copper: number;
}

export interface TradeSession {
  id: string;
  a: ServerPlayer;
  b: ServerPlayer;
  offerA: TradeOffer;
  offerB: TradeOffer;
  confirmedA: boolean;
  confirmedB: boolean;
}

export interface PartyData {
  memberIds: string[];
}

export interface PartyInvite {
  inviterId: string;
  partyId: string;
  at: number;
}

export interface Corpse {
  id: string;
  playerId: string;
  pos: Required<Position3D>;
  inventory: Inventory;
  expiresAt: number;
}

export interface ResourceNode {
  id: string;
  x: number;
  y?: number;
  z: number;
  type?: string;
  available?: boolean;
  respawnAt?: number;
  [key: string]: unknown;
}

export interface MobEntity {
  id: string;
  pos: Position3D;
  x?: number;
  y?: number;
  z?: number;
  state?: string;
  targetId?: string | null;
  level?: number;
  hp?: number;
  maxHp?: number;
  dead?: boolean;
  respawnAt?: number;
  mobType?: string;
  [key: string]: unknown;
}

export interface RuntimePlayerState {
  pos: Position3D;
  hp: number;
  maxHp: number;
  inv: number;
  invCap: number;
  invSlots: number;
  invStackMax: number;
  inventory: Inventory;
  currencyCopper: number;
  equipment?: Record<string, unknown> | null;
  classId?: string | null;
  level?: number;
  xp?: number;
  [key: string]: unknown;
}

export interface StoredCharacter {
  id: string;
  accountId: string | null;
  name?: string | null;
  nameLower?: string | null;
  state?: unknown;
  stateVersion?: number | null;
  [key: string]: unknown;
}

export interface AuthAccount {
  id: string;
  username?: string;
  [key: string]: unknown;
}

export interface WsTicketData {
  accountId: string;
  characterId: string;
  [key: string]: unknown;
}

export interface PersistenceLike {
  markDirty: (player: ServerPlayer) => void;
}

export interface WsPersistenceLike extends PersistenceLike {
  persistPlayer: (player: ServerPlayer) => Promise<void>;
  initPlayerPersistence: (player: ServerPlayer, now: number) => void;
}

export interface SpawnerLike {
  getSpawnPoint: () => Position3D;
}

export type SafeSend = (ws: SocketLike | undefined | null, payload: unknown) => void;

export type SendPrivateState = (
  ws: WsClient | undefined | null,
  player: ServerPlayer,
  now: number
) => void;

export interface SerializedResource {
  id: string;
  x: number;
  y: number;
  z: number;
  type: string;
  available: boolean;
  respawnAt: number;
}

export interface SerializedMob {
  id: string;
  x: number;
  y: number;
  z: number;
  state: string | null;
  targetId: string | null;
  level: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  respawnAt: number;
  mobType: string;
}

export interface SerializedCorpse {
  id: string;
  playerId: string;
  x: number;
  y: number;
  z: number;
  itemCount: number;
  expiresAt: number;
}

export interface PublicPlayerState {
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  inv: number;
  currencyCopper: number;
  dead: boolean;
  classId: string | null;
  level: number;
  name: string | null;
  duelOpponentId?: string | null;
}

export type PublicPlayersById = Record<string, PublicPlayerState>;

export interface PublicStateMessage {
  type: 'state';
  t: number;
  players: PublicPlayersById;
  resources: SerializedResource[];
  mobs: SerializedMob[];
  corpses: SerializedCorpse[];
  full?: boolean;
}

export interface DeltaStateMessage {
  type: 'state';
  t: number;
  players?: PublicPlayersById;
  resources?: SerializedResource[];
  mobs?: SerializedMob[];
  corpses?: SerializedCorpse[];
  removedPlayers?: string[];
  removedResources?: string[];
  removedMobs?: string[];
  removedCorpses?: string[];
  full?: boolean;
}

export interface CombatPoint {
  x: number;
  z: number;
  y?: number;
}

export interface CombatEvent {
  from?: CombatPoint | null;
  to?: CombatPoint | null;
  center?: CombatPoint | null;
  [key: string]: unknown;
}

export interface WsUpgradeRequest {
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
  url?: string;
  [key: string]: unknown;
}

export interface HttpAccount {
  id: string;
  username?: string;
  [key: string]: unknown;
}

export interface HttpSessionLike {
  account?: HttpAccount | null;
  accountId?: string;
  expiresAt?: Date | null;
  [key: string]: unknown;
}

export interface HttpRequestLike {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  url?: string;
  ip?: string;
  body?: Record<string, unknown> | null;
  params?: Record<string, string | undefined>;
  get?: (header: string) => string | undefined;
  accepts?: (type: string) => string | false;
  account?: HttpAccount;
  session?: HttpSessionLike;
  authToken?: string;
  [key: string]: unknown;
}

export interface HttpResponseLike {
  status: (code: number) => HttpResponseLike;
  json: (payload: unknown) => void;
  send: (payload: unknown) => void;
  sendFile: (path: string) => void;
  redirect: (status: number, path: string) => void;
  cookie: (name: string, value: string, options?: Record<string, unknown>) => void;
  clearCookie: (name: string, options?: Record<string, unknown>) => void;
  headersSent?: boolean;
}

export type NextFunctionLike = (err?: unknown) => void;

export interface HttpConfig {
  trustProxy?: boolean;
  maxPayloadBytes: number;
  isLocalhost?: boolean;
  adminPassword: string | null;
  exposeAuthToken?: boolean;
  sessionCookieName: string;
  sessionCookieSameSite: string;
  sessionCookieSecure: boolean;
  [key: string]: unknown;
}

export interface WsServerConfig {
  maxPayloadBytes: number;
  allowNoOrigin: boolean;
  allowNoOriginRemote: boolean;
  isLocalhost: boolean;
  allowedOrigins: Set<string>;
  maxConnectionsPerIp: number;
  trustProxy: boolean;
  aoiRadius?: number;
  msgRateMax: number;
  msgRateIntervalMs: number;
  chat?: {
    rateLimitMax?: number;
    rateLimitIntervalMs?: number;
  };
  heartbeatIntervalMs: number;
  broadcastHz: number;
  sessionCookieName: string;
  configSnapshot: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ClientWsMessage {
  type?: string;
  seq?: number;
  [key: string]: unknown;
}

export interface TradeWsMessage {
  targetId?: string;
  traderId?: string;
  op?: 'add' | 'remove';
  slot?: number;
  copper?: number;
  [key: string]: unknown;
}

export interface DuelWsMessage {
  targetId?: string;
  challengerId?: string;
  [key: string]: unknown;
}

export interface TradeHandlerContext {
  player: ServerPlayer;
  players: PlayerMap;
  msg: TradeWsMessage;
  safeSend: SafeSend;
  sendPrivateState: SendPrivateState;
  persistence: PersistenceLike;
  ws: SocketLike;
}

export interface DuelHandlerContext {
  player: ServerPlayer;
  players: PlayerMap;
  msg: DuelWsMessage;
  safeSend: SafeSend;
  sendPrivateState: SendPrivateState;
  persistence: PersistenceLike;
  ws: WsClient;
}

export interface WsMessageHandlerContext {
  player: ServerPlayer;
  players: PlayerMap;
  mobs: MobEntity[];
  resources: ResourceNode[];
  corpses: Corpse[];
  world: unknown;
  config: WsServerConfig;
  spawner: SpawnerLike;
  persistence: WsPersistenceLike;
  msg: ClientWsMessage;
  ws: WsClient;
  safeSend: SafeSend;
  sendPrivateState: SendPrivateState;
  broadcastCombatEvent: (event: CombatEvent, now?: number) => void;
  allowChatMessage: () => boolean;
  initCombatState: (player: ServerPlayer) => void;
  countInventory: (inventory: Inventory) => number;
  nextItemIdRef: { current: number };
}
