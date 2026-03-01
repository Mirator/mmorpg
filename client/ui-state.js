// @ts-check
import {
  formatCurrency,
  getResourceConfig,
  VENDOR_SELL_PRICES,
  VENDOR_BUY_ITEMS,
} from '/shared/economy.js';
import {
  ABILITY_SLOTS,
  DEFAULT_CLASS_ID,
  getAbilitiesForClass,
  getClassById,
} from '/shared/classes.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { computeRawAttributes, computeDerivedStats } from '/shared/attributes.js';
import { totalXpForLevel, xpToNext } from '/shared/progression.js';
import {
  setStatus,
  updateHud,
  updateObjectives,
  updateTargetHud,
  showPrompt,
  clearPrompt,
  showEvent,
  flashDamage,
  showToast,
} from './ui.js';
import { createInventoryUI } from './inventory.js';
import { createEquipmentUI } from './equipment.js';
import { createVendorUI } from './vendor.js';
import { createCraftingUI } from './crafting.js';
import { createPlayerTradeUI } from './trade.js';
import { getRecipeById, getRecipesForKnownIds } from '/shared/recipes.js';
import { createAbilityBar } from './ui-state/abilityBar.js';
import { createSkillsPanelUpdater } from './ui-state/skillsPanel.js';
import { createAbilityLoadoutController } from './abilityLoadout.js';
import { createCharacterPreview } from './character-preview.js';
import { createWindowDragController } from './window-drag.js';
import { getItemIconFile } from './gameIcons.js';
import { createGlyphElement } from './uiGlyphs.js';
import { createJournalUI } from './journal.js';

