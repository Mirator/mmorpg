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
      forceAbility: (slot: number) => void;
      useAbility: (slot: number) => void;
      projectToScreen: (x: number, z: number) => { x: number; y: number } | null;
      getState: () => unknown;
      selectTarget: (selection: unknown) => void;
    };
  }
}
