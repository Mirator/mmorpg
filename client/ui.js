const statusEl = document.getElementById('status');
const hpEl = document.getElementById('hud-hp');
const invEl = document.getElementById('hud-inv');
const scoreEl = document.getElementById('hud-score');
const respawnEl = document.getElementById('hud-respawn');
const promptEl = document.getElementById('prompt');
const eventEl = document.getElementById('event');
const scoreboardEl = document.getElementById('scoreboard-list');
const damageFlashEl = document.getElementById('damage-flash');

let eventTimeout = null;

export function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

export function updateHud(player, now) {
  if (!player) {
    if (hpEl) hpEl.textContent = '--';
    if (invEl) invEl.textContent = '--';
    if (scoreEl) scoreEl.textContent = '--';
    if (respawnEl) respawnEl.textContent = '--';
    return;
  }

  if (hpEl) hpEl.textContent = `${player.hp ?? 0}`;
  if (invEl) {
    const inv = player.inv ?? 0;
    const slots = Number.isFinite(player.invSlots) ? player.invSlots : null;
    invEl.textContent = slots ? `${inv}/${slots}` : `${inv}`;
  }
  if (scoreEl) scoreEl.textContent = `${player.score ?? 0}`;

  if (respawnEl) {
    if (player.dead && player.respawnAt) {
      const remaining = Math.max(0, player.respawnAt - now);
      respawnEl.textContent = `${Math.ceil(remaining / 1000)}s`;
    } else {
      respawnEl.textContent = '--';
    }
  }
}

export function updateScoreboard(players, myId) {
  if (!scoreboardEl) return;
  const entries = Object.entries(players)
    .map(([id, p]) => ({ id, score: p.score ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  scoreboardEl.innerHTML = '';
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'score-row';
    row.textContent = `${entry.id}${entry.id === myId ? ' (you)' : ''}: ${entry.score}`;
    scoreboardEl.appendChild(row);
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
