// @ts-check
import { compareByCategoryThenName, getItemCategoryFromKind } from './itemMeta.js';
import { describeItemForTooltip, getItemDurabilityState } from './itemDetails.js';
import { populateItemVisual } from './itemVisuals.js';

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

function normalizeSearch(/** @type {any} */ value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function parseSort(/** @type {any} */ value) {
  if (value === 'name' || value === 'count') return value;
  return 'type_name';
}

function parseFilter(/** @type {any} */ value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'all') return 'all';
  if (
    normalized === 'weapon' ||
    normalized === 'offhand' ||
    normalized === 'armor' ||
    normalized === 'consumable' ||
    normalized === 'material' ||
    normalized === 'misc'
  ) {
    return normalized;
  }
  return 'all';
}

function createTooltipElement(/** @type {any} */ item, /** @type {any} */ stackMax, /** @type {any} */ equipment) {
  const details = describeItemForTooltip(item, {
    stackMax,
    equipment,
    includeComparison: true,
  });
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
  if (details.comparisonLines.length > 0) {
    const compareTitle = document.createElement('div');
    compareTitle.className = 'item-tooltip-meta';
    compareTitle.textContent = 'Equip Comparison';
    tooltip.appendChild(compareTitle);
    for (const line of details.comparisonLines) {
      const row = document.createElement('div');
      row.className = `item-tooltip-compare ${line.startsWith('+') ? 'positive' : 'negative'}`;
      row.textContent = line;
      tooltip.appendChild(row);
    }
  }
  return tooltip;
}

