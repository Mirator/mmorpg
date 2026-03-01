// @ts-check
import { formatCurrency } from '/shared/economy.js';
import { xpToNext } from '/shared/progression.js';
import { getActiveTutorialStep, TUTORIAL_STEPS } from '/shared/tutorial.js';

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
const entryBannerEl = document.getElementById('entry-banner');
const entryBannerTitleEl = document.getElementById('entry-banner-title');
const entryBannerSubtitleEl = document.getElementById('entry-banner-subtitle');
const controlsCardEl = document.getElementById('controls-card');
const controlsCardCloseEl = document.getElementById('controls-card-close');
const objectivesEl = document.getElementById('objective-tracker');

let /** @type {any} */ eventTimeout = null;
let /** @type {any} */ entryBannerTimeout = null;
const CONTROLS_CARD_SEEN_KEY = 'rising-ages-controls-card-seen';
const BAR_RENDER_CACHE = {
  overlayHp: { width: '', text: '' },
  overlayResource: { width: '', text: '' },
  targetHp: { width: '', text: '' },
};
let lastPromptText = '';
let promptVisible = false;
let lastTargetHudKey = '';
const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

const TOAST_DURATION_MS = 2500;

function readControlsCardSeen() {
  try {
    return window.sessionStorage?.getItem(CONTROLS_CARD_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeControlsCardSeen() {
  try {
    window.sessionStorage?.setItem(CONTROLS_CARD_SEEN_KEY, '1');
  } catch {
    /* ignore storage access failures */
  }
}

export function showToast(/** @type {any} */ message, /** @type {'default' | 'warning'} */ tone = 'default') {
  if (!message || !toastContainer) return;
  const toast = document.createElement('div');
  toast.className = tone === 'warning' ? 'toast toast-warning' : 'toast';
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toastContainer.appendChild(toast);
  const remove = () => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 200);
  };
  setTimeout(remove, TOAST_DURATION_MS);
}

function setBar(
  /** @type {any} */ fillEl,
  /** @type {any} */ valueEl,
  /** @type {any} */ value,
  /** @type {any} */ max,
  /** @type {'overlayHp' | 'overlayResource' | 'targetHp' | null} */ cacheKey = null
) {
  const hasNumbers = Number.isFinite(value) && Number.isFinite(max) && max > 0;
  const widthText = hasNumbers
    ? `${(Math.max(0, Math.min(1, value / max)) * 100).toFixed(1)}%`
    : '0%';
  const valueText = hasNumbers
    ? `${Math.floor(value)}/${Math.floor(max)}`
    : '--';
  const cache = cacheKey ? BAR_RENDER_CACHE[cacheKey] : null;

  if (fillEl && (!cache || cache.width !== widthText)) {
    fillEl.style.width = widthText;
  }
  if (valueEl && (!cache || cache.text !== valueText)) {
    valueEl.textContent = valueText;
  }
  if (cache) {
    cache.width = widthText;
    cache.text = valueText;
  }
}

function formatResourceLabel(/** @type {any} */ resourceType) {
  if (!resourceType) return 'Resource';
  return resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
}

export function setStatus(/** @type {any} */ text) {
  if (statusEl) statusEl.textContent = text;
}

export function updateHud(/** @type {any} */ player, /** @type {any} */ now) {
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
    setBar(overlayHpFillEl, overlayHpValueEl, null, null, 'overlayHp');
    setBar(overlayStaminaFillEl, overlayStaminaValueEl, null, null, 'overlayResource');
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
    Number.isFinite(player.maxHp) ? player.maxHp : player.hp ?? 0,
    'overlayHp'
  );
  setBar(
    overlayStaminaFillEl,
    overlayStaminaValueEl,
    Number.isFinite(player.resource) ? player.resource : 0,
    Number.isFinite(player.resourceMax) ? player.resourceMax : player.resource ?? 0,
    'overlayResource'
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

export function updateTargetHud(/** @type {any} */ target) {
  if (!targetHudEl) return;
  if (!target) {
    if (lastTargetHudKey === '__none__') return;
    lastTargetHudKey = '__none__';
    targetHudEl.classList.remove('visible');
    if (targetNameEl) targetNameEl.textContent = '--';
    if (targetMetaEl) targetMetaEl.textContent = '--';
    if (targetHpEl) targetHpEl.style.display = 'none';
    setBar(targetHpFillEl, targetHpValueEl, null, null, 'targetHp');
    return;
  }

  const /** @type {any} */ metaParts = [];
  if (target.kind === 'vendor') metaParts.push('Vendor');
  if (target.kind === 'player') metaParts.push('Player');
  if (target.kind === 'mob') metaParts.push('Enemy');
  if (Number.isFinite(target.level)) metaParts.push(`Lvl ${target.level}`);
  if (Number.isFinite(target.distance)) metaParts.push(`${target.distance.toFixed(1)}m`);
  const metaText = metaParts.join(' · ');
  const hasHp = Number.isFinite(target.hp) && Number.isFinite(target.maxHp);
  const targetKey = [
    target.kind ?? '',
    target.id ?? '',
    target.name ?? '--',
    metaText,
    hasHp ? `${target.hp}/${target.maxHp}` : 'no-hp',
  ].join('|');
  if (targetKey === lastTargetHudKey) return;
  lastTargetHudKey = targetKey;

  targetHudEl.classList.add('visible');
  if (targetNameEl) targetNameEl.textContent = target.name ?? '--';
  if (targetMetaEl) {
    targetMetaEl.textContent = metaText;
  }
  if (targetHpEl) targetHpEl.style.display = hasHp ? 'flex' : 'none';
  if (hasHp) {
    setBar(targetHpFillEl, targetHpValueEl, target.hp, target.maxHp, 'targetHp');
  } else {
    setBar(targetHpFillEl, targetHpValueEl, null, null, 'targetHp');
  }
}

export function updateObjectives(/** @type {any} */ player) {
  if (!objectivesEl) return;
  objectivesEl.innerHTML = '';
  const activeContracts = Array.isArray(player?.activeContracts) ? player.activeContracts : [];
  const tutorialState = player?.tutorial ?? null;
  const activeTutorialStep = getActiveTutorialStep(tutorialState);
  if (activeContracts.length === 0 && !activeTutorialStep) {
    objectivesEl.classList.add('hidden');
    return;
  }
  objectivesEl.classList.remove('hidden');
  let remainingSlots = 2;
  if (activeTutorialStep) {
    const row = document.createElement('div');
    row.className = 'objective-row';
    const title = document.createElement('div');
    title.className = 'objective-title';
    title.textContent = `Guide: ${activeTutorialStep.title}`;
    const progress = document.createElement('div');
    progress.className = 'objective-progress';
    const completedCount = Array.isArray(tutorialState?.completedStepIds)
      ? tutorialState.completedStepIds.length
      : 0;
    progress.textContent = `${completedCount}/${TUTORIAL_STEPS.length}`;
    row.appendChild(title);
    row.appendChild(progress);
    objectivesEl.appendChild(row);
    remainingSlots -= 1;
  }
  const visible = activeContracts.slice(0, Math.max(0, remainingSlots));
  for (const contract of visible) {
    const row = document.createElement('div');
    row.className = 'objective-row';
    const title = document.createElement('div');
    title.className = 'objective-title';
    title.textContent = contract.title ?? 'Contract';
    const progress = document.createElement('div');
    progress.className = 'objective-progress';
    if (contract.completed) {
      progress.textContent = contract.delivered ? 'Completed' : 'Turn in';
    } else {
      progress.textContent = `${Math.min(contract.progress ?? 0, contract.requiredCount ?? 1)}/${contract.requiredCount ?? 1}`;
    }
    row.appendChild(title);
    row.appendChild(progress);
    objectivesEl.appendChild(row);
  }
  if (activeContracts.length > visible.length) {
    const more = document.createElement('div');
    more.className = 'objective-more';
    more.textContent = `+${activeContracts.length - visible.length} more`;
    objectivesEl.appendChild(more);
  }
}

export function showPrompt(/** @type {any} */ text) {
  if (!promptEl) return;
  if (lastPromptText !== text) {
    promptEl.textContent = text;
    lastPromptText = text;
  }
  if (!promptVisible) {
    promptEl.classList.add('visible');
    promptVisible = true;
  }
}

export function clearPrompt() {
  if (!promptEl) return;
  if (promptVisible) {
    promptEl.classList.remove('visible');
    promptVisible = false;
  }
}

export function showEvent(/** @type {any} */ text) {
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

/**
 * @param {{ title?: string, subtitle?: string, durationMs?: number }} [options]
 */
export function showEntryBanner({ title = 'Entering World', subtitle = '', durationMs = 4000 } = {}) {
  if (!entryBannerEl) return;
  if (entryBannerTitleEl) entryBannerTitleEl.textContent = title;
  if (entryBannerSubtitleEl) entryBannerSubtitleEl.textContent = subtitle;
  entryBannerEl.classList.add('visible');
  if (entryBannerTimeout) clearTimeout(entryBannerTimeout);
  entryBannerTimeout = setTimeout(() => {
    hideEntryBanner();
  }, durationMs);
}

export function hideEntryBanner() {
  if (!entryBannerEl) return;
  entryBannerEl.classList.remove('visible');
}

export function showControlsCard() {
  if (!controlsCardEl || readControlsCardSeen()) return;
  controlsCardEl.classList.add('visible');
}

export function hideControlsCard({ remember = true } = {}) {
  if (!controlsCardEl) return;
  controlsCardEl.classList.remove('visible');
  if (remember) {
    writeControlsCardSeen();
  }
}

controlsCardCloseEl?.addEventListener('click', () => {
  hideControlsCard();
});
