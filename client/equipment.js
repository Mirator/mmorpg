// @ts-check
import { EQUIP_SLOTS } from '/shared/equipment.js';

const /** @type {any} */ SLOT_LABELS = {
  weapon: 'Weapon',
  offhand: 'Offhand',
  head: 'Head',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
};

function cloneEquipment(/** @type {any} */ equipment) {
  const /** @type {any} */ base = {};
  for (const slot of EQUIP_SLOTS) {
    const item = equipment?.[slot];
    base[slot] = item ? { ...item } : null;
  }
  return base;
}

function makeItemLabel(/** @type {any} */ item) {
  const name = item?.name || item?.kind || 'Item';
  return name.slice(0, 1).toUpperCase();
}

export function createEquipmentUI(/** @type {any} */ { grid, onSwap }) {
  let equipment = cloneEquipment(null);
  let /** @type {any} */ drag = null;
  let /** @type {any} */ dragEl = null;
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

  function setEquipment(/** @type {any} */ nextEquipment) {
    equipment = cloneEquipment(nextEquipment);
    if (slotEls.size === 0) {
      buildGrid();
    }
    render();
  }

  function buildDragElement(/** @type {any} */ item) {
    const el = document.createElement('div');
    el.className = 'inventory-drag';
    const icon = document.createElement('div');
    icon.className = 'equipment-item';
    icon.textContent = makeItemLabel(item);
    el.appendChild(icon);
    return el;
  }

  function positionDrag(/** @type {any} */ x, /** @type {any} */ y) {
    if (!dragEl) return;
    dragEl.style.left = `${x}px`;
    dragEl.style.top = `${y}px`;
  }

  function startDrag(/** @type {any} */ slot, /** @type {any} */ item, /** @type {any} */ event) {
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

  function onPointerDown(/** @type {any} */ event) {
    const target =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const slot = target?.dataset?.slot;
    if (!slot) return;
    const item = equipment?.[slot];
    if (!item) return;
    event.preventDefault();
    startDrag(slot, item, event);
  }

  function onPointerMove(/** @type {any} */ event) {
    positionDrag(event.clientX, event.clientY);
  }

  function onPointerUp(/** @type {any} */ event) {
    if (!drag) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const equipTarget = target?.closest?.('.equipment-slot');
    const invTarget = target?.closest?.('.inventory-slot');

    const equipSlot = equipTarget?.getAttribute('data-slot');
    if (equipSlot) {
      const toSlot = equipSlot;
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

    const inventorySlot = invTarget?.getAttribute('data-index');
    if (inventorySlot) {
      const toSlot = Number(inventorySlot);
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
