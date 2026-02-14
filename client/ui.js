import { formatCurrency } from '/shared/economy.js';
import { xpToNext } from '/shared/progression.js';

const statusEl = document.getElementById('status');
const levelEl = document.getElementById('hud-level');
const hpEl = document.getElementById('hud-hp');
const invEl = document.getElementById('hud-inv');
const coinsEl = document.getElementById('hud-coins');
const respawnEl = document.getElementById('hud-respawn');
const promptEl = document.getElementById('prompt');
const eventEl = document.getElementById('event');
const damageFlashEl = document.getElementById('damage-flash');
const xpBarEl = document.getElementById('xp-bar');
const xpBarValueEl = document.getElementById('xp-bar-value');
const xpBarPercentEl = document.getElementById('xp-bar-percent');
const overlayHpFillEl = document.getElementById('overlay-hp-fill');
const overlayHpValueEl = document.getElementById('overlay-hp-value');
const overlayStaminaFillEl = document.getElementById('overlay-stamina-fill');
const overlayStaminaValueEl = document.getElementById('overlay-stamina-value');
const overlayResourceLabelEl = document.getElementById('overlay-resource-label');
const overlayLevelEl = document.getElementById('overlay-level');
const overlayResourceBarEl = document.getElementById('overlay-resource-bar');
const overlayPortraitEl = document.getElementById('overlay-portrait');
const targetHudEl = document.getElementById('target-hud');
const targetNameEl = document.getElementById('target-name');
const targetMetaEl = document.getElementById('target-meta');
const targetHpEl = document.getElementById('target-hp');
const targetHpFillEl = document.getElementById('target-hp-fill');
const targetHpValueEl = document.getElementById('target-hp-value');

let eventTimeout = null;

function setBar(fillEl, valueEl, value, max) {
  if (fillEl) {
    if (Number.isFinite(value) && Number.isFinite(max) && max > 0) {
      const clamped = Math.max(0, Math.min(1, value / max));
      fillEl.style.width = `${(clamped * 100).toFixed(1)}%`;
    } else {
      fillEl.style.width = '0%';
    }
  }
  if (valueEl) {
    if (Number.isFinite(value) && Number.isFinite(max) && max > 0) {
      valueEl.textContent = `${Math.floor(value)}/${Math.floor(max)}`;
    } else {
      valueEl.textContent = '--';
    }
  }
}

function formatResourceLabel(resourceType) {
  if (!resourceType) return 'Resource';
  return resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
}

export function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

