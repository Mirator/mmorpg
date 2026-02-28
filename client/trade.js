// @ts-check
import { getItemIconFile } from './gameIcons.js';
import { createGlyphElement, createVisuallyHiddenText } from './uiGlyphs.js';

/**
 * Player-to-player trade UI.
 * Renders trade panel with my offer / their offer, add copper, confirm, cancel.
 */

/**
 * @typedef {{ id?: string, kind?: string, name?: string, count?: number }} TradeItem
 * @typedef {{ items: Array<TradeItem | null>, copper: number }} TradeOffer
 * @typedef {{
 *   myOffer?: TradeOffer;
 *   theirOffer?: TradeOffer;
 *   confirmed?: boolean;
 *   theirConfirmed?: boolean;
 * }} TradeOffersUpdate
 */

export function createPlayerTradeUI(/** @type {any} */ {
  panel,
  partnerNameEl,
  myOfferEl,
  theirOfferEl,
  myCopperEl,
  theirCopperEl,
  addCopperInput,
  addCopperBtn,
  removeCopperBtn,
  confirmBtn,
  cancelBtn,
  statusEl,
  onAddItem,
  onRemoveItem,
  onAddCopper,
  onRemoveCopper,
  onConfirm,
  onCancel,
}) {
  let open = false;
  let partnerName = '';
  /** @type {TradeOffer} */
  let myOffer = { items: [], copper: 0 };
  /** @type {TradeOffer} */
  let theirOffer = { items: [], copper: 0 };
  let confirmed = false;
  let theirConfirmed = false;

  function setOpen(/** @type {any} */ next) {
    open = !!next;
    panel?.classList.toggle('hidden', !open);
    document.body.classList.toggle('player-trade-open', open);
  }

  function isOpen() {
    return open;
  }

  function setPartnerName(/** @type {any} */ name) {
    partnerName = name ?? 'Unknown';
    if (partnerNameEl) partnerNameEl.textContent = partnerName;
  }

  /**
   * @param {TradeOffersUpdate} [next]
   */
  function setOffers({ myOffer: my, theirOffer: their, confirmed: c, theirConfirmed: tc } = {}) {
    myOffer = my ?? { items: [], copper: 0 };
    theirOffer = their ?? { items: [], copper: 0 };
    confirmed = c ?? false;
    theirConfirmed = tc ?? false;
    render();
  }

  function makeItemLabel(/** @type {any} */ item) {
    const name = item?.name || item?.kind || 'Item';
    return name.slice(0, 1).toUpperCase();
  }

  function populateItemVisual(/** @type {HTMLElement} */ container, /** @type {any} */ item) {
    const iconFile = getItemIconFile(item?.kind);
    const label = item?.name || item?.kind || 'Item';
    if (!iconFile) {
      container.textContent = makeItemLabel(item);
      return;
    }
    container.appendChild(
      createGlyphElement(iconFile, {
        className: 'ui-glyph ui-glyph-md trade-item-glyph',
        label,
      })
    );
    container.appendChild(createVisuallyHiddenText(label));
  }

  function render() {
    if (!myOfferEl) return;
    myOfferEl.innerHTML = '';
    const items = myOffer?.items ?? [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      const slot = document.createElement('div');
      slot.className = 'trade-offer-slot';
      slot.dataset.index = String(i);
      const icon = document.createElement('div');
      icon.className = 'trade-slot-icon';
      populateItemVisual(icon, item);
      slot.appendChild(icon);
      const count = document.createElement('div');
      count.className = 'trade-slot-count';
      count.textContent = String(item.count ?? 1);
      slot.appendChild(count);
      if (!confirmed) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×';
        removeBtn.type = 'button';
        removeBtn.addEventListener('click', () => onRemoveItem?.(i));
        slot.appendChild(removeBtn);
      }
      myOfferEl.appendChild(slot);
    }

    if (theirOfferEl) {
      theirOfferEl.innerHTML = '';
      const theirItems = theirOffer?.items ?? [];
      for (const item of theirItems) {
        if (!item) continue;
        const slot = document.createElement('div');
        slot.className = 'trade-offer-slot';
        const icon = document.createElement('div');
        icon.className = 'trade-slot-icon';
        populateItemVisual(icon, item);
        slot.appendChild(icon);
        const count = document.createElement('div');
        count.className = 'trade-slot-count';
        count.textContent = String(item.count ?? 1);
        slot.appendChild(count);
        theirOfferEl.appendChild(slot);
      }
    }

    if (myCopperEl) myCopperEl.textContent = String(myOffer?.copper ?? 0);
    if (theirCopperEl) theirCopperEl.textContent = String(theirOffer?.copper ?? 0);

    if (confirmBtn) {
      confirmBtn.disabled = confirmed;
      confirmBtn.textContent = confirmed ? 'Confirmed' : 'Confirm';
    }
    if (addCopperInput) addCopperInput.disabled = confirmed;
    if (addCopperBtn) addCopperBtn.disabled = confirmed;
    if (removeCopperBtn) removeCopperBtn.disabled = confirmed;

    if (statusEl) {
      if (confirmed && theirConfirmed) {
        statusEl.textContent = 'Both confirmed - completing...';
      } else if (confirmed) {
        statusEl.textContent = 'Waiting for partner...';
      } else if (theirConfirmed) {
        statusEl.textContent = 'Partner is ready';
      } else {
        statusEl.textContent = '';
      }
    }
  }

  function close() {
    setOpen(false);
    setOffers({});
    setPartnerName('');
  }

  addCopperBtn?.addEventListener('click', () => {
    const val = parseInt(addCopperInput?.value ?? '0', 10);
    if (Number.isFinite(val) && val > 0) {
      onAddCopper?.(val);
      addCopperInput.value = '';
    }
  });

  removeCopperBtn?.addEventListener('click', () => {
    onRemoveCopper?.();
  });

  confirmBtn?.addEventListener('click', () => {
    onConfirm?.();
  });

  cancelBtn?.addEventListener('click', () => {
    onCancel?.();
  });

  return {
    setOpen,
    isOpen,
    setPartnerName,
    setOffers,
    close,
    render,
  };
}
