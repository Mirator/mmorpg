import { describe, expect, it, vi } from 'vitest';
import { createUiBridge } from './ui-bridge.js';

describe('createUiBridge', () => {
  it('tracks menu-open state before the runtime is attached', () => {
    const body = { classList: { toggle: vi.fn() } };
    const uiBridge = createUiBridge({ body });

    uiBridge.setMenuOpen(false);

    expect(body.classList.toggle).toHaveBeenCalledWith('menu-open', true);
    expect(body.classList.toggle).toHaveBeenLastCalledWith('menu-open', false);
    expect(uiBridge.isMenuOpen()).toBe(false);
  });

  it('forwards the cached state into the attached runtime UI', () => {
    const body = { classList: { toggle: vi.fn() } };
    const runtimeUi = {
      setMenuOpen: vi.fn(),
      setStatus: vi.fn(),
    };
    const uiBridge = createUiBridge({ body });

    uiBridge.setMenuOpen(false);
    uiBridge.setStatus('connected');
    uiBridge.attachRuntime(runtimeUi);
    uiBridge.setMenuOpen(true);
    uiBridge.setStatus('menu');

    expect(runtimeUi.setMenuOpen).toHaveBeenNthCalledWith(1, false);
    expect(runtimeUi.setStatus).toHaveBeenNthCalledWith(1, 'connected');
    expect(runtimeUi.setMenuOpen).toHaveBeenNthCalledWith(2, true);
    expect(runtimeUi.setStatus).toHaveBeenNthCalledWith(2, 'menu');
  });
});
