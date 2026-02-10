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
const xpBarRemainingEl = document.getElementById('xp-bar-remaining');

let eventTimeout = null;

export function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

export function updateHud(player, now) {
  if (!player) {
    if (levelEl) levelEl.textContent = '--';
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
    if (xpBarRemainingEl) xpBarRemainingEl.textContent = '--';
    return;
  }

  if (levelEl) levelEl.textContent = `${player.level ?? 1}`;
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
    xpBarValueEl.textContent = needed ? `${current}/${needed}` : 'MAX';
  }
  if (xpBarRemainingEl) {
    xpBarRemainingEl.textContent = needed
      ? `${Math.max(0, needed - current)} to next level`
      : 'Max level';
  }
  if (hpEl) hpEl.textContent = `${player.hp ?? 0}`;
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