export function updateHud(player, now) {
  if (!player) {
    if (levelEl) levelEl.textContent = '--';
    if (overlayLevelEl) overlayLevelEl.textContent = '--';
    if (hpEl) hpEl.textContent = '--';
    if (invEl) invEl.textContent = '--';
    if (coinsEl) coinsEl.textContent = '--';
    if (respawnEl) respawnEl.textContent = '--';
    if (xpBarEl) {
      xpBarEl.style.setProperty('--progress', '0');
      xpBarEl.setAttribute('aria-valuenow', '0');
      xpBarEl.setAttribute('aria-valuemax', '0');
      xpBarEl.setAttribute('aria-valuetext', '--');
    }
    if (xpBarValueEl) xpBarValueEl.textContent = '--';
    if (xpBarPercentEl) xpBarPercentEl.textContent = '--';
    setBar(overlayHpFillEl, overlayHpValueEl, null, null);
    if (overlayStaminaFillEl) overlayStaminaFillEl.style.width = '0%';
    if (overlayStaminaValueEl) overlayStaminaValueEl.textContent = '--';
    if (overlayResourceLabelEl) overlayResourceLabelEl.textContent = 'Resource';
    if (overlayResourceBarEl) {
      overlayResourceBarEl.classList.remove('resource-type-mana', 'resource-type-stamina', 'resource-type-rage', 'resource-type-focus');
    }
    if (overlayPortraitEl) overlayPortraitEl.removeAttribute('data-class');
    return;
  }

  if (levelEl) levelEl.textContent = `${player.level ?? 1}`;
  if (overlayLevelEl) overlayLevelEl.textContent = `${player.level ?? 1}`;
  const needed = player.xpToNext ?? xpToNext(player.level ?? 1);
  const current = Math.max(0, player.xp ?? 0);
  const progress = needed > 0 ? Math.min(1, current / needed) : 1;
  if (xpBarEl) {
    xpBarEl.style.setProperty('--progress', progress.toFixed(4));
    const maxValue = needed > 0 ? needed : 1;
    const nowValue = needed > 0 ? current : 1;
    xpBarEl.setAttribute('aria-valuenow', String(nowValue));
    xpBarEl.setAttribute('aria-valuemax', String(maxValue));
    xpBarEl.setAttribute('aria-valuetext', needed ? `${current}/${needed}` : 'MAX');
  }
  if (xpBarValueEl) {
    xpBarValueEl.textContent = needed ? `${current} / ${needed} XP` : 'MAX';
  }
  if (xpBarPercentEl) {
    const pct = needed > 0 ? Math.min(100, (current / needed) * 100) : 100;
    xpBarPercentEl.textContent = needed
      ? `${pct.toFixed(1)}%`
      : 'Max level';
  }
  if (hpEl) hpEl.textContent = `${player.hp ?? 0}`;
  setBar(
    overlayHpFillEl,
    overlayHpValueEl,
    Number.isFinite(player.hp) ? player.hp : 0,
    Number.isFinite(player.maxHp) ? player.maxHp : player.hp ?? 0
  );
  setBar(
    overlayStaminaFillEl,
    overlayStaminaValueEl,
    Number.isFinite(player.resource) ? player.resource : 0,
    Number.isFinite(player.resourceMax) ? player.resourceMax : player.resource ?? 0
  );
  if (overlayResourceLabelEl) {
    overlayResourceLabelEl.textContent = formatResourceLabel(player.resourceType);
  }
  if (overlayResourceBarEl) {
    overlayResourceBarEl.classList.remove('resource-type-mana', 'resource-type-stamina', 'resource-type-rage', 'resource-type-focus');
    const rt = player.resourceType;
    if (rt) overlayResourceBarEl.classList.add(`resource-type-${rt}`);
  }
  if (overlayPortraitEl) {
    overlayPortraitEl.setAttribute('data-class', player.classId ?? '');
  }
  if (invEl) {
    const inv = player.inv ?? 0;
    const slots = Number.isFinite(player.invSlots) ? player.invSlots : null;
    invEl.textContent = slots ? `${inv}/${slots}` : `${inv}`;
  }
  if (coinsEl) coinsEl.textContent = formatCurrency(player.currencyCopper ?? 0);

  if (respawnEl) {
    if (player.dead && player.respawnAt) {
      const remaining = Math.max(0, player.respawnAt - now);
      respawnEl.textContent = `${Math.ceil(remaining / 1000)}s`;
    } else {
      respawnEl.textContent = '--';
    }
  }
}

export function updateTargetHud(target) {
  if (!targetHudEl) return;
  if (!target) {
    targetHudEl.classList.remove('visible');
    if (targetNameEl) targetNameEl.textContent = '--';
    if (targetMetaEl) targetMetaEl.textContent = '--';
    if (targetHpEl) targetHpEl.style.display = 'none';
    setBar(targetHpFillEl, targetHpValueEl, null, null);
    return;
  }

  targetHudEl.classList.add('visible');
  if (targetNameEl) targetNameEl.textContent = target.name ?? '--';
  if (targetMetaEl) {
    const metaParts = [];
    if (target.kind === 'vendor') metaParts.push('Vendor');
    if (target.kind === 'player') metaParts.push('Player');
    if (target.kind === 'mob') metaParts.push('Enemy');
    if (Number.isFinite(target.level)) metaParts.push(`Lvl ${target.level}`);
    targetMetaEl.textContent = metaParts.join(' · ');
  }
  const hasHp = Number.isFinite(target.hp) && Number.isFinite(target.maxHp);
  if (targetHpEl) targetHpEl.style.display = hasHp ? 'flex' : 'none';
  if (hasHp) {
    setBar(targetHpFillEl, targetHpValueEl, target.hp, target.maxHp);
  } else {
    setBar(targetHpFillEl, targetHpValueEl, null, null);
  }
}

export function showPrompt(text) {
  if (!promptEl) return;
  promptEl.textContent = text;
  promptEl.classList.add('visible');
}

export function clearPrompt() {
  if (!promptEl) return;
  promptEl.classList.remove('visible');
}

export function showEvent(text) {
  if (!eventEl) return;
  eventEl.textContent = text;
  eventEl.classList.remove('show');
  void eventEl.offsetHeight;
  eventEl.classList.add('show');
  if (eventTimeout) clearTimeout(eventTimeout);
  eventTimeout = setTimeout(() => {
    eventEl.classList.remove('show');
  }, 1200);
}

export function flashDamage() {
  if (!damageFlashEl) return;
  damageFlashEl.classList.remove('flash');
  void damageFlashEl.offsetHeight;
  damageFlashEl.classList.add('flash');
}
