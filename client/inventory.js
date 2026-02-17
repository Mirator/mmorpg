// @ts-check
const DEFAULT_COLS = 5;

function cloneSlots(/** @type {any} */ slots, /** @type {any} */ count) {
  const base = Array.isArray(slots) ? slots.map((/** @type {any} */ item) => (item ? { ...item } : null)) : [];
  if (count && base.length < count) {
    return base.concat(Array.from({ length: count - base.length }, () => null));
  }
  if (count && base.length > count) {
    return base.slice(0, count);
  }
  return base;
}

function makeItemLabel(/** @type {any} */ item) {
  const name = item?.name || item?.kind || 'Item';
  return name.slice(0, 1).toUpperCase();
}

export function createInventoryUI(/** @type {any} */ { panel, grid, cols = DEFAULT_COLS, onSwap, onDropExternal }) {
  let open = false;
  let /** @type {any} */ slots = [];
  let slotCount = 0;
  let stackMax = 1;
  let /** @type {any} */ drag = null;
  let /** @type {any} */ dragEl = null;
  const /** @type {any} */ slotEls = [];

  function setOpen(/** @type {any} */ next) {
    open = !!next;
    panel?.classList.toggle('open', open);
    if (!open) {
      cancelDrag();
    }
  }

  function isOpen() {
    return open;
  }

  function setInventory(/** @type {any} */ nextSlots, /** @type {any} */ opts = {}) {
    const prevCount = slotCount;
    const nextCount = Number(opts.slots ?? nextSlots?.length ?? slotCount ?? 0) || 0;
    if (nextCount && nextCount !== slotCount) {
      slotCount = nextCount;
      buildGrid();
    } else if (!slotCount && nextSlots?.length) {
      slotCount = nextSlots.length;
      buildGrid();
    }
    stackMax = Number(opts.stackMax ?? stackMax) || stackMax;
    slots = cloneSlots(nextSlots, slotCount);
    if (slotCount !== prevCount) {
      const needed = slotCount - slots.length;
      if (needed > 0) {
        slots = slots.concat(Array.from({ length: needed }, () => null));
      }
    }
    render();
  }

  function buildGrid() {
    if (!grid) return;
    grid.innerHTML = '';
    slotEls.length = 0;
    panel?.style.setProperty('--inventory-cols', String(cols));
    for (let i = 0; i < slotCount; i += 1) {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot empty';
      slot.dataset.index = String(i);
      slot.addEventListener('pointerdown', onPointerDown);
      grid.appendChild(slot);
      slotEls.push(slot);
    }
  }

  function render() {
    for (let i = 0; i < slotEls.length; i += 1) {
      const slotEl = slotEls[i];
      const item = slots[i];
      slotEl.innerHTML = '';
      slotEl.classList.toggle('empty', !item);
      if (!item) {
        slotEl.title = 'Empty slot';
        continue;
      }
      slotEl.title = `${item.name ?? item.kind ?? 'Item'} (${item.count ?? 1}/${stackMax})`;

      const icon = document.createElement('div');
      icon.className = 'inventory-item';
      icon.textContent = makeItemLabel(item);
      slotEl.appendChild(icon);

      const count = document.createElement('div');
      count.className = 'inventory-count';
      count.textContent = String(item.count ?? 1);
      slotEl.appendChild(count);
    }
  }

  function positionDrag(/** @type {any} */ x, /** @type {any} */ y) {
    if (!dragEl) return;
    dragEl.style.left = `${x}px`;
    dragEl.style.top = `${y}px`;
  }

  function buildDragElement(/** @type {any} */ item) {
    const el = document.createElement('div');
    el.className = 'inventory-drag';
    const icon = document.createElement('div');
    icon.className = 'inventory-item';
    icon.textContent = makeItemLabel(item);
    el.appendChild(icon);
    const count = document.createElement('div');
    count.className = 'inventory-count';
    count.textContent = String(item.count ?? 1);
    el.appendChild(count);
    return el;
  }

  function startDrag(/** @type {any} */ index, /** @type {any} */ item, /** @type {any} */ event) {
    drag = { index };
    slotEls[index]?.classList.add('dragging');
    dragEl = buildDragElement(item);
    document.body.appendChild(dragEl);
    positionDrag(event.clientX, event.clientY);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function cancelDrag() {
    if (!drag) return;
    slotEls[drag.index]?.classList.remove('dragging');
    drag = null;
    if (dragEl) {
      dragEl.remove();
      dragEl = null;
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  function onPointerDown(/** @type {any} */ event) {
    if (!open) return;
    const slotEl =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const index = Number(slotEl?.dataset?.index);
    if (!Number.isInteger(index)) return;
    const item = slots[index];
    if (!item) return;
    event.preventDefault();
    startDrag(index, item, event);
  }

  function onPointerMove(/** @type {any} */ event) {
    positionDrag(event.clientX, event.clientY);
  }

  function onPointerUp(/** @type {any} */ event) {
    if (!drag) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const item = slots[drag.index];
    if (item && typeof onDropExternal === 'function') {
      const handled = onDropExternal({ slot: drag.index, item, target, event });
      if (handled) {
        cancelDrag();
        return;
      }
    }

    const slotEl = target?.closest?.('.inventory-slot');
    const toIndex = slotEl ? Number(slotEl.getAttribute('data-index')) : null;
    if (typeof toIndex === 'number' && Number.isInteger(toIndex) && toIndex !== drag.index) {
      const temp = slots[drag.index];
      slots[drag.index] = slots[toIndex];
      slots[toIndex] = temp;
      render();
      if (typeof onSwap === 'function') {
        onSwap(drag.index, toIndex);
      }
    }
    cancelDrag();
  }

  return {
    setOpen,
    isOpen,
    setInventory,
  };
}
