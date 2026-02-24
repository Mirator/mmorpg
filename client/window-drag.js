// @ts-check

const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, a, [role="button"], [contenteditable="true"], label';

function isPrimaryPointer(/** @type {PointerEvent} */ event) {
  if (event.pointerType === 'mouse') return event.button === 0;
  return event.button === 0 || event.button === -1;
}

function clampAxis(/** @type {number} */ pos, /** @type {number} */ size, /** @type {number} */ viewportSize, /** @type {number} */ margin) {
  if (!Number.isFinite(pos)) return 0;
  if (size + margin * 2 >= viewportSize) {
    return Math.max(0, (viewportSize - size) / 2);
  }
  const min = margin;
  const max = viewportSize - size - margin;
  return Math.min(max, Math.max(min, pos));
}

function clampPosition(
  /** @type {number} */ left,
  /** @type {number} */ top,
  /** @type {number} */ width,
  /** @type {number} */ height,
  /** @type {number} */ margin
) {
  return {
    left: clampAxis(left, width, window.innerWidth, margin),
    top: clampAxis(top, height, window.innerHeight, margin),
  };
}

/**
 * @typedef {{
 *   key: string;
 *   panelEl: HTMLElement;
 *   handleEl: HTMLElement;
 *   isOpen: () => boolean;
 * }} DraggablePanel
 */

/**
 * @param {{ panels?: DraggablePanel[], viewportMargin?: number }} options
 */
export function createWindowDragController({ panels = [], viewportMargin = 12 } = {}) {
  /** @type {Array<{ key: string, panelEl: HTMLElement, handleEl: HTMLElement, isOpen: () => boolean, memory: { left: number, top: number } | null, wasOpen: boolean, onPointerDown: (event: PointerEvent) => void, observer: MutationObserver | null }>} */
  const states = [];
  let /** @type {{ state: typeof states[number], pointerId: number, offsetX: number, offsetY: number, width: number, height: number } | null} */ active = null;
  let previousUserSelect = '';
  let resizeRaf = 0;

  function applyPosition(
    /** @type {typeof states[number]} */ state,
    /** @type {number} */ left,
    /** @type {number} */ top,
    /** @type {{ remember?: boolean, width?: number, height?: number }} */ opts = {}
  ) {
    const width = opts.width ?? state.panelEl.getBoundingClientRect().width;
    const height = opts.height ?? state.panelEl.getBoundingClientRect().height;
    const clamped = clampPosition(left, top, width, height, viewportMargin);
    state.panelEl.classList.add('window-dragged');
    state.panelEl.style.left = `${clamped.left}px`;
    state.panelEl.style.top = `${clamped.top}px`;
    if (opts.remember !== false) {
      state.memory = clamped;
    }
  }

  function stopDrag(/** @type {number | null} */ pointerId = null) {
    if (!active) return;
    if (pointerId !== null && pointerId !== active.pointerId) return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    try {
      active.state.handleEl.releasePointerCapture(active.pointerId);
    } catch {
      /* ignore */
    }
    document.body.style.userSelect = previousUserSelect;
    active = null;
  }

  function onPointerMove(/** @type {PointerEvent} */ event) {
    if (!active || event.pointerId !== active.pointerId) return;
    if (!active.state.isOpen()) {
      stopDrag(event.pointerId);
      return;
    }
    event.preventDefault();
    const left = event.clientX - active.offsetX;
    const top = event.clientY - active.offsetY;
    applyPosition(active.state, left, top, {
      remember: true,
      width: active.width,
      height: active.height,
    });
  }

  function onPointerUp(/** @type {PointerEvent} */ event) {
    stopDrag(event.pointerId);
  }

  function scheduleResizeClamp() {
    if (resizeRaf) return;
    resizeRaf = window.requestAnimationFrame(() => {
      resizeRaf = 0;
      for (const state of states) {
        if (!state.memory || !state.isOpen()) continue;
        applyPosition(state, state.memory.left, state.memory.top, { remember: true });
      }
    });
  }

  function syncPanel(/** @type {typeof states[number]} */ state) {
    const open = !!state.isOpen();
    if (open && !state.wasOpen && state.memory) {
      window.requestAnimationFrame(() => {
        if (state.isOpen() && state.memory) {
          applyPosition(state, state.memory.left, state.memory.top, { remember: true });
        }
      });
    }
    if (!open && active?.state === state) {
      stopDrag();
    }
    state.wasOpen = open;
  }

  for (const panel of panels) {
    if (!panel?.panelEl || !panel.handleEl || typeof panel.isOpen !== 'function' || !panel.key) continue;
    /** @type {typeof states[number]} */
    const state = {
      key: panel.key,
      panelEl: panel.panelEl,
      handleEl: panel.handleEl,
      isOpen: panel.isOpen,
      memory: null,
      wasOpen: !!panel.isOpen(),
      onPointerDown: (/** @type {PointerEvent} */ event) => {
        if (!isPrimaryPointer(event)) return;
        if (!state.isOpen()) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(INTERACTIVE_SELECTOR)) return;
        event.preventDefault();
        stopDrag();
        const rect = state.panelEl.getBoundingClientRect();
        applyPosition(state, rect.left, rect.top, {
          remember: state.memory != null,
          width: rect.width,
          height: rect.height,
        });
        active = {
          state,
          pointerId: event.pointerId,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
          width: rect.width,
          height: rect.height,
        };
        previousUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
        try {
          state.handleEl.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
      },
      observer: null,
    };
    state.handleEl.addEventListener('pointerdown', state.onPointerDown);
    state.observer = new MutationObserver(() => syncPanel(state));
    if (state.observer) {
      state.observer.observe(state.panelEl, { attributes: true, attributeFilter: ['class'] });
    }
    states.push(state);
  }

  window.addEventListener('resize', scheduleResizeClamp);

  return {
    sync: () => {
      for (const state of states) syncPanel(state);
    },
    dispose: () => {
      stopDrag();
      if (resizeRaf) {
        window.cancelAnimationFrame(resizeRaf);
        resizeRaf = 0;
      }
      window.removeEventListener('resize', scheduleResizeClamp);
      for (const state of states) {
        state.handleEl.removeEventListener('pointerdown', state.onPointerDown);
        state.observer?.disconnect();
      }
      states.length = 0;
    },
  };
}
