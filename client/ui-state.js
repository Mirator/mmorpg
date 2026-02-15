import {
  formatCurrency,
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
  updateTargetHud,
  showPrompt,
  clearPrompt,
  showEvent,
  flashDamage,
} from './ui.js';
import { createInventoryUI } from './inventory.js';
import { createEquipmentUI } from './equipment.js';
import { createVendorUI } from './vendor.js';
import { createCraftingUI } from './crafting.js';

function formatItemName(kind) {
  if (!kind) return 'Item';
  return kind
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTargetType(type) {
  if (!type) return 'None';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function createUiState({
  onInventorySwap,
  onEquipmentSwap,
  onVendorSell,
  onVendorBuy,
  onCraft,
  onAbilityClick,
  onUiOpen,
  onRespawn,
  isChatFocused,
}) {
  const inventoryPanel = document.getElementById('inventory-panel');
  const characterSheetPanel = document.getElementById('character-sheet-panel');
  const characterSheetClose = document.getElementById('character-sheet-close');
  const characterView = document.getElementById('character-view');
  const skillsView = document.getElementById('skills-view');
  const sheetTabBtns = document.querySelectorAll('#sheet-bottom-tabs .sheet-tab-btn');
  const skillsClassEl = document.getElementById('skills-class');
  const skillsLevelEl = document.getElementById('skills-level');
  const skillsXpEl = document.getElementById('skills-xp');
  const skillsListEl = document.getElementById('skills-list');
  const inventoryGrid = document.getElementById('inventory-grid');
  const inventoryView = document.getElementById('inventory-view');
  const craftView = document.getElementById('craft-view');
  const craftRecipeListEl = document.getElementById('craft-recipe-list');
  const inventoryTabBtns = document.querySelectorAll('.inventory-tab');
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
  const inventoryCoinsEl = document.getElementById('inventory-coins');
  const abilityBar = document.getElementById('ability-bar');
  const deathScreen = document.getElementById('death-screen');
  const deathTimerEl = document.getElementById('death-timer');
  const deathRespawnBtn = document.getElementById('death-respawn-btn');
  const castBarWrap = document.getElementById('cast-bar-wrap');
  const castBarFill = document.getElementById('cast-bar-fill');
  const castBarName = document.getElementById('cast-bar-name');

  let inventoryUI = null;
  let equipmentUI = null;
  let vendorUI = null;
  let craftingUI = null;

  let inventoryOpen = false;
  let inventoryTab = 'inventory';
  let characterOpen = false;
  let characterTab = 'character';
  let menuOpen = true;
  let pauseMenuOpen = false;
  let deadOpen = false;
  const abilitySlots = [];
  const localCooldowns = new Map();
  let skillsRenderKey = '';
  let wasDead = false;

  const lastStats = {
    hp: null,
    inv: null,
    currencyCopper: null,
    level: null,
    totalXp: null,
  };

  function getCurrentClassId(me) {
    return me?.classId ?? DEFAULT_CLASS_ID;
  }

  function setInventoryOpen(next) {
    inventoryOpen = !!next;
    inventoryPanel?.classList.toggle('open', inventoryOpen);
    document.body.classList.toggle('inventory-open', inventoryOpen);
    inventoryUI?.setOpen?.(inventoryOpen);
    if (inventoryOpen) {
      clearPrompt();
      onUiOpen?.();
    }
  }

  function setCharacterOpen(next) {
    characterOpen = !!next;
    characterSheetPanel?.classList.toggle('open', characterOpen);
    document.body.classList.toggle('character-open', characterOpen);
    if (characterOpen) {
      clearPrompt();
      onUiOpen?.();
    }
  }

  function setCharacterTab(tab) {
    if (!['character', 'skills'].includes(tab)) return;
    characterTab = tab;
    characterView?.classList.toggle('active', tab === 'character');
    skillsView?.classList.toggle('active', tab === 'skills');
    for (const btn of sheetTabBtns ?? []) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
  }

  function setInventoryTab(tab) {
    if (!['inventory', 'craft'].includes(tab)) return;
    inventoryTab = tab;
    inventoryView?.classList.toggle('active', tab === 'inventory');
    craftView?.classList.toggle('active', tab === 'craft');
    for (const btn of inventoryTabBtns ?? []) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
    if (tab === 'craft') {
      craftingUI?.render?.();
    }
  }

  function setDeathOpen(open) {
    deadOpen = !!open;
    deathScreen?.classList.toggle('open', deadOpen);
  }

  function formatAbilityNameFromId(id) {
    if (!id || typeof id !== 'string') return '--';
    return id
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  function updateCastBar(me, serverNow) {
    if (!castBarWrap || !castBarFill || !castBarName) return;
    const cast = me?.cast;
    if (!cast) {
      castBarWrap.classList.add('hidden');
      return;
    }
    castBarWrap.classList.remove('hidden');
    const startedAt = cast.startedAt ?? serverNow;
    const endsAt = cast.endsAt ?? serverNow + 1000;
    const duration = Math.max(1, endsAt - startedAt);
    const elapsed = Math.max(0, serverNow - startedAt);
    const progress = Math.min(1, elapsed / duration);
    castBarFill.style.width = `${(progress * 100).toFixed(1)}%`;
    castBarName.textContent = formatAbilityNameFromId(cast.id);
  }

  function formatDeathTimer(remainingMs) {
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

  function setMenuOpen(open) {
    menuOpen = !!open;
    document.body.classList.toggle('menu-open', menuOpen);
    if (menuOpen) {
      setInventoryOpen(false);
      setCharacterOpen(false);
      clearPrompt();
      onUiOpen?.();
    }
  }

  function isMenuOpen() {
    return menuOpen;
  }

  function setPauseMenuOpen(open) {
    pauseMenuOpen = !!open;
    document.body.classList.toggle('pause-menu-open', pauseMenuOpen);
  }

  function isPauseMenuOpen() {
    return pauseMenuOpen;
  }

  function buildAbilityTooltip(ability) {
    const parts = [];
    if (ability.baseValue != null && ability.coefficient != null) {
      parts.push(`Damage: ${ability.baseValue} + Power × ${ability.coefficient}`);
    }
    if (ability.resourceCost) {
      const res = (ability.resourceCost ?? 0);
      parts.push(`Cost: ${res}`);
    }
    if (ability.cooldownMs) {
      parts.push(`CD: ${(ability.cooldownMs / 1000).toFixed(1)}s`);
    }
    if (ability.range) {
      parts.push(`Range: ${ability.range}m`);
    }
    if (ability.requirePlacement) {
      parts.push('Requires placement');
    }
    if (ability.radius) {
      parts.push(`Radius: ${ability.radius}m`);
    }
    return parts.join(' · ') || ability.name;
  }

  function buildAbilityBar() {
    if (!abilityBar) return;
    abilityBar.innerHTML = '';
    abilitySlots.length = 0;
    for (let slot = 1; slot <= ABILITY_SLOTS; slot += 1) {
      const el = document.createElement('div');
      el.className = 'ability-slot empty';
      el.dataset.slot = String(slot);
      el.style.setProperty('--cooldown', '0');
      const key = document.createElement('div');
      key.className = 'ability-key';
      key.textContent = slot === 10 ? '0' : String(slot);
      const name = document.createElement('div');
      name.className = 'ability-name';
      name.textContent = '';
      const cooldownNum = document.createElement('div');
      cooldownNum.className = 'ability-cooldown-num';
      cooldownNum.textContent = '';
      const tooltip = document.createElement('div');
      tooltip.className = 'ability-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      el.appendChild(key);
      el.appendChild(name);
      el.appendChild(cooldownNum);
      el.appendChild(tooltip);
      el.addEventListener('click', () => {
        onAbilityClick?.(slot);
      });
      abilityBar.appendChild(el);
      abilitySlots.push(el);
    }
  }

  function updateAbilityBar(me, serverNow, globalCooldownMs = 900) {
    if (!abilityBar || abilitySlots.length === 0) return;
    const classId = getCurrentClassId(me);
    const weaponDef = getEquippedWeapon(me?.equipment, classId);
    const abilities = getAbilitiesForClass(classId, me?.level ?? 1, weaponDef);
    const abilityBySlot = new Map(abilities.map((ability) => [ability.slot, ability]));
    const gcdEnd = me?.globalCooldownUntil ?? 0;
    const gcdRemaining = Math.max(0, gcdEnd - serverNow);

    for (let slot = 1; slot <= ABILITY_SLOTS; slot += 1) {
      const ability = abilityBySlot.get(slot);
      const slotEl = abilitySlots[slot - 1];
      if (!slotEl) continue;
      const nameEl = slotEl.querySelector('.ability-name');
      if (ability) {
        slotEl.classList.remove('empty');
        if (nameEl) nameEl.textContent = ability.name;
      } else {
        slotEl.classList.add('empty');
        if (nameEl) nameEl.textContent = '';
        slotEl.style.setProperty('--cooldown', '0');
        const tooltipEl = slotEl.querySelector('.ability-tooltip');
        const cooldownNumEl = slotEl.querySelector('.ability-cooldown-num');
        if (tooltipEl) tooltipEl.textContent = '';
        if (cooldownNumEl) cooldownNumEl.textContent = '';
        continue;
      }

      const localCooldown = localCooldowns.get(slot) ?? 0;
      const serverCooldown =
        ability.id === 'basic_attack'
          ? me?.attackCooldownUntil ?? 0
          : me?.abilityCooldowns?.[ability.id] ?? 0;
      const cooldownEnd = Math.max(localCooldown, serverCooldown);
      let remaining = Math.max(0, cooldownEnd - serverNow);
      if (!ability.exemptFromGCD && gcdRemaining > 0) {
        remaining = Math.max(remaining, gcdRemaining);
      }
      const durationMs = ability.exemptFromGCD
        ? ability.cooldownMs ?? 0
        : Math.max(ability.cooldownMs ?? 0, globalCooldownMs);
      const fraction = durationMs
        ? Math.min(1, remaining / durationMs)
        : 0;
      slotEl.style.setProperty('--cooldown', fraction.toFixed(3));
      const tooltipEl = slotEl.querySelector('.ability-tooltip');
      const cooldownNumEl = slotEl.querySelector('.ability-cooldown-num');
      if (tooltipEl) {
        tooltipEl.textContent = buildAbilityTooltip(ability);
      }
      if (cooldownNumEl) {
        cooldownNumEl.textContent =
          remaining > 0 && remaining < 60000
            ? `${(remaining / 1000).toFixed(1)}s`
            : '';
      }
    }
  }

  function updateSkillsPanel(me) {
    if (!skillsListEl) return;
    const classId = getCurrentClassId(me);
    const klass = getClassById(classId);
    const weaponDef = getEquippedWeapon(me?.equipment, classId);
    if (skillsClassEl) {
      skillsClassEl.textContent = klass?.name ?? classId ?? '--';
    }
    if (skillsLevelEl) {
      skillsLevelEl.textContent = `${me?.level ?? 1}`;
    }
    if (skillsXpEl) {
      const needed = me?.xpToNext ?? xpToNext(me?.level ?? 1);
      skillsXpEl.textContent = needed ? `${me?.xp ?? 0}/${needed}` : 'MAX';
    }

    const renderKey = `${classId}:${me?.level ?? 1}:${weaponDef?.kind ?? 'none'}`;
    if (renderKey === skillsRenderKey) return;
    skillsRenderKey = renderKey;
    if (!skillsListEl) return;
    skillsListEl.innerHTML = '';
    const abilities = getAbilitiesForClass(classId, me?.level ?? 1, weaponDef);
    for (const ability of abilities) {
      const row = document.createElement('div');
      row.className = 'skill-row';
      const name = document.createElement('div');
      name.className = 'skill-name';
      name.textContent = ability.name;
      const meta = document.createElement('div');
      meta.className = 'skill-meta';
      const typeLabel = formatTargetType(ability.targetType);
      meta.textContent = `Slot ${ability.slot} · CD ${Math.round(
        (ability.cooldownMs ?? 0) / 1000
      )}s · ${typeLabel}`;
      row.appendChild(name);
      row.appendChild(meta);
      skillsListEl.appendChild(row);
    }
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
      const name = document.createElement('div');
      name.className = 'vendor-price-name';
      name.textContent = formatItemName(kind);
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
    const catalog = VENDOR_BUY_ITEMS ?? [];
    if (catalog.length === 0) {
      vendorBuyItemsEl.textContent = 'No items available.';
      return;
    }
    for (const entry of catalog) {
      const row = document.createElement('div');
      row.className = 'vendor-buy-row';
      const left = document.createElement('div');
      left.className = 'vendor-buy-info';
      const name = document.createElement('div');
      name.className = 'vendor-buy-name';
      name.textContent = entry.name;
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
        if (vendor?.id) onVendorBuy?.(entry.kind, 1, vendor.id);
      });
      row.appendChild(left);
      row.appendChild(btn);
      vendorBuyItemsEl.appendChild(row);
    }
  }

  if (inventoryPanel && inventoryGrid) {
    inventoryUI = createInventoryUI({
      panel: inventoryPanel,
      grid: inventoryGrid,
      cols: 5,
      onSwap: (from, to) => {
        onInventorySwap?.(from, to);
      },
      onDropExternal: ({ slot, target }) => {
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
        if (!vendorUI || !vendorUI.isTradeOpen()) return false;
        const dropzone = target?.closest?.('.vendor-dropzone');
        if (!dropzone) return false;
        const vendor = vendorUI.getVendor();
        if (!vendor?.id) return false;
        onVendorSell?.(slot, vendor.id);
        return true;
      },
    });
  }

  if (equipmentGrid) {
    equipmentUI = createEquipmentUI({
      grid: equipmentGrid,
      onSwap: ({ fromType, fromSlot, toType, toSlot }) => {
        onEquipmentSwap?.({ fromType, fromSlot, toType, toSlot });
      },
    });
  }

  if (craftRecipeListEl) {
    craftingUI = createCraftingUI({
      recipeListEl: craftRecipeListEl,
      onCraft: (recipeId, count) => onCraft?.(recipeId, count),
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
    });
    vendorTradeBtn?.addEventListener('click', () => {
      setInventoryOpen(true);
    });
    const closeTrade = () => {
      setInventoryOpen(false);
      setCharacterOpen(false);
    };
    vendorCloseBtn?.addEventListener('click', closeTrade);
    vendorPanelCloseBtn?.addEventListener('click', closeTrade);
  }

  function isInventoryOpen() {
    return inventoryOpen;
  }

  function isDialogOpen() {
    return vendorUI?.isDialogOpen?.() ?? false;
  }

  function isTradeOpen() {
    return vendorUI?.isTradeOpen?.() ?? false;
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

  function updateLocalUi({ me, worldConfig, serverNow }) {
    if (me) {
      const isDead = !!me.dead;
      if (isDead && !wasDead) {
        setInventoryOpen(false);
        setCharacterOpen(false);
        vendorUI?.closeAll?.();
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
      updateCastBar(me, serverNow);
      if (inventoryUI) {
        inventoryUI.setInventory(me.inventory ?? [], {
          slots: me.invSlots ?? worldConfig?.playerInvSlots ?? me.inventory?.length ?? 0,
          stackMax: me.invStackMax ?? worldConfig?.playerInvStackMax ?? 1,
        });
      }
      if (craftingUI) {
        craftingUI.setInventory(me.inventory ?? []);
      }
      if (equipmentUI) {
        equipmentUI.setEquipment(me.equipment ?? {});
      }
      if (inventoryCoinsEl) {
        inventoryCoinsEl.textContent = formatCurrency(me.currencyCopper ?? 0);
      }
      const klass = getClassById(getCurrentClassId(me));
      const resourceLabel = (me?.resourceType ?? 'stamina').replace(/^./, (c) => c.toUpperCase());
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
      if (lastStats.hp !== null && me.hp < lastStats.hp) {
        flashDamage();
      }

      const totalXp = totalXpForLevel(me.level ?? 1, me.xp ?? 0);
      let eventMessage = null;
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
      updateAbilityBar(me, serverNow);
      updateSkillsPanel(me);
    } else {
      setDeathOpen(false);
      wasDead = false;
      if (deathTimerEl) {
        deathTimerEl.textContent = '--';
      }
      updateHud(null, serverNow);
      updateCastBar(null, serverNow);
      if (inventoryUI) {
        inventoryUI.setInventory([], {
          slots: worldConfig?.playerInvSlots ?? 0,
          stackMax: worldConfig?.playerInvStackMax ?? 1,
        });
      }
      if (craftingUI) {
        craftingUI.setInventory([]);
      }
      if (equipmentUI) {
        equipmentUI.setEquipment({});
      }
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
      lastStats.hp = null;
      lastStats.inv = null;
      lastStats.currencyCopper = null;
      lastStats.level = null;
      lastStats.totalXp = null;
      updateAbilityBar(null, serverNow);
      updateSkillsPanel(null);
    }
  }

  buildAbilityBar();
  renderVendorPrices();
  renderVendorBuyItems();
  setMenuOpen(true);
  setCharacterTab('character');
  setInventoryTab('inventory');

  for (const btn of inventoryTabBtns ?? []) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab && ['inventory', 'craft'].includes(tab)) {
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

  const ABILITY_FAIL_MESSAGES = {
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

  function showAbilityError(reason, slot) {
    const text = ABILITY_FAIL_MESSAGES[reason] ?? 'Ability failed';
    showEvent(text);
  }

  return {
    setStatus,
    showPrompt,
    clearPrompt,
    showAbilityError,
    renderVendorPrices,
    updateLocalUi,
    updateTargetHud,
    updateAbilityBar,
    updateSkillsPanel,
    setInventoryOpen,
    toggleInventory,
    toggleCharacter,
    setSkillsOpen: (open) => { if (open) { setCharacterOpen(true); setCharacterTab('skills'); } else setCharacterOpen(false); },
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
    setLocalCooldown: (slot, until) => localCooldowns.set(slot, until),
    getLocalCooldown: (slot) => localCooldowns.get(slot) ?? 0,
    vendorUI,
  };
}