function formatItemName(/** @type {any} */ kind) {
  if (!kind) return 'Item';
  return kind
    .split('_')
    .map((/** @type {any} */ part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function createItemLabelNode(
  /** @type {any} */ kind,
  /** @type {any} */ text,
  /** @type {string} */ className
) {
  const label = document.createElement('div');
  label.className = className;
  const iconFile = getItemIconFile(kind);
  if (iconFile) {
    label.appendChild(
      createGlyphElement(iconFile, {
        className: 'ui-glyph ui-glyph-sm vendor-item-glyph',
        label: text,
      })
    );
  }
  const span = document.createElement('span');
  span.textContent = String(text ?? '');
  label.appendChild(span);
  return label;
}

export function createUiState(/** @type {any} */ {
  onInventorySwap,
  onEquipmentSwap,
  onVendorSell,
  onVendorBuy,
  onCraft,
  onContractAccept,
  onContractAbandon,
  onContractTurnIn,
  onRepairItem,
  onSalvageItem,
  onAbilityClick,
  onUiOpen,
  onRespawn,
  isChatFocused,
  onTradeOfferAddSlot,
  onTradeOfferAddCopper,
  onTradeOfferRemoveItem,
  onTradeOfferRemoveCopper,
  onTradeConfirm,
  onTradeCancel,
  getPlayerId,
}) {
  const inventoryPanel = document.getElementById('inventory-panel');
  const characterSheetPanel = document.getElementById('character-sheet-panel');
  const characterSheetClose = document.getElementById('character-sheet-close');
  const characterModelPreviewEl = /** @type {HTMLElement | null} */ (
    document.getElementById('character-model-preview')
  );
  const characterView = document.getElementById('character-view');
  const skillsView = document.getElementById('skills-view');
  const sheetTabBtns = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll('#sheet-bottom-tabs .sheet-tab-btn')
  );
  const skillsClassEl = document.getElementById('skills-class');
  const skillsLevelEl = document.getElementById('skills-level');
  const skillsXpEl = document.getElementById('skills-xp');
  const skillsListEl = document.getElementById('skills-list');
  const inventoryGrid = document.getElementById('inventory-grid');
  const inventoryView = document.getElementById('inventory-view');
  const craftView = document.getElementById('craft-view');
  const journalView = document.getElementById('journal-view');
  const craftRecipeListEl = document.getElementById('craft-recipe-list');
  const journalRootEl = document.getElementById('journal-root');
  const inventoryTabBtns = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll('.inventory-tab')
  );
  const equipmentGrid = document.getElementById('equipment-grid');
  const charStatHp = document.getElementById('char-stat-hp');
  const charStatResource = document.getElementById('char-stat-resource');
  const charStatStr = document.getElementById('char-stat-str');
  const charStatDex = document.getElementById('char-stat-dex');
  const charStatInt = document.getElementById('char-stat-int');
  const charStatVit = document.getElementById('char-stat-vit');
  const charStatSpi = document.getElementById('char-stat-spi');
  const charStatPhysPower = document.getElementById('char-stat-phys-power');
  const charStatRangedPower = document.getElementById('char-stat-ranged-power');
  const charStatMagicPower = document.getElementById('char-stat-magic-power');
  const charStatHealingPower = document.getElementById('char-stat-healing-power');
  const charStatCrit = document.getElementById('char-stat-crit');
  const charStatAccuracy = document.getElementById('char-stat-accuracy');
  const charStatEvasion = document.getElementById('char-stat-evasion');
  const charStatPhysDef = document.getElementById('char-stat-phys-def');
  const charStatMagicResist = document.getElementById('char-stat-magic-resist');
  const charStatLevel = document.getElementById('char-stat-level');
  const charStatClass = document.getElementById('char-stat-class');
  const charSheetCharMeta = document.getElementById('character-sheet-char-meta');
  const vendorDialog = document.getElementById('vendor-dialog');
  const vendorPanel = document.getElementById('vendor-panel');
  const vendorDialogName = document.getElementById('vendor-dialog-name');
  const vendorPanelName = document.getElementById('vendor-panel-name');
  const vendorTradeBtn = document.getElementById('vendor-trade-btn');
  const vendorCloseBtn = document.getElementById('vendor-close-btn');
  const vendorPanelCloseBtn = document.getElementById('vendor-panel-close');
  const vendorPricesEl = document.getElementById('vendor-sell-prices');
  const vendorBuyItemsEl = document.getElementById('vendor-buy-items');
  const vendorContractsEl = document.getElementById('vendor-contract-list');
  const inventoryCoinsEl = document.getElementById('inventory-coins');
  const abilityBar = document.getElementById('ability-bar');
  const deathScreen = document.getElementById('death-screen');
  const deathTimerEl = document.getElementById('death-timer');
  const deathRespawnBtn = document.getElementById('death-respawn-btn');
  const castBarWrap = document.getElementById('cast-bar-wrap');
  const castBarFill = document.getElementById('cast-bar-fill');
  const castBarName = document.getElementById('cast-bar-name');

  let /** @type {any} */ inventoryUI = null;
  let /** @type {any} */ equipmentUI = null;
  let /** @type {any} */ vendorUI = null;
  let /** @type {any} */ playerTradeUI = null;
  let /** @type {any} */ craftingUI = null;
  let /** @type {any} */ journalUI = null;
  let /** @type {any} */ windowDragController = null;

  let inventoryOpen = false;
  let inventoryOpenBeforeVendorTrade = false;
  let inventoryTab = 'inventory';
  let characterOpen = false;
  let characterTab = 'character';
  let menuOpen = true;
  let pauseMenuOpen = false;
  let deadOpen = false;
  const abilityBarModule = createAbilityBar(abilityBar, onAbilityClick);
  const abilityLoadout = createAbilityLoadoutController({
    storage: globalThis?.localStorage ?? null,
  });
  function makeEmptyAbilitySlots() {
    return Array.from({ length: ABILITY_SLOTS }, () => null);
  }

  function getAbilityLoadoutContext(/** @type {any} */ me) {
    if (!me) return null;
    const classId = getCurrentClassId(me);
    const weaponDef = getEquippedWeapon(me?.equipment, classId);
    const abilities = getAbilitiesForClass(classId, me?.level ?? 1, weaponDef);
    return {
      playerId: getPlayerId?.() ?? me?.id ?? null,
      classId,
      weaponDef,
      abilities,
    };
  }

  function buildAbilityPanelState(/** @type {any} */ me) {
    const ctx = getAbilityLoadoutContext(me);
    if (!ctx) {
      return {
        classId: DEFAULT_CLASS_ID,
        weaponDef: null,
        abilities: [],
        slottedAbilities: makeEmptyAbilitySlots(),
        loadoutSignature: makeEmptyAbilitySlots().map(() => '-').join('|'),
      };
    }
    return {
      classId: ctx.classId,
      weaponDef: ctx.weaponDef,
      abilities: ctx.abilities,
      slottedAbilities: abilityLoadout.getSlottedAbilities(ctx),
      loadoutSignature: abilityLoadout.getSignature(ctx),
    };
  }

  function getAbilityForSlot(/** @type {any} */ me, /** @type {any} */ slot) {
    const ctx = getAbilityLoadoutContext(me);
    if (!ctx) return null;
    return abilityLoadout.getAbilityForSlot(ctx, slot);
  }

  function getAbilityActionPayload(/** @type {any} */ me, /** @type {any} */ slot) {
    const ability = getAbilityForSlot(me, slot);
    if (!ability?.id) return null;
    return { slot, abilityId: ability.id };
  }

  function setAbilityInSlot(/** @type {any} */ me, /** @type {any} */ abilityId, /** @type {any} */ slot) {
    const ctx = getAbilityLoadoutContext(me);
    if (!ctx) return buildAbilityPanelState(me);
    abilityLoadout.setAbilityInSlot(ctx, abilityId, slot);
    return buildAbilityPanelState(me);
  }

  function swapAbilitySlots(/** @type {any} */ me, /** @type {any} */ fromSlot, /** @type {any} */ toSlot) {
    const ctx = getAbilityLoadoutContext(me);
    if (!ctx) return buildAbilityPanelState(me);
    abilityLoadout.swapSlots(ctx, fromSlot, toSlot);
    return buildAbilityPanelState(me);
  }

  function clearAbilitySlot(/** @type {any} */ me, /** @type {any} */ slot) {
    const ctx = getAbilityLoadoutContext(me);
    if (!ctx) return buildAbilityPanelState(me);
    abilityLoadout.clearSlot(ctx, slot);
    return buildAbilityPanelState(me);
  }

  const updateSkillsPanel = createSkillsPanelUpdater({
    skillsListEl,
    skillsClassEl,
    skillsLevelEl,
    skillsXpEl,
    getAbilityPanelState: buildAbilityPanelState,
    setAbilityInSlot,
    swapAbilitySlots,
    clearAbilitySlot,
  });
  const characterPreview = createCharacterPreview(characterModelPreviewEl);
  let wasDead = false;

  /** @type {{
   *   hp: number | null,
   *   inv: number | null,
   *   currencyCopper: number | null,
   *   level: number | null,
   *   totalXp: number | null,
   *   activeContracts: any[],
   *   contractOffersByVendor: Record<string, any[]>,
   * }} */
  const lastStats = {
    hp: null,
    inv: null,
    currencyCopper: null,
    level: null,
    totalXp: null,
    activeContracts: [],
    contractOffersByVendor: {},
  };

  function getCurrentClassId(/** @type {any} */ me) {
    return me?.classId ?? DEFAULT_CLASS_ID;
  }

  function setInventoryOpen(/** @type {any} */ next) {
    inventoryOpen = !!next;
    inventoryPanel?.classList.toggle('open', inventoryOpen);
    document.body.classList.toggle('inventory-open', inventoryOpen);
    inventoryUI?.setOpen?.(inventoryOpen);
    if (inventoryOpen) {
      clearPrompt();
      onUiOpen?.();
    }
  }

  function setVendorLayoutOpen(/** @type {any} */ next) {
    document.body.classList.toggle('vendor-layout-open', !!next);
  }

  function openVendorTradeLayout() {
    inventoryOpenBeforeVendorTrade = inventoryOpen;
    setVendorLayoutOpen(true);
    setInventoryOpen(true);
  }

  function closeVendorTradeLayout() {
    setVendorLayoutOpen(false);
    setInventoryOpen(inventoryOpenBeforeVendorTrade);
    inventoryOpenBeforeVendorTrade = false;
    setCharacterOpen(false);
  }

  function setCharacterOpen(/** @type {any} */ next) {
    characterOpen = !!next;
    characterSheetPanel?.classList.toggle('open', characterOpen);
    document.body.classList.toggle('character-open', characterOpen);
    characterPreview?.setOpen?.(characterOpen);
    if (characterOpen) {
      clearPrompt();
      onUiOpen?.();
    }
  }

  function setCharacterTab(/** @type {any} */ tab) {
    if (!['character', 'skills'].includes(tab)) return;
    characterTab = tab;
    characterView?.classList.toggle('active', tab === 'character');
    skillsView?.classList.toggle('active', tab === 'skills');
    characterPreview?.setVisible?.(tab === 'character');
    for (const btn of sheetTabBtns ?? []) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
  }

  function setInventoryTab(/** @type {any} */ tab) {
    if (!['inventory', 'craft', 'journal'].includes(tab)) return;
    inventoryTab = tab;
    inventoryView?.classList.toggle('active', tab === 'inventory');
    craftView?.classList.toggle('active', tab === 'craft');
    journalView?.classList.toggle('active', tab === 'journal');
    for (const btn of inventoryTabBtns ?? []) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
    if (tab === 'craft') {
      craftingUI?.render?.();
    } else if (tab === 'journal') {
      journalUI?.render?.();
    }
  }

  function setDeathOpen(/** @type {any} */ open) {
    deadOpen = !!open;
    deathScreen?.classList.toggle('open', deadOpen);
  }

  function formatAbilityNameFromId(/** @type {any} */ id) {
    if (!id || typeof id !== 'string') return '--';
    return id
      .split('_')
      .map((/** @type {any} */ w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  function updateCastBar(/** @type {any} */ me, /** @type {any} */ serverNow) {
    if (!castBarWrap || !castBarFill || !castBarName) {
      document.body.classList.remove('cast-bar-active');
      return;
    }
    const cast = me?.cast;
    const harvest = me?.harvest;
    if (!cast && !harvest) {
      castBarWrap.classList.add('hidden');
      document.body.classList.remove('cast-bar-active');
      return;
    }

    castBarWrap.classList.remove('hidden');
    document.body.classList.add('cast-bar-active');
    const startedAt = cast?.startedAt ?? harvest?.startedAt ?? serverNow;
    const endsAt = cast?.endsAt ?? harvest?.endsAt ?? serverNow + 1000;
    const duration = Math.max(1, endsAt - startedAt);
    const elapsed = Math.max(0, serverNow - startedAt);
    const progress = Math.min(1, elapsed / duration);
    castBarFill.style.width = `${(progress * 100).toFixed(1)}%`;
    if (cast) {
      castBarName.textContent = formatAbilityNameFromId(cast.id);
      return;
    }

    const resourceType = harvest?.resourceType ?? 'crystal';
    if (resourceType === 'tree') {
      castBarName.textContent = 'Chopping Tree';
      return;
    }
    const itemName = getResourceConfig(resourceType).itemName ?? 'Resource';
    castBarName.textContent = `Harvesting ${itemName}`;
  }

  function formatDeathTimer(/** @type {any} */ remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function toggleSkills() {
    if (menuOpen || isDialogOpen() || isTradeOpen()) return;
    if (characterOpen && characterTab === 'skills') {
      setCharacterOpen(false);
    } else {
      setCharacterOpen(true);
      setCharacterTab('skills');
    }
  }

  function setMenuOpen(/** @type {any} */ open) {
    menuOpen = !!open;
    document.body.classList.toggle('menu-open', menuOpen);
    if (menuOpen) {
      setVendorLayoutOpen(false);
      setInventoryOpen(false);
      setCharacterOpen(false);
      clearPrompt();
      onUiOpen?.();
    }
  }

  function isMenuOpen() {
    return menuOpen;
  }

  function setPauseMenuOpen(/** @type {any} */ open) {
    pauseMenuOpen = !!open;
    document.body.classList.toggle('pause-menu-open', pauseMenuOpen);
  }

  function isPauseMenuOpen() {
    return pauseMenuOpen;
  }

  function renderVendorPrices() {
    if (!vendorPricesEl) return;
    vendorPricesEl.innerHTML = '';
    const entries = Object.entries(VENDOR_SELL_PRICES ?? {});
    if (entries.length === 0) {
      vendorPricesEl.textContent = 'No items can be sold right now.';
      return;
    }
    for (const [kind, price] of entries) {
      const row = document.createElement('div');
      row.className = 'vendor-price-row';
      const name = createItemLabelNode(kind, formatItemName(kind), 'vendor-price-name');
      const value = document.createElement('div');
      value.className = 'vendor-price-value';
      value.textContent = formatCurrency(price);
      row.appendChild(name);
      row.appendChild(value);
      vendorPricesEl.appendChild(row);
    }
  }

  function renderVendorBuyItems() {
    if (!vendorBuyItemsEl) return;
    vendorBuyItemsEl.innerHTML = '';
    const vendor = vendorUI?.getVendor?.();
    const catalog = vendor?.buyItems ?? VENDOR_BUY_ITEMS ?? [];
    if (catalog.length === 0) {
      vendorBuyItemsEl.textContent = 'No items available.';
      return;
    }
    for (const entry of catalog) {
      const row = document.createElement('div');
      row.className = 'vendor-buy-row';
      const left = document.createElement('div');
      left.className = 'vendor-buy-info';
      const name = createItemLabelNode(entry.kind, entry.name, 'vendor-buy-name');
      const price = document.createElement('div');
      price.className = 'vendor-buy-price';
      price.textContent = formatCurrency(entry.priceCopper);
      left.appendChild(name);
      left.appendChild(price);
      const btn = document.createElement('button');
      btn.className = 'vendor-buy-btn';
      btn.type = 'button';
      btn.textContent = 'Buy';
      btn.dataset.kind = entry.kind;
      btn.addEventListener('click', () => {
        const vendor = vendorUI?.getVendor?.();
        if (vendor?.id) {
          onVendorBuy?.(entry.kind, 1, vendor.id);
          showToast?.(`Purchased ${entry.name}`);
        }
      });
      row.appendChild(left);
      row.appendChild(btn);
      vendorBuyItemsEl.appendChild(row);
    }
  }

  function renderVendorContracts() {
    if (!vendorContractsEl) return;
    vendorContractsEl.innerHTML = '';
    const vendor = vendorUI?.getVendor?.();
    const vendorId = vendor?.id;
    const activeContracts = Array.isArray(lastStats.activeContracts)
      ? lastStats.activeContracts.filter((contract) => contract.vendorId === vendorId)
      : [];
    const offersByVendor = lastStats.contractOffersByVendor ?? {};
    const offers = Array.isArray(offersByVendor?.[vendorId]) ? offersByVendor[vendorId] : [];

    if (offers.length === 0 && activeContracts.length === 0) {
      vendorContractsEl.textContent = 'No contracts available right now.';
      return;
    }

    const renderContractRow = (/** @type {any} */ contract, /** @type {boolean} */ isOffer) => {
      const row = document.createElement('div');
      row.className = 'vendor-contract-row';
      const info = document.createElement('div');
      info.className = 'vendor-contract-info';
      const title = document.createElement('div');
      title.className = 'vendor-contract-title';
      title.textContent = contract.bonusType === 'daily_commission'
        ? `${contract.title ?? contract.id ?? 'Contract'} · Daily`
        : (contract.title ?? contract.id ?? 'Contract');
      const meta = document.createElement('div');
      meta.className = 'vendor-contract-meta';
      if (isOffer) {
        const rewardText = `Reward ${formatCurrency(contract.rewardCopper ?? 0)} · ${contract.rewardXp ?? 0} XP`;
        if (contract.bonusType === 'daily_commission' && Number.isFinite(contract.resetAt)) {
          const hoursLeft = Math.max(1, Math.ceil((contract.resetAt - Date.now()) / 3_600_000));
          meta.textContent = `Daily commission · resets in ${hoursLeft}h · ${rewardText}`;
        } else {
          meta.textContent = rewardText;
        }
      } else if (contract.completed) {
        meta.textContent = 'Ready to turn in';
      } else {
        meta.textContent = `${Math.min(contract.progress ?? 0, contract.requiredCount ?? 1)}/${contract.requiredCount ?? 1}`;
      }
      info.appendChild(title);
      info.appendChild(meta);
      row.appendChild(info);

      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'vendor-buy-btn';
      if (isOffer) {
        actionBtn.textContent = 'Accept';
        actionBtn.addEventListener('click', () => {
          if (vendorId) onContractAccept?.(vendorId, contract.id);
        });
      } else if (contract.completed) {
        actionBtn.textContent = 'Turn In';
        actionBtn.addEventListener('click', () => {
          if (vendorId) onContractTurnIn?.(vendorId, contract.contractId ?? contract.templateId);
        });
      } else {
        actionBtn.textContent = 'Abandon';
        actionBtn.addEventListener('click', () => {
          onContractAbandon?.(contract.contractId ?? contract.templateId);
        });
      }
      row.appendChild(actionBtn);
      vendorContractsEl.appendChild(row);
    };

    for (const contract of activeContracts) {
      renderContractRow(contract, false);
    }
    for (const offer of offers) {
      renderContractRow(offer, true);
    }
  }

  if (inventoryPanel && inventoryGrid) {
    inventoryUI = createInventoryUI({
      panel: inventoryPanel,
      grid: inventoryGrid,
      cols: 5,
      onSwap: (/** @type {any} */ from, /** @type {any} */ to) => {
        onInventorySwap?.(from, to);
      },
      onDropExternal: (/** @type {any} */ { slot, item, target }) => {
        const equipSlot = target?.closest?.('.equipment-slot');
        if (equipSlot?.dataset?.slot) {
          onEquipmentSwap?.({
            fromType: 'inventory',
            fromSlot: slot,
            toType: 'equipment',
            toSlot: equipSlot.dataset.slot,
          });
          return true;
        }
        if (!vendorUI?.isTradeOpen?.() && !playerTradeUI?.isOpen?.()) return false;
        const tradeOffer = target?.closest?.('#trade-my-offer');
        if (tradeOffer && playerTradeUI?.isOpen?.()) {
          onTradeOfferAddSlot?.(slot);
          return true;
        }
        if (!vendorUI || !vendorUI.isTradeOpen()) return false;
        const dropzone = target?.closest?.('.vendor-dropzone');
        if (!dropzone) return false;
        const vendor = vendorUI.getVendor();
        if (!vendor?.id) return false;
        onVendorSell?.(slot, vendor.id);
        const itemName = item?.name ?? item?.kind ?? 'Item';
        showToast?.(`Sold ${itemName}`);
        return true;
      },
    });
  }

  if (equipmentGrid) {
    equipmentUI = createEquipmentUI({
      grid: equipmentGrid,
      onSwap: (/** @type {any} */ { fromType, fromSlot, toType, toSlot }) => {
        onEquipmentSwap?.({ fromType, fromSlot, toType, toSlot });
      },
    });
  }

  if (craftRecipeListEl) {
    craftingUI = createCraftingUI({
      recipeListEl: craftRecipeListEl,
      onCraft: (/** @type {any} */ recipeId, /** @type {any} */ count) => {
        onCraft?.(recipeId, count);
        const recipe = getRecipeById(recipeId);
        const name = recipe?.name ?? recipe?.output?.kind ?? 'Item';
        showToast?.(count > 1 ? `Crafted ${name} × ${count}` : `Crafted ${name}`);
      },
    });
  }

  if (journalRootEl) {
    journalUI = createJournalUI({
      journalRootEl,
      onContractAbandon,
      onContractTurnIn,
      onRepairItem,
      onSalvageItem,
    });
  }

  const tradePanel = document.getElementById('trade-panel');
  const tradePartnerNameEl = document.getElementById('trade-partner-name');
  const tradeMyOfferEl = document.getElementById('trade-my-offer');
  const tradeTheirOfferEl = document.getElementById('trade-their-offer');
  const tradeMyCopperEl = document.getElementById('trade-my-copper');
  const tradeTheirCopperEl = document.getElementById('trade-their-copper');
  const tradeAddCopperInput = document.getElementById('trade-add-copper');
  const tradeAddCopperBtn = document.getElementById('trade-add-copper-btn');
  const tradeRemoveCopperBtn = document.getElementById('trade-remove-copper-btn');
  const tradeConfirmBtn = document.getElementById('trade-confirm-btn');
  const tradeCancelBtn = document.getElementById('trade-cancel-btn');
  const tradeStatusEl = document.getElementById('trade-status');

  if (tradePanel) {
    playerTradeUI = createPlayerTradeUI({
      panel: tradePanel,
      partnerNameEl: tradePartnerNameEl,
      myOfferEl: tradeMyOfferEl,
      theirOfferEl: tradeTheirOfferEl,
      myCopperEl: tradeMyCopperEl,
      theirCopperEl: tradeTheirCopperEl,
      addCopperInput: tradeAddCopperInput,
      addCopperBtn: tradeAddCopperBtn,
      removeCopperBtn: tradeRemoveCopperBtn,
      confirmBtn: tradeConfirmBtn,
      cancelBtn: tradeCancelBtn,
      statusEl: tradeStatusEl,
      onAddItem: onTradeOfferAddSlot,
      onRemoveItem: onTradeOfferRemoveItem,
      onAddCopper: onTradeOfferAddCopper,
      onRemoveCopper: onTradeOfferRemoveCopper,
      onConfirm: onTradeConfirm,
      onCancel: onTradeCancel,
    });
  }

  const inventoryHeader = /** @type {HTMLElement | null} */ (
    inventoryPanel?.querySelector?.('.inventory-header') ?? null
  );
  const characterHeader = /** @type {HTMLElement | null} */ (
    characterSheetPanel?.querySelector?.('.character-sheet-header') ?? null
  );
  const vendorHeader = /** @type {HTMLElement | null} */ (
    vendorPanel?.querySelector?.('.vendor-header') ?? null
  );
  const tradeHeader = /** @type {HTMLElement | null} */ (
    tradePanel?.querySelector?.('.trade-header') ?? null
  );
  const /** @type {Array<any>} */ draggablePanels = [];
  if (inventoryPanel instanceof HTMLElement && inventoryHeader instanceof HTMLElement) {
    draggablePanels.push({
      key: 'inventory-panel',
      panelEl: inventoryPanel,
      handleEl: inventoryHeader,
      isOpen: () => inventoryPanel.classList.contains('open'),
    });
  }
  if (characterSheetPanel instanceof HTMLElement && characterHeader instanceof HTMLElement) {
    draggablePanels.push({
      key: 'character-sheet-panel',
      panelEl: characterSheetPanel,
      handleEl: characterHeader,
      isOpen: () => characterSheetPanel.classList.contains('open'),
    });
  }
  if (vendorPanel instanceof HTMLElement && vendorHeader instanceof HTMLElement) {
    draggablePanels.push({
      key: 'vendor-panel',
      panelEl: vendorPanel,
      handleEl: vendorHeader,
      isOpen: () => vendorPanel.classList.contains('open'),
    });
  }
  if (tradePanel instanceof HTMLElement && tradeHeader instanceof HTMLElement) {
    draggablePanels.push({
      key: 'trade-panel',
      panelEl: tradePanel,
      handleEl: tradeHeader,
      isOpen: () => !tradePanel.classList.contains('hidden'),
    });
  }
  if (draggablePanels.length > 0) {
    windowDragController = createWindowDragController({
      panels: draggablePanels,
      viewportMargin: 12,
    });
  }

  if (vendorDialog && vendorPanel) {
    vendorUI = createVendorUI({
      dialog: vendorDialog,
      panel: vendorPanel,
      dialogName: vendorDialogName,
      panelName: vendorPanelName,
      tradeButton: vendorTradeBtn,
      closeButton: vendorCloseBtn,
      panelCloseButton: vendorPanelCloseBtn,
      onTradeOpen: () => {
        renderVendorBuyItems();
        renderVendorContracts();
        openVendorTradeLayout();
      },
      onTradeClose: () => {
        closeVendorTradeLayout();
      },
    });
  }

  function isInventoryOpen() {
    return inventoryOpen;
  }

  function isDialogOpen() {
    return vendorUI?.isDialogOpen?.() ?? false;
  }

  function isTradeOpen() {
    return (vendorUI?.isTradeOpen?.() ?? false) || (playerTradeUI?.isOpen?.() ?? false);
  }

  function isSkillsOpen() {
    return characterOpen;
  }

  function isUiBlocking() {
    return (
      menuOpen ||
      pauseMenuOpen ||
      inventoryOpen ||
      characterOpen ||
      isDialogOpen() ||
      isTradeOpen() ||
      deadOpen ||
      (typeof isChatFocused === 'function' && isChatFocused())
    );
  }

  function toggleInventory() {
    if (menuOpen || isTradeOpen() || isDialogOpen()) return;
    setInventoryOpen(!inventoryOpen);
  }

  function toggleCharacter() {
    if (menuOpen || isTradeOpen() || isDialogOpen()) return;
    if (characterOpen && characterTab === 'character') {
      setCharacterOpen(false);
    } else {
      setCharacterOpen(true);
      setCharacterTab('character');
    }
  }

  function updateLocalUi(/** @type {any} */ { me, worldConfig, serverNow }) {
    if (me) {
      const isDead = !!me.dead;
      if (isDead && !wasDead) {
        setInventoryOpen(false);
        setCharacterOpen(false);
        vendorUI?.closeAll?.();
        playerTradeUI?.close?.();
        clearPrompt();
        onUiOpen?.();
      }
      if (deathTimerEl) {
        if (isDead && me.respawnAt) {
          const remaining = Math.max(0, me.respawnAt - serverNow);
          deathTimerEl.textContent = formatDeathTimer(remaining);
        } else {
          deathTimerEl.textContent = '--';
        }
      }
      setDeathOpen(isDead);
      wasDead = isDead;

      updateHud(me, serverNow);
      updateObjectives(me);
      updateCastBar(me, serverNow);
      if (inventoryUI) {
        inventoryUI.setInventory(me.inventory ?? [], {
          slots: me.invSlots ?? worldConfig?.playerInvSlots ?? me.inventory?.length ?? 0,
          stackMax: me.invStackMax ?? worldConfig?.playerInvStackMax ?? 1,
        });
      }
      if (craftingUI) {
        craftingUI.setInventory(me.inventory ?? []);
        craftingUI.setRecipes(getRecipesForKnownIds(me.knownRecipes));
        craftingUI.setContext?.({
          playerPos: { x: me.x, y: me.y ?? 0, z: me.z },
          worldConfig,
        });
      }
      if (equipmentUI) {
        equipmentUI.setEquipment(me.equipment ?? {});
      }
      journalUI?.setState?.(me);
      lastStats.activeContracts = Array.isArray(me.activeContracts) ? me.activeContracts : [];
      lastStats.contractOffersByVendor = me.contractOffersByVendor ?? {};
      renderVendorContracts();
      if (inventoryCoinsEl) {
        inventoryCoinsEl.textContent = formatCurrency(me.currencyCopper ?? 0);
      }
      const klass = getClassById(getCurrentClassId(me));
      const resourceLabel = (me?.resourceType ?? 'stamina').replace(/^./, (/** @type {any} */ c) => c.toUpperCase());
      if (charStatHp) charStatHp.textContent = `${me.hp ?? 0} / ${me.maxHp ?? 0}`;
      if (charStatResource) charStatResource.textContent = `${me.resource ?? 0} / ${me.resourceMax ?? 0} (${resourceLabel})`;
      const raw = me.attributes ?? computeRawAttributes(me);
      const derived = me.derivedStats ?? computeDerivedStats(me);
      if (charStatStr) charStatStr.textContent = String(Math.round(raw.str ?? 0));
      if (charStatDex) charStatDex.textContent = String(Math.round(raw.dex ?? 0));
      if (charStatInt) charStatInt.textContent = String(Math.round(raw.int ?? 0));
      if (charStatVit) charStatVit.textContent = String(Math.round(raw.vit ?? 0));
      if (charStatSpi) charStatSpi.textContent = String(Math.round(raw.spi ?? 0));
      if (charStatPhysPower) charStatPhysPower.textContent = String(derived.physicalPower ?? 0);
      if (charStatRangedPower) charStatRangedPower.textContent = String(derived.rangedPower ?? 0);
      if (charStatMagicPower) charStatMagicPower.textContent = String(derived.magicPower ?? 0);
      if (charStatHealingPower) charStatHealingPower.textContent = String(derived.healingPower ?? 0);
      if (charStatCrit) charStatCrit.textContent = `${((derived.critChance ?? 0) * 100).toFixed(1)}%`;
      if (charStatAccuracy) charStatAccuracy.textContent = String(derived.accuracy ?? 0);
      if (charStatEvasion) charStatEvasion.textContent = String(derived.evasion ?? 0);
      if (charStatPhysDef) charStatPhysDef.textContent = String(derived.physicalDefense ?? 0);
      if (charStatMagicResist) charStatMagicResist.textContent = String(derived.magicResistance ?? 0);
      if (charStatLevel) charStatLevel.textContent = String(me.level ?? 1);
      if (charStatClass) charStatClass.textContent = klass?.name ?? me?.classId ?? '--';
      if (charSheetCharMeta) charSheetCharMeta.textContent = `Level ${me.level ?? 1} ${klass?.name ?? me?.classId ?? '--'}`;
      characterPreview?.setPlayer?.(me);
      if (lastStats.hp !== null && me.hp < lastStats.hp) {
        flashDamage();
      }

      const totalXp = totalXpForLevel(me.level ?? 1, me.xp ?? 0);
      let /** @type {any} */ eventMessage = null;
      if (lastStats.level !== null && me.level > lastStats.level) {
        eventMessage = `Level Up! (${me.level})`;
      } else if (lastStats.totalXp !== null && totalXp > lastStats.totalXp) {
        eventMessage = `XP +${totalXp - lastStats.totalXp}`;
      }

      if (!eventMessage && lastStats.inv !== null && me.inv > lastStats.inv) {
        eventMessage = 'Harvested +1';
      }
      if (
        !eventMessage &&
        lastStats.currencyCopper !== null &&
        (me.currencyCopper ?? 0) > lastStats.currencyCopper
      ) {
        const diff = (me.currencyCopper ?? 0) - lastStats.currencyCopper;
        eventMessage = `Sold +${formatCurrency(diff)}`;
      }
      if (eventMessage) {
        showEvent(eventMessage);
      }

      lastStats.hp = me.hp;
      lastStats.inv = me.inv;
      lastStats.currencyCopper = me.currencyCopper ?? 0;
      lastStats.level = me.level ?? 1;
      lastStats.totalXp = totalXp;
    } else {
      setDeathOpen(false);
      wasDead = false;
      if (deathTimerEl) {
        deathTimerEl.textContent = '--';
      }
      updateHud(null, serverNow);
      updateObjectives(null);
      updateCastBar(null, serverNow);
      if (inventoryUI) {
        inventoryUI.setInventory([], {
          slots: worldConfig?.playerInvSlots ?? 0,
          stackMax: worldConfig?.playerInvStackMax ?? 1,
        });
      }
      if (craftingUI) {
        craftingUI.setInventory([]);
        craftingUI.setRecipes(getRecipesForKnownIds(null));
        craftingUI.setContext?.({ playerPos: null, worldConfig });
      }
      if (equipmentUI) {
        equipmentUI.setEquipment({});
      }
      journalUI?.setState?.(null);
      lastStats.activeContracts = [];
      lastStats.contractOffersByVendor = {};
      renderVendorContracts();
      if (inventoryCoinsEl) {
        inventoryCoinsEl.textContent = '--';
      }
      if (charStatHp) charStatHp.textContent = '--';
      if (charStatResource) charStatResource.textContent = '--';
      if (charStatStr) charStatStr.textContent = '--';
      if (charStatDex) charStatDex.textContent = '--';
      if (charStatInt) charStatInt.textContent = '--';
      if (charStatVit) charStatVit.textContent = '--';
      if (charStatSpi) charStatSpi.textContent = '--';
      if (charStatPhysPower) charStatPhysPower.textContent = '--';
      if (charStatRangedPower) charStatRangedPower.textContent = '--';
      if (charStatMagicPower) charStatMagicPower.textContent = '--';
      if (charStatHealingPower) charStatHealingPower.textContent = '--';
      if (charStatCrit) charStatCrit.textContent = '--';
      if (charStatAccuracy) charStatAccuracy.textContent = '--';
      if (charStatEvasion) charStatEvasion.textContent = '--';
      if (charStatPhysDef) charStatPhysDef.textContent = '--';
      if (charStatMagicResist) charStatMagicResist.textContent = '--';
      if (charStatLevel) charStatLevel.textContent = '--';
      if (charStatClass) charStatClass.textContent = '--';
      if (charSheetCharMeta) charSheetCharMeta.textContent = 'Level 1 --';
      characterPreview?.setPlayer?.(null);
      lastStats.hp = null;
      lastStats.inv = null;
      lastStats.currencyCopper = null;
      lastStats.level = null;
      lastStats.totalXp = null;
    }
  }

  abilityBarModule.buildAbilityBar();
  renderVendorPrices();
  renderVendorBuyItems();
  setMenuOpen(true);
  setCharacterTab('character');
  setInventoryTab('inventory');
  characterPreview?.setOpen?.(false);

  for (const btn of inventoryTabBtns ?? []) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab && ['inventory', 'craft', 'journal'].includes(tab)) {
        setInventoryTab(tab);
      }
    });
  }

  characterSheetClose?.addEventListener('click', () => {
    setCharacterOpen(false);
  });
  for (const btn of sheetTabBtns ?? []) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab && ['character', 'skills'].includes(tab)) {
        setCharacterTab(tab);
      }
    });
  }

  deathRespawnBtn?.addEventListener('click', () => {
    onRespawn?.();
  });

  const /** @type {any} */ ABILITY_FAIL_MESSAGES = {
    no_target: 'No target selected',
    out_of_range: 'Out of range',
    no_placement: 'Click on the ground to place',
    resource: 'Not enough resource',
    cooldown: 'Ability on cooldown',
    gcd: 'Global cooldown',
    casting: 'Cannot use while casting',
    unknown_ability: 'Unknown ability',
    no_direction: 'Face an enemy to use',
  };

  function showAbilityError(/** @type {any} */ reason, /** @type {any} */ slot) {
    const text = ABILITY_FAIL_MESSAGES[reason] ?? 'Ability failed';
    showToast(text, 'warning');
  }

  return {
    setStatus,
    showPrompt,
    clearPrompt,
    showAbilityError,
    renderVendorPrices,
    updateLocalUi,
    updateTargetHud,
    updateAbilityBar: (/** @type {any} */ me, /** @type {any} */ serverNow, /** @type {any} */ globalCooldownMs, /** @type {any} */ target = null) =>
      abilityBarModule.updateAbilityBar(me, serverNow, buildAbilityPanelState(me), globalCooldownMs, target),
    updateSkillsPanel: (/** @type {any} */ me) => updateSkillsPanel(me),
    setInventoryOpen,
    toggleInventory,
    toggleCharacter,
    setSkillsOpen: (/** @type {any} */ open) => { if (open) { setCharacterOpen(true); setCharacterTab('skills'); } else setCharacterOpen(false); },
    toggleSkills,
    setMenuOpen,
    setPauseMenuOpen,
    isMenuOpen,
    isPauseMenuOpen,
    isInventoryOpen,
    isDialogOpen,
    isTradeOpen,
    isSkillsOpen,
    isUiBlocking,
    getCurrentClassId,
    getAbilityForSlot,
    getSlottedAbilities: (/** @type {any} */ me) => buildAbilityPanelState(me).slottedAbilities,
    getAbilityActionPayload,
    setLocalCooldown: abilityBarModule.setLocalCooldown,
    getLocalCooldown: abilityBarModule.getLocalCooldown,
    vendorUI,
    playerTradeUI,
    showToast,
    dispose: () => {
      windowDragController?.dispose?.();
      characterPreview?.dispose?.();
    },
  };
}
