import { formatCurrency, VENDOR_SELL_PRICES } from '/shared/economy.js';
import {
  ABILITY_SLOTS,
  DEFAULT_CLASS_ID,
  getAbilitiesForClass,
  getClassById,
} from '/shared/classes.js';
import { getEquippedWeapon } from '/shared/equipment.js';
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
  onAbilityClick,
  onUiOpen,
  onRespawn,
}) {
  const skillsPanel = document.getElementById('skills-panel');
  const skillsClassEl = document.getElementById('skills-class');
  const skillsLevelEl = document.getElementById('skills-level');
  const skillsXpEl = document.getElementById('skills-xp');
  const skillsListEl = document.getElementById('skills-list');
  const inventoryPanel = document.getElementById('inventory-panel');
  const inventoryGrid = document.getElementById('inventory-grid');
  const equipmentGrid = document.getElementById('equipment-grid');
  const vendorDialog = document.getElementById('vendor-dialog');
  const vendorPanel = document.getElementById('vendor-panel');
  const vendorDialogName = document.getElementById('vendor-dialog-name');
  const vendorPanelName = document.getElementById('vendor-panel-name');
  const vendorTradeBtn = document.getElementById('vendor-trade-btn');
  const vendorCloseBtn = document.getElementById('vendor-close-btn');
  const vendorPanelCloseBtn = document.getElementById('vendor-panel-close');
  const vendorPricesEl = document.getElementById('vendor-sell-prices');
  const inventoryCoinsEl = document.getElementById('inventory-coins');
  const abilityBar = document.getElementById('ability-bar');
  const deathScreen = document.getElementById('death-screen');
  const deathTimerEl = document.getElementById('death-timer');
  const deathRespawnBtn = document.getElementById('death-respawn-btn');

  let inventoryUI = null;
  let equipmentUI = null;
  let vendorUI = null;

  let skillsOpen = false;
  let menuOpen = true;
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

  function setSkillsOpen(open) {
    skillsOpen = !!open;
    skillsPanel?.classList.toggle('open', skillsOpen);
    if (skillsOpen) {
      clearPrompt();
      onUiOpen?.();
    }
  }

  function setDeathOpen(open) {
    deadOpen = !!open;
    deathScreen?.classList.toggle('open', deadOpen);
  }

  function formatDeathTimer(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function toggleSkills() {
    if (menuOpen || isInventoryOpen() || isDialogOpen() || isTradeOpen()) return;
    setSkillsOpen(!skillsOpen);
  }

  function setMenuOpen(open) {
    menuOpen = !!open;
    document.body.classList.toggle('menu-open', menuOpen);
    if (menuOpen) {
      setSkillsOpen(false);
      setInventoryOpen(false);
      clearPrompt();
      onUiOpen?.();
    }
  }

  function isMenuOpen() {
    return menuOpen;
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
      el.appendChild(key);
      el.appendChild(name);
      el.addEventListener('click', () => {
        onAbilityClick?.(slot);
      });
      abilityBar.appendChild(el);
      abilitySlots.push(el);
    }
  }

  function updateAbilityBar(me, serverNow) {
    if (!abilityBar || abilitySlots.length === 0) return;
    const classId = getCurrentClassId(me);
    const weaponDef = getEquippedWeapon(me?.equipment, classId);
    const abilities = getAbilitiesForClass(classId, me?.level ?? 1, weaponDef);
    const abilityBySlot = new Map(abilities.map((ability) => [ability.slot, ability]));

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
        continue;
      }

      const localCooldown = localCooldowns.get(slot) ?? 0;
      const serverCooldown =
        ability.id === 'basic_attack'
          ? me?.attackCooldownUntil ?? 0
          : me?.abilityCooldowns?.[ability.id] ?? 0;
      const cooldownEnd = Math.max(localCooldown, serverCooldown);
      const remaining = Math.max(0, cooldownEnd - serverNow);
      const fraction = ability.cooldownMs
        ? Math.min(1, remaining / ability.cooldownMs)
        : 0;
      slotEl.style.setProperty('--cooldown', fraction.toFixed(3));
    }
  }

  function updateSkillsPanel(me) {
    if (!skillsPanel || !skillsOpen) return;
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
    };
    vendorCloseBtn?.addEventListener('click', closeTrade);
    vendorPanelCloseBtn?.addEventListener('click', closeTrade);
  }

  function isInventoryOpen() {
    return inventoryUI?.isOpen?.() ?? false;
  }

  function isDialogOpen() {
    return vendorUI?.isDialogOpen?.() ?? false;
  }

  function isTradeOpen() {
    return vendorUI?.isTradeOpen?.() ?? false;
  }

  function isSkillsOpen() {
    return skillsOpen;
  }

  function isUiBlocking() {
    return (
      menuOpen ||
      isInventoryOpen() ||
      isDialogOpen() ||
      isTradeOpen() ||
      isSkillsOpen() ||
      deadOpen
    );
  }

  function setInventoryOpen(next) {
    if (!inventoryUI) return;
    const open = !!next;
    inventoryUI.setOpen(open);
    if (open) {
      clearPrompt();
      onUiOpen?.();
    }
  }

  function toggleInventory() {
    if (menuOpen || isTradeOpen() || isDialogOpen() || isSkillsOpen()) return;
    setInventoryOpen(!isInventoryOpen());
  }

  function updateLocalUi({ me, worldConfig, serverNow }) {
    if (me) {
      const isDead = !!me.dead;
      if (isDead && !wasDead) {
        setSkillsOpen(false);
        setInventoryOpen(false);
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
      if (inventoryUI) {
        inventoryUI.setInventory(me.inventory ?? [], {
          slots: me.invSlots ?? worldConfig?.playerInvSlots ?? me.inventory?.length ?? 0,
          stackMax: me.invStackMax ?? worldConfig?.playerInvStackMax ?? 1,
        });
      }
      if (equipmentUI) {
        equipmentUI.setEquipment(me.equipment ?? {});
      }
      if (inventoryCoinsEl) {
        inventoryCoinsEl.textContent = formatCurrency(me.currencyCopper ?? 0);
      }
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
      if (inventoryUI) {
        inventoryUI.setInventory([], {
          slots: worldConfig?.playerInvSlots ?? 0,
          stackMax: worldConfig?.playerInvStackMax ?? 1,
        });
      }
      if (equipmentUI) {
        equipmentUI.setEquipment({});
      }
      if (inventoryCoinsEl) {
        inventoryCoinsEl.textContent = '--';
      }
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
  setMenuOpen(true);

  deathRespawnBtn?.addEventListener('click', () => {
    onRespawn?.();
  });

  return {
    setStatus,
    showPrompt,
    clearPrompt,
    renderVendorPrices,
    updateLocalUi,
    updateTargetHud,
    updateAbilityBar,
    updateSkillsPanel,
    setInventoryOpen,
    toggleInventory,
    setSkillsOpen,
    toggleSkills,
    setMenuOpen,
    isInventoryOpen,
    isDialogOpen,
    isTradeOpen,
    isMenuOpen,
    isSkillsOpen,
    isUiBlocking,
    getCurrentClassId,
    setLocalCooldown: (slot, until) => localCooldowns.set(slot, until),
    getLocalCooldown: (slot) => localCooldowns.get(slot) ?? 0,
    vendorUI,
  };
}
