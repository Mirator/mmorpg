// @ts-check
import { EQUIP_SLOTS } from '/shared/equipment.js';
import { describeItemForTooltip, getItemDurabilityState } from './itemDetails.js';
import { getEquipmentSlotIconFile } from './gameIcons.js';
import { createGlyphElement } from './uiGlyphs.js';
import { populateItemVisual } from './itemVisuals.js';

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

function createTooltipElement(/** @type {any} */ item) {
  const details = describeItemForTooltip(item, { includeComparison: false });
  const tooltip = document.createElement('div');
  tooltip.className = 'item-tooltip';
  const title = document.createElement('div');
  title.className = 'item-tooltip-title';
  title.textContent = details.title;
  tooltip.appendChild(title);
  for (const line of details.baseLines) {
    const row = document.createElement('div');
    row.className = 'item-tooltip-body';
    row.textContent = line;
    tooltip.appendChild(row);
  }
  for (const line of details.weaponLines) {
    const row = document.createElement('div');
    row.className = 'item-tooltip-body';
    row.textContent = line;
    tooltip.appendChild(row);
  }
  if (details.flags.length > 0) {
    const flags = document.createElement('div');
    flags.className = 'item-tooltip-meta';
    flags.textContent = details.flags.join(' · ');
    tooltip.appendChild(flags);
  }
  return tooltip;
}

export function createEquipmentUI(/** @type {any} */ {
  grid,
  onSwap,
  previewResolver,
  onQuickUnequip,
}) {
  let equipment = cloneEquipment(null);
  let visible = true;
  let /** @type {any} */ drag = null;
  let /** @type {any} */ dragEl = null;
  const slotEls = new Map();

  function prewarm() {
    if (!visible || !previewResolver?.prewarm) return;
    previewResolver.prewarm(Object.values(equipment).filter(Boolean));
  }

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
      el.addEventListener('dblclick', onDoubleClick);
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
      el.classList.remove('durability-worn', 'durability-broken', 'broken-weapon');
      const label = el.querySelector('.equipment-label');
      el.innerHTML = '';
      if (label) el.appendChild(label);
      if (!item) {
        el.title = `${SLOT_LABELS[slot] ?? slot} slot`;
        const emptyIconFile = getEquipmentSlotIconFile(slot);
        if (emptyIconFile) {
          el.appendChild(
            createGlyphElement(emptyIconFile, {
              className: 'ui-glyph ui-glyph-lg equipment-slot-glyph',
              label: `${SLOT_LABELS[slot] ?? slot} slot`,
              muted: true,
            })
          );
        }
        continue;
      }
      el.title = item.name ?? item.kind ?? 'Item';
      const durabilityState = getItemDurabilityState(item);
      if (durabilityState === 'worn') {
        el.classList.add('durability-worn');
      } else if (durabilityState === 'broken') {
        el.classList.add('durability-broken');
        if (slot === 'weapon') el.classList.add('broken-weapon');
      }
      const icon = document.createElement('div');
      icon.className = 'equipment-item';
      populateItemVisual(icon, {
        item,
        label: item.name ?? item.kind ?? 'Item',
        glyphClassName: 'ui-glyph ui-glyph-lg equipment-item-glyph',
        thumbClassName: 'equipment-item-thumb',
        previewResolver,
      });
      el.appendChild(icon);
      el.appendChild(createTooltipElement(item));
    }
    prewarm();
  }

  function setEquipment(/** @type {any} */ nextEquipment) {
    equipment = cloneEquipment(nextEquipment);
    if (slotEls.size === 0) {
      buildGrid();
    }
    render();
  }

  function setVisible(/** @type {any} */ next) {
    visible = !!next;
    if (visible) prewarm();
  }

  function buildDragElement(/** @type {any} */ item) {
    const el = document.createElement('div');
    el.className = 'inventory-drag';
    const icon = document.createElement('div');
    icon.className = 'equipment-item';
    populateItemVisual(icon, {
      item,
      label: item.name ?? item.kind ?? 'Item',
      glyphClassName: 'ui-glyph ui-glyph-lg equipment-item-glyph',
      thumbClassName: 'equipment-item-thumb',
      previewResolver,
    });
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
    if ((event.detail ?? 0) >= 2) return;
    const target =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const slot = target?.dataset?.slot;
    if (!slot) return;
    const item = equipment?.[slot];
    if (!item) return;
    event.preventDefault();
    startDrag(slot, item, event);
  }

  function onDoubleClick(/** @type {any} */ event) {
    if (typeof onQuickUnequip !== 'function') return;
    const target = event?.currentTarget && typeof event.currentTarget === 'object'
      ? event.currentTarget
      : null;
    const slot = target?.dataset?.slot;
    if (!slot) return;
    const item = equipment?.[slot];
    if (!item) return;
    onQuickUnequip(slot);
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
    setVisible,
  };
}
