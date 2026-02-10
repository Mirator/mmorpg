import { EQUIP_SLOTS } from '/shared/equipment.js';

const SLOT_LABELS = {
  weapon: 'Weapon',
  offhand: 'Offhand',
  head: 'Head',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
};

function cloneEquipment(equipment) {
  const base = {};
  for (const slot of EQUIP_SLOTS) {
    const item = equipment?.[slot];
    base[slot] = item ? { ...item } : null;
  }
  return base;
}

function makeItemLabel(item) {
  const name = item?.name || item?.kind || 'Item';
  return name.slice(0, 1).toUpperCase();
}

export function createEquipmentUI({ grid, onSwap }) {
  let equipment = cloneEquipment(null);
  let drag = null;
  let dragEl = null;
  const slotEls = new Map();

  function buildGrid() {
    if (!grid) return;
    grid.innerHTML = '';
    slotEls.clear();
    for (const slot of EQUIP_SLOTS) {
      const el = document.createElement('div');
      el.className = 'equipment-slot empty';
      el.dataset.slot = slot;
      const label = document.createElement('div');
      label.className = 'equipment-label';
      label.textContent = SLOT_LABELS[slot] ?? slot;
      el.appendChild(label);
      el.addEventListener('pointerdown', onPointerDown);
      grid.appendChild(el);
      slotEls.set(slot, el);
    }
  }

  function render() {
    for (const slot of EQUIP_SLOTS) {
      const el = slotEls.get(slot);
      if (!el) continue;
      const item = equipment?.[slot];
      el.classList.toggle('empty', !item);
      const label = el.querySelector('.equipment-label');
      el.innerHTML = '';
      if (label) el.appendChild(label);
      if (!item) {
        el.title = `${SLOT_LABELS[slot] ?? slot} slot`;
        continue;
      }
      el.title = item.name ?? item.kind ?? 'Item';
      const icon = document.createElement('div');
      icon.className = 'equipment-item';
      icon.textContent = makeItemLabel(item);
      el.appendChild(icon);
    }
  }

  function setEquipment(nextEquipment) {
    equipment = cloneEquipment(nextEquipment);
    if (slotEls.size === 0) {
      buildGrid();
    }
    render();
  }

  function buildDragElement(item) {
    const el = document.createElement('div');
    el.className = 'inventory-drag';
    const icon = document.createElement('div');
    icon.className = 'equipment-item';
    icon.textContent = makeItemLabel(item);
    el.appendChild(icon);
    return el;
  }

  function positionDrag(x, y) {
    if (!dragEl) return;
    dragEl.style.left = `${x}px`;
    dragEl.style.top = `${y}px`;
  }

  function startDrag(slot, item, event) {
    drag = { slot };
    const el = slotEls.get(slot);
    el?.classList.add('dragging');
    dragEl = buildDragElement(item);
    document.body.appendChild(dragEl);
    positionDrag(event.clientX, event.clientY);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function cancelDrag() {
    if (!drag) return;
    const el = slotEls.get(drag.slot);
    el?.classList.remove('dragging');
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
    const slot = event.currentTarget?.dataset?.slot;
    if (!slot) return;
    const item = equipment?.[slot];
    if (!item) return;
    event.preventDefault();
    startDrag(slot, item, event);
  }

  function onPointerMove(event) {
    positionDrag(event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    if (!drag) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const equipTarget = target?.closest?.('.equipment-slot');
    const invTarget = target?.closest?.('.inventory-slot');

    if (equipTarget?.dataset?.slot) {
      const toSlot = equipTarget.dataset.slot;
      if (toSlot !== drag.slot) {
        onSwap?.({
          fromType: 'equipment',
          fromSlot: drag.slot,
          toType: 'equipment',
          toSlot,
        });
      }
      cancelDrag();
      return;
    }

    if (invTarget?.dataset?.index) {
      const toSlot = Number(invTarget.dataset.index);
      if (Number.isInteger(toSlot)) {
        onSwap?.({
          fromType: 'equipment',
          fromSlot: drag.slot,
          toType: 'inventory',
          toSlot,
        });
      }
      cancelDrag();
      return;
    }

    cancelDrag();
  }

  buildGrid();

  return {
    setEquipment,
  };
}
