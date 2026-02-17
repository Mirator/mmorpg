export {};

declare global {
  interface Window {
    advanceTime?: (ms: number) => Promise<void>;
    render_game_to_text?: () => string;
    __game?: {
      moveTo: (x: number, z: number) => void;
      clearInput: () => void;
      interact: () => void;
      projectToScreen: (x: number, z: number) => { x: number; y: number } | null;
      getState: () => unknown;
      selectTarget: (selection: unknown) => void;
    };
  }
}
