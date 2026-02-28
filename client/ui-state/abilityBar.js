// @ts-check
import { ABILITY_SLOTS } from '/shared/classes.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { getAbilitiesForClass } from '/shared/classes.js';
import { getKeybinds } from '../keybinds.js';
import { getAbilityIconFile } from '../gameIcons.js';
import { applyGlyphMask } from '../uiGlyphs.js';

function formatKey(/** @type {any} */ key) {
  if (!key) return '';
  if (key === 'Escape') return 'ESC';
  return key.length === 1 ? key.toUpperCase() : key;
}

export function buildAbilityTooltip(/** @type {any} */ ability) {
  const /** @type {any} */ parts = [];
  if (ability.baseValue != null && ability.coefficient != null) {
    parts.push(`Damage: ${ability.baseValue} + Power × ${ability.coefficient}`);
  }
  if (ability.resourceCost != null && ability.resourceCost > 0) {
    parts.push(`Cost: ${ability.resourceCost}`);
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
  if (ability.damageTakenMultiplier != null && ability.damageTakenMultiplier < 1) {
    parts.push(`Reduces damage taken by ${Math.round((1 - ability.damageTakenMultiplier) * 100)}%`);
  }
  return parts.join(' · ') || ability.name;
}

export function createAbilityBar(/** @type {any} */ abilityBarEl, /** @type {any} */ onAbilityClick) {
  const /** @type {any} */ abilitySlots = [];
  const localCooldowns = new Map();

  function setSlotText(/** @type {any} */ slotRef, /** @type {any} */ key, /** @type {any} */ el, /** @type {any} */ value) {
    if (!el) return;
    if (slotRef[key] === value) return;
    el.textContent = value;
    slotRef[key] = value;
  }

  function setSlotCooldownFraction(/** @type {any} */ slotRef, /** @type {any} */ fractionText) {
    if (slotRef.lastCooldownFraction === fractionText) return;
    slotRef.root.style.setProperty('--cooldown', fractionText);
    slotRef.lastCooldownFraction = fractionText;
  }

  function setSlotIcon(/** @type {any} */ slotRef, /** @type {any} */ iconFile, /** @type {any} */ label) {
    const iconText = iconFile ? '' : (label ? String(label).slice(0, 1).toUpperCase() : '');
    if (slotRef.lastIconFile !== iconFile) {
      applyGlyphMask(slotRef.iconEl, iconFile);
      slotRef.lastIconFile = iconFile ?? null;
    }
    if (slotRef.lastIconText !== iconText) {
      slotRef.iconEl.textContent = iconText;
      slotRef.lastIconText = iconText;
    }
    slotRef.iconEl.classList.toggle('is-text', !iconFile && !!iconText);
    if (label) {
      slotRef.iconEl.setAttribute('role', 'img');
      slotRef.iconEl.setAttribute('aria-label', String(label));
    }
  }

  function setSlotEmptyState(/** @type {any} */ slotRef, /** @type {any} */ isEmpty) {
    if (slotRef.isEmpty === isEmpty) return;
    slotRef.root.classList.toggle('empty', isEmpty);
    slotRef.isEmpty = isEmpty;
  }

  function buildAbilityBar() {
    if (!abilityBarEl) return;
    abilityBarEl.innerHTML = '';
    abilitySlots.length = 0;
    const keybinds = getKeybinds();
    for (let slot = 1; slot <= ABILITY_SLOTS; slot += 1) {
      const el = document.createElement('div');
      el.className = 'ability-slot empty';
      el.dataset.slot = String(slot);
      el.style.setProperty('--cooldown', '0');
      const key = document.createElement('div');
      key.className = 'ability-key';
      const bound = keybinds[`ability${slot}`] ?? (slot === 10 ? '0' : String(slot));
      key.textContent = formatKey(bound);
      const icon = document.createElement('div');
      icon.className = 'ability-icon ui-glyph ui-glyph-lg';
      const name = document.createElement('div');
      name.className = 'ability-name visually-hidden';
      name.textContent = '';
      const cooldownNum = document.createElement('div');
      cooldownNum.className = 'ability-cooldown-num';
      cooldownNum.textContent = '';
      const tooltip = document.createElement('div');
      tooltip.className = 'ability-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      const tooltipTitle = document.createElement('div');
      tooltipTitle.className = 'ability-tooltip-title';
      const tooltipMeta = document.createElement('div');
      tooltipMeta.className = 'ability-tooltip-meta';
      tooltip.appendChild(tooltipTitle);
      tooltip.appendChild(tooltipMeta);
      el.appendChild(key);
      el.appendChild(icon);
      el.appendChild(name);
      el.appendChild(cooldownNum);
      el.appendChild(tooltip);
      el.addEventListener('click', () => {
        onAbilityClick?.(slot);
      });
      abilityBarEl.appendChild(el);
      abilitySlots.push({
        root: el,
        keyEl: key,
        iconEl: icon,
        nameEl: name,
        cooldownNumEl: cooldownNum,
        tooltipEl: tooltip,
        tooltipTitleEl: tooltipTitle,
        tooltipMetaEl: tooltipMeta,
        lastAbilityId: null,
        lastKeyText: key.textContent,
        lastIconFile: null,
        lastIconText: '',
        lastNameText: name.textContent,
        lastTooltipTitleText: tooltipTitle.textContent,
        lastCooldownText: cooldownNum.textContent,
        lastTooltipText: tooltipMeta.textContent,
        lastCooldownFraction: '0',
        isEmpty: true,
      });
    }
  }

  function updateAbilityBar(/** @type {any} */ me, /** @type {any} */ serverNow, /** @type {any} */ getCurrentClassId, /** @type {any} */ globalCooldownMs = 900) {
    if (!abilityBarEl || abilitySlots.length === 0) return;
    const keybinds = getKeybinds();
    const classId = getCurrentClassId(me);
    const weaponDef = getEquippedWeapon(me?.equipment, classId);
    const abilities = getAbilitiesForClass(classId, me?.level ?? 1, weaponDef);
    const abilityBySlot = new Map(abilities.map((/** @type {any} */ ability) => [ability.slot, ability]));
    const gcdEnd = me?.globalCooldownUntil ?? 0;
    const gcdRemaining = Math.max(0, gcdEnd - serverNow);

    for (let slot = 1; slot <= ABILITY_SLOTS; slot += 1) {
      const ability = abilityBySlot.get(slot);
      const slotRef = abilitySlots[slot - 1];
      if (!slotRef) continue;
      const bound = keybinds[`ability${slot}`] ?? (slot === 10 ? '0' : String(slot));
      const keyLabel = formatKey(bound);
      setSlotText(slotRef, 'lastKeyText', slotRef.keyEl, keyLabel);

      if (ability) {
        setSlotEmptyState(slotRef, false);
        slotRef.lastAbilityId = ability.id ?? null;
        setSlotIcon(slotRef, getAbilityIconFile(ability, weaponDef), ability.name);
        setSlotText(slotRef, 'lastNameText', slotRef.nameEl, ability.name);
        setSlotText(slotRef, 'lastTooltipTitleText', slotRef.tooltipTitleEl, ability.name);
      } else {
        slotRef.lastAbilityId = null;
        setSlotEmptyState(slotRef, true);
        setSlotIcon(slotRef, null, '');
        setSlotText(slotRef, 'lastNameText', slotRef.nameEl, '');
        setSlotCooldownFraction(slotRef, '0');
        setSlotText(slotRef, 'lastTooltipTitleText', slotRef.tooltipTitleEl, '');
        setSlotText(slotRef, 'lastTooltipText', slotRef.tooltipMetaEl, '');
        setSlotText(slotRef, 'lastCooldownText', slotRef.cooldownNumEl, '');
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
      setSlotCooldownFraction(slotRef, fraction.toFixed(3));
      setSlotText(slotRef, 'lastTooltipText', slotRef.tooltipMetaEl, buildAbilityTooltip(ability));
      setSlotText(
        slotRef,
        'lastCooldownText',
        slotRef.cooldownNumEl,
        remaining > 0 && remaining < 60000
          ? `${(remaining / 1000).toFixed(1)}s`
          : ''
      );
    }
  }

  function setLocalCooldown(/** @type {any} */ slot, /** @type {any} */ until) {
    localCooldowns.set(slot, until);
  }

  function getLocalCooldown(/** @type {any} */ slot) {
    return localCooldowns.get(slot) ?? 0;
  }

  return {
    buildAbilityBar,
    updateAbilityBar,
    setLocalCooldown,
    getLocalCooldown,
  };
}
