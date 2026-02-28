// @ts-check
import { ABILITY_SLOTS } from '/shared/classes.js';
import { getAbilityPresentation } from '/shared/abilityPresentation.js';
import { getKeybinds } from '../keybinds.js';
import { getAbilityIconFile } from '../gameIcons.js';
import { applyGlyphMask } from '../uiGlyphs.js';

function formatKey(/** @type {any} */ key) {
  if (!key) return '';
  if (key === 'Escape') return 'ESC';
  return key.length === 1 ? key.toUpperCase() : key;
}

export function buildAbilityTooltip(/** @type {any} */ ability, /** @type {any} */ opts = {}) {
  return getAbilityPresentation(ability, opts).metaLabel;
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

  function setSlotStyleVar(
    /** @type {any} */ slotRef,
    /** @type {string} */ cssName,
    /** @type {string} */ stateKey,
    /** @type {any} */ value
  ) {
    const normalized = value == null ? null : String(value);
    if (slotRef[stateKey] === normalized) return;
    if (normalized == null || normalized === '') {
      slotRef.root.style.removeProperty(cssName);
    } else {
      slotRef.root.style.setProperty(cssName, normalized);
    }
    slotRef[stateKey] = normalized;
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
    for (let slot = 1; slot <= ABILITY_SLOTS; slot += 1) {
      const el = document.createElement('div');
      el.className = 'ability-slot empty';
      el.dataset.slot = String(slot);
      el.style.setProperty('--cooldown', '0');
      const key = document.createElement('div');
      key.className = 'ability-key';
      key.textContent = '';
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
      const tooltipBody = document.createElement('div');
      tooltipBody.className = 'ability-tooltip-body';
      const tooltipMeta = document.createElement('div');
      tooltipMeta.className = 'ability-tooltip-meta';
      tooltip.appendChild(tooltipTitle);
      tooltip.appendChild(tooltipBody);
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
        tooltipBodyEl: tooltipBody,
        tooltipMetaEl: tooltipMeta,
        lastAbilityId: null,
        lastKeyText: key.textContent,
        lastIconFile: undefined,
        lastIconText: '',
        lastNameText: name.textContent,
        lastTooltipTitleText: tooltipTitle.textContent,
        lastTooltipBodyText: tooltipBody.textContent,
        lastCooldownText: cooldownNum.textContent,
        lastTooltipMetaText: tooltipMeta.textContent,
        lastCooldownFraction: '0',
        lastPrimaryRgb: null,
        lastSecondaryRgb: null,
        isEmpty: true,
      });
    }
  }

  function updateAbilityBar(
    /** @type {any} */ me,
    /** @type {any} */ serverNow,
    /** @type {any} */ loadoutState,
    /** @type {any} */ globalCooldownMs = 900
  ) {
    if (!abilityBarEl || abilitySlots.length === 0) return;
    const keybinds = getKeybinds();
    const classId = loadoutState?.classId ?? me?.classId ?? null;
    const weaponDef = loadoutState?.weaponDef ?? null;
    const slottedAbilities = Array.isArray(loadoutState?.slottedAbilities)
      ? loadoutState.slottedAbilities
      : [];
    const gcdEnd = me?.globalCooldownUntil ?? 0;
    const gcdRemaining = Math.max(0, gcdEnd - serverNow);

    for (let slot = 1; slot <= ABILITY_SLOTS; slot += 1) {
      const ability = slottedAbilities[slot - 1] ?? null;
      const slotRef = abilitySlots[slot - 1];
      if (!slotRef) continue;
      const bound = keybinds[`ability${slot}`] ?? (slot === 10 ? '0' : String(slot));
      const keyLabel = formatKey(bound);

      if (ability) {
        const presentation = getAbilityPresentation(ability, { classId, weaponDef });
        setSlotEmptyState(slotRef, false);
        slotRef.lastAbilityId = ability.id ?? null;
        setSlotText(slotRef, 'lastKeyText', slotRef.keyEl, keyLabel);
        setSlotStyleVar(slotRef, '--ability-primary-rgb', 'lastPrimaryRgb', presentation.primaryRgb);
        setSlotStyleVar(slotRef, '--ability-secondary-rgb', 'lastSecondaryRgb', presentation.secondaryRgb);
        setSlotIcon(slotRef, getAbilityIconFile(ability, weaponDef), ability.name);
        setSlotText(slotRef, 'lastNameText', slotRef.nameEl, ability.name);
        setSlotText(slotRef, 'lastTooltipTitleText', slotRef.tooltipTitleEl, ability.name);
        setSlotText(slotRef, 'lastTooltipBodyText', slotRef.tooltipBodyEl, presentation.summary);
        setSlotText(slotRef, 'lastTooltipMetaText', slotRef.tooltipMetaEl, presentation.metaLabel);
      } else {
        slotRef.lastAbilityId = null;
        setSlotEmptyState(slotRef, true);
        setSlotText(slotRef, 'lastKeyText', slotRef.keyEl, '');
        setSlotStyleVar(slotRef, '--ability-primary-rgb', 'lastPrimaryRgb', null);
        setSlotStyleVar(slotRef, '--ability-secondary-rgb', 'lastSecondaryRgb', null);
        setSlotIcon(slotRef, null, '');
        setSlotText(slotRef, 'lastNameText', slotRef.nameEl, '');
        setSlotCooldownFraction(slotRef, '0');
        setSlotText(slotRef, 'lastTooltipTitleText', slotRef.tooltipTitleEl, '');
        setSlotText(slotRef, 'lastTooltipBodyText', slotRef.tooltipBodyEl, '');
        setSlotText(slotRef, 'lastTooltipMetaText', slotRef.tooltipMetaEl, '');
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
