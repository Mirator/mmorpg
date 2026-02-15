import { ABILITY_SLOTS } from '/shared/classes.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { getAbilitiesForClass } from '/shared/classes.js';

export function buildAbilityTooltip(ability) {
  const parts = [];
  if (ability.baseValue != null && ability.coefficient != null) {
    parts.push(`Damage: ${ability.baseValue} + Power × ${ability.coefficient}`);
  }
  if (ability.resourceCost) {
    const res = ability.resourceCost ?? 0;
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

export function createAbilityBar(abilityBarEl, onAbilityClick) {
  const abilitySlots = [];
  const localCooldowns = new Map();

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
      abilityBarEl.appendChild(el);
      abilitySlots.push(el);
    }
  }

  function updateAbilityBar(me, serverNow, getCurrentClassId, globalCooldownMs = 900) {
    if (!abilityBarEl || abilitySlots.length === 0) return;
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

  function setLocalCooldown(slot, until) {
    localCooldowns.set(slot, until);
  }

  function getLocalCooldown(slot) {
    return localCooldowns.get(slot) ?? 0;
  }

  return {
    buildAbilityBar,
    updateAbilityBar,
    setLocalCooldown,
    getLocalCooldown,
  };
}
