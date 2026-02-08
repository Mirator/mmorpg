const DEFAULT_COLS = 5;

function cloneSlots(slots, count) {
  const base = Array.isArray(slots) ? slots.map((item) => (item ? { ...item } : null)) : [];
  if (count && base.length < count) {
    return base.concat(Array.from({ length: count - base.length }, () => null));
  }
  if (count && base.length > count) {
    return base.slice(0, count);
  }
  return base;
}

function makeItemLabel(item) {
  const name = item?.name || item?.kind || 'Item';
  return name.slice(0, 1).toUpperCase();
}

export function createInventoryUI({ panel, grid, cols = DEFAULT_COLS, onSwap }) {
  let open = false;
  let slots = [];
  let slotCount = 0;
  let stackMax = 1;
  let drag = null;
  let dragEl = null;
  const slotEls = [];

  function setOpen(next) {
    open = !!next;
    panel?.classList.toggle('open', open);
    if (!open) {
      cancelDrag();
    }
  }

  function isOpen() {
    return open;
  }

  function setInventory(nextSlots, opts = {}) {
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

  function positionDrag(x, y) {
    if (!dragEl) return;
    dragEl.style.left = `${x}px`;
    dragEl.style.top = `${y}px`;
  }

  function buildDragElement(item) {
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

  function startDrag(index, item, event) {
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

  function onPointerDown(event) {
    if (!open) return;
    const slotEl = event.currentTarget;
    const index = Number(slotEl?.dataset?.index);
    if (!Number.isInteger(index)) return;
    const item = slots[index];
    if (!item) return;
    event.preventDefault();
    startDrag(index, item, event);
  }

  function onPointerMove(event) {
    positionDrag(event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    if (!drag) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const slotEl = target?.closest?.('.inventory-slot');
    const toIndex = slotEl ? Number(slotEl.dataset.index) : null;
    if (Number.isInteger(toIndex) && toIndex !== drag.index) {
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
