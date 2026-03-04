export {};

declare global {
  interface Window {
    advanceTime?: (ms: number) => Promise<void>;
    render_game_to_text?: () => string;
    __game?: {
      moveTo: (x: number, z: number) => void;
      clearInput: () => void;
      interact: () => void;
      inventorySwap: (from: number, to: number) => void;
      equipSwap: (payload: {
        fromType: 'inventory' | 'equipment';
        fromSlot: number | string;
        toType: 'inventory' | 'equipment';
        toSlot: number | string;
      }) => void;
      vendorSell: (slot: number, vendorId: string) => void;
      vendorBuy: (kind: string, count: number, vendorId: string) => void;
      craft: (recipeId: string, count?: number) => void;
      contractAccept: (vendorId: string, contractId: string) => void;
      contractAbandon: (contractId: string) => void;
      contractTurnIn: (vendorId: string, contractId: string) => void;
      repairItem: (fromType: 'inventory' | 'equipment', slot: number | string) => void;
      salvageItem: (slot: number) => void;
      duelRequest: (targetId: string) => void;
      duelAccept: (challengerId: string) => void;
      duelDecline: (challengerId: string) => void;
      duelForfeit: () => void;
      tradeRequest: (targetId: string) => void;
      tradeAccept: (traderId: string) => void;
      tradeDecline: (traderId: string) => void;
      tradeOfferAddSlot: (slot: number) => void;
      tradeOfferAddCopper: (amount: number) => void;
      tradeConfirm: () => void;
      tradeCancel: () => void;
      forceAbility: (slot: number) => void;
      useAbility: (slot: number) => void;
      projectToScreen: (x: number, z: number) => { x: number; y: number } | null;
      getState: () => unknown;
      selectTarget: (selection: unknown) => void;
    };
    __MAP_EDITOR_V2__?: {
      getState: () => any;
    };
    __MAP_EDITOR_V2_LOAD_DRAFT__?: () => void;
  }
}