export function createInventoryUI(/** @type {any} */ {
  panel,
  grid,
  cols = DEFAULT_COLS,
  onSwap,
  onDropExternal,
  previewResolver,
  getEquipmentState,
  onQuickEquip,
  searchInput,
  filterSelect,
  sortSelect,
}) {
  let open = false;
  let /** @type {any} */ slots = [];
  let slotCount = 0;
  let stackMax = 1;
  let /** @type {any} */ drag = null;
  let /** @type {any} */ touchPress = null;
  let /** @type {any} */ dragEl = null;
  let searchQuery = normalizeSearch(searchInput?.value);
  let categoryFilter = parseFilter(filterSelect?.value);
  let sortMode = parseSort(sortSelect?.value);
  let pointerListenersAttached = false;
  const slotEls = new Map();

  function attachPointerListeners() {
    if (pointerListenersAttached) return;
    pointerListenersAttached = true;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function detachPointerListeners() {
    if (!pointerListenersAttached) return;
    pointerListenersAttached = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  function updateOpenTooltips(/** @type {HTMLElement | null} */ active = null) {
    for (const slotEl of slotEls.values()) {
      if (slotEl === active) {
        slotEl.classList.add('show-tooltip');
      } else {
        slotEl.classList.remove('show-tooltip');
      }
    }
  }

  function getOrderedEntries() {
    const /** @type {Array<{ index: number, item: any }>} */ allEntries = [];
    for (let index = 0; index < slotCount; index += 1) {
      allEntries.push({ index, item: slots[index] ?? null });
    }
    const hasFilter = searchQuery.length > 0 || categoryFilter !== 'all';
    let entries = hasFilter
      ? allEntries.filter((entry) => {
          if (!entry.item) return false;
          const itemName = String(entry.item?.name ?? entry.item?.kind ?? '').toLowerCase();
          const kind = String(entry.item?.kind ?? '').toLowerCase();
          const searchOk = !searchQuery || itemName.includes(searchQuery) || kind.includes(searchQuery);
          if (!searchOk) return false;
          if (categoryFilter === 'all') return true;
          return getItemCategoryFromKind(kind) === categoryFilter;
        })
      : allEntries;
    const itemEntries = entries.filter((entry) => entry.item);
    const emptyEntries = entries.filter((entry) => !entry.item);
    itemEntries.sort((left, right) => {
      if (sortMode === 'name') {
        const leftName = String(left.item?.name ?? left.item?.kind ?? '').toLowerCase();
        const rightName = String(right.item?.name ?? right.item?.kind ?? '').toLowerCase();
        return leftName.localeCompare(rightName);
      }
      if (sortMode === 'count') {
        const countDiff = (Number(right.item?.count) || 0) - (Number(left.item?.count) || 0);
        if (countDiff !== 0) return countDiff;
        const leftName = String(left.item?.name ?? left.item?.kind ?? '').toLowerCase();
        const rightName = String(right.item?.name ?? right.item?.kind ?? '').toLowerCase();
        return leftName.localeCompare(rightName);
      }
      return compareByCategoryThenName(left.item, right.item);
    });
    return hasFilter ? itemEntries : [...itemEntries, ...emptyEntries];
  }

  function setOpen(/** @type {any} */ next) {
    open = !!next;
    panel?.classList.toggle('open', open);
    if (open) {
      prewarmVisible();
    }
    if (!open) {
      cancelDrag();
      updateOpenTooltips(null);
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
    } else if (!slotCount && nextSlots?.length) {
      slotCount = nextSlots.length;
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

  function buildGrid(/** @type {Array<{ index: number, item: any }>} */ orderedEntries) {
    if (!grid) return;
    grid.innerHTML = '';
    slotEls.clear();
    panel?.style.setProperty('--inventory-cols', String(cols));
    if (orderedEntries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'inventory-empty-message';
      empty.textContent = 'No items match current filters.';
      grid.appendChild(empty);
      return;
    }
    for (const entry of orderedEntries) {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot empty';
      slot.dataset.index = String(entry.index);
      slot.addEventListener('pointerdown', onPointerDown);
      slot.addEventListener('dblclick', onDoubleClick);
      grid.appendChild(slot);
      slotEls.set(entry.index, slot);
    }
  }

  function prewarmVisible() {
    if (!open || !previewResolver?.prewarm) return;
    const items = [];
    for (const entry of getOrderedEntries()) {
      if (entry.item) items.push(entry.item);
    }
    previewResolver.prewarm(items);
  }

  function render() {
    const orderedEntries = getOrderedEntries();
    buildGrid(orderedEntries);
    for (const entry of orderedEntries) {
      const slotEl = slotEls.get(entry.index);
      if (!slotEl) continue;
      const item = entry.item;
      slotEl.innerHTML = '';
      slotEl.classList.toggle('empty', !item);
      slotEl.classList.remove('durability-worn', 'durability-broken', 'broken-weapon');
      if (!item) {
        slotEl.title = 'Empty slot';
        continue;
      }
      const durabilityState = getItemDurabilityState(item);
      if (durabilityState === 'worn') {
        slotEl.classList.add('durability-worn');
      } else if (durabilityState === 'broken') {
        slotEl.classList.add('durability-broken');
        if (String(item.kind ?? '').startsWith('weapon_')) {
          slotEl.classList.add('broken-weapon');
        }
      }
      slotEl.title = `${item.name ?? item.kind ?? 'Item'} (${item.count ?? 1}/${stackMax})`;

      const icon = document.createElement('div');
      icon.className = 'inventory-item';
      populateItemVisual(icon, {
        item,
        label: item.name ?? item.kind ?? 'Item',
        glyphClassName: 'ui-glyph ui-glyph-lg inventory-item-glyph',
        thumbClassName: 'inventory-item-thumb',
        previewResolver,
      });
      slotEl.appendChild(icon);

      const count = document.createElement('div');
      count.className = 'inventory-count';
      count.textContent = String(item.count ?? 1);
      slotEl.appendChild(count);
      slotEl.appendChild(
        createTooltipElement(item, stackMax, getEquipmentState?.() ?? null)
      );
    }
    prewarmVisible();
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
    populateItemVisual(icon, {
      item,
      label: item.name ?? item.kind ?? 'Item',
      glyphClassName: 'ui-glyph ui-glyph-lg inventory-item-glyph',
      thumbClassName: 'inventory-item-thumb',
      previewResolver,
    });
    el.appendChild(icon);
    const count = document.createElement('div');
    count.className = 'inventory-count';
    count.textContent = String(item.count ?? 1);
    el.appendChild(count);
    return el;
  }

  function startDrag(/** @type {any} */ index, /** @type {any} */ item, /** @type {any} */ event) {
    drag = { index };
    slotEls.get(index)?.classList.add('dragging');
    dragEl = buildDragElement(item);
    document.body.appendChild(dragEl);
    positionDrag(event.clientX, event.clientY);
    attachPointerListeners();
  }

  function cancelDrag() {
    if (drag) {
      slotEls.get(drag.index)?.classList.remove('dragging');
      drag = null;
    }
    if (touchPress) {
      clearTimeout(touchPress.timer);
      touchPress = null;
    }
    drag = null;
    if (dragEl) {
      dragEl.remove();
      dragEl = null;
    }
    detachPointerListeners();
  }

  function onPointerDown(/** @type {any} */ event) {
    if (!open) return;
    if ((event.detail ?? 0) >= 2) return;
    const slotEl =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const index = Number(slotEl?.dataset?.index);
    if (!Number.isInteger(index)) return;
    const item = slots[index];
    if (!item) return;
    event.preventDefault();
    if (event.pointerType === 'touch') {
      updateOpenTooltips(null);
      touchPress = {
        index,
        item,
        startX: event.clientX,
        startY: event.clientY,
        shown: false,
        timer: setTimeout(() => {
          touchPress = touchPress
            ? {
                ...touchPress,
                shown: true,
              }
            : null;
          updateOpenTooltips(slotEl);
        }, 360),
      };
      attachPointerListeners();
      return;
    }
    startDrag(index, item, event);
  }

  function onPointerMove(/** @type {any} */ event) {
    if (drag) {
      positionDrag(event.clientX, event.clientY);
      return;
    }
    if (!touchPress) return;
    const dx = event.clientX - touchPress.startX;
    const dy = event.clientY - touchPress.startY;
    if (touchPress.shown) return;
    if (Math.hypot(dx, dy) < 10) return;
    clearTimeout(touchPress.timer);
    const { index, item } = touchPress;
    touchPress = null;
    startDrag(index, item, event);
  }

  function onPointerUp(/** @type {any} */ event) {
    if (!drag) {
      if (!touchPress) return;
      const targetSlot = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.inventory-slot');
      const targetIndex = Number(targetSlot?.getAttribute?.('data-index'));
      const shouldToggle = Number.isInteger(targetIndex) && targetIndex === touchPress.index;
      const slotEl = Number.isInteger(targetIndex) ? slotEls.get(targetIndex) ?? null : null;
      clearTimeout(touchPress.timer);
      const showedByHold = touchPress.shown;
      touchPress = null;
      if (shouldToggle && slotEl) {
        updateOpenTooltips(showedByHold ? slotEl : null);
      } else {
        updateOpenTooltips(null);
      }
      detachPointerListeners();
      return;
    }
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

  function onDoubleClick(/** @type {any} */ event) {
    if (!open || typeof onQuickEquip !== 'function') return;
    const slotEl = event?.currentTarget && typeof event.currentTarget === 'object'
      ? event.currentTarget
      : null;
    const index = Number(slotEl?.dataset?.index);
    if (!Number.isInteger(index)) return;
    if (!slots[index]) return;
    onQuickEquip(index);
  }

  function onControlInput() {
    searchQuery = normalizeSearch(searchInput?.value);
    categoryFilter = parseFilter(filterSelect?.value);
    sortMode = parseSort(sortSelect?.value);
    render();
  }

  searchInput?.addEventListener?.('input', onControlInput);
  filterSelect?.addEventListener?.('change', onControlInput);
  sortSelect?.addEventListener?.('change', onControlInput);

  return {
    setOpen,
    isOpen,
    setInventory,
  };
}
