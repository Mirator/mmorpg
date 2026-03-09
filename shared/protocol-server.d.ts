import type {
  PublicStateMessage,
  DeltaStateMessage,
  CombatEvent,
  PublicPlayersById,
  SerializedResource,
  SerializedMob,
  SerializedCorpse,
} from '../server/types/domain';

export interface WelcomeMessage {
  type: 'welcome';
  id: string;
  snapshot: PublicStateMessage & {
    world?: unknown;
  };
  config?: unknown;
}

export interface PongMessage {
  type: 'pong';
  t?: number;
}

export type StateBroadcastMessage = PublicStateMessage | DeltaStateMessage;

export interface MeMessage {
  type: 'me';
  t: number;
  id: string;
  data: unknown;
}

export interface ContractsSnapshotMessage {
  type: 'contracts';
  offersByVendor?: Record<string, unknown>;
  activeContracts?: unknown[];
}

export interface ContractResultMessage {
  type: 'contractResult';
  ok: boolean;
  action?: 'turn_in' | 'accept' | 'abandon';
  error?: string;
}

export interface MasteryUpdatedMessage {
  type: 'masteryUpdated';
  unlockedRecipeIds?: string[];
}

export interface CombatEventMessage {
  type: 'combatEvent';
  t: number;
  events: CombatEvent[];
}

export interface AbilityFailedMessage {
  type: 'abilityFailed';
  reason?: string;
  slot?: number;
}

export interface ChatServerMessage {
  type: 'chat';
  channel: 'global' | 'area' | 'trade' | 'party';
  authorId?: string;
  author?: string;
  text: string;
  timestamp?: number;
}

export interface CombatLogMessage {
  type: 'combatLog';
  entries: unknown[];
}

export interface PartyInviteReceivedMessage {
  type: 'partyInviteReceived';
  inviterId: string;
  inviterName?: string;
}

export interface DuelRequestReceivedMessage {
  type: 'duelRequestReceived';
  challengerId: string;
  challengerName?: string;
}

export interface DuelActiveMessage {
  type: 'duelActive';
  opponentId: string;
  opponentName?: string;
}

export interface DuelEndedMessage {
  type: 'duelEnded';
  reason: string;
}

export interface DuelDeclinedMessage {
  type: 'duelDeclined';
  targetId: string;
  targetName?: string;
}

export interface TradeRequestReceivedMessage {
  type: 'tradeRequestReceived';
  traderId: string;
  traderName?: string;
}

export interface TradeOpenedMessage {
  type: 'tradeOpened';
  partnerId: string;
  partnerName?: string;
  myOffer: { items: unknown[]; copper: number };
  theirOffer: { items: unknown[]; copper: number };
}

export interface TradeOfferUpdateMessage {
  type: 'tradeOfferUpdate';
  myOffer: { items: unknown[]; copper: number };
  theirOffer: { items: unknown[]; copper: number };
  confirmed: boolean;
  theirConfirmed: boolean;
}

export interface TradeCompletedMessage {
  type: 'tradeCompleted';
}

export interface TradeCancelledMessage {
  type: 'tradeCancelled';
}

export interface TradeDeclinedServerMessage {
  type: 'tradeDeclined';
}

export interface TradeErrorMessage {
  type: 'tradeError';
  error?: string;
}

export type ServerToClientMessage =
  | WelcomeMessage
  | PongMessage
  | StateBroadcastMessage
  | MeMessage
  | ContractsSnapshotMessage
  | ContractResultMessage
  | MasteryUpdatedMessage
  | CombatEventMessage
  | AbilityFailedMessage
  | ChatServerMessage
  | CombatLogMessage
  | PartyInviteReceivedMessage
  | DuelRequestReceivedMessage
  | DuelActiveMessage
  | DuelEndedMessage
  | DuelDeclinedMessage
  | TradeRequestReceivedMessage
  | TradeOpenedMessage
  | TradeOfferUpdateMessage
  | TradeCompletedMessage
  | TradeCancelledMessage
  | TradeDeclinedServerMessage
  | TradeErrorMessage;

export type {
  PublicStateMessage,
  DeltaStateMessage,
  CombatEvent,
  PublicPlayersById,
  SerializedResource,
  SerializedMob,
  SerializedCorpse,
};

