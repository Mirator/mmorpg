const overlayEl = document.getElementById('error-overlay');
const titleEl = document.getElementById('error-overlay-title');
const messageEl = document.getElementById('error-overlay-message');
const actionsEl = document.getElementById('error-overlay-actions');

export function showErrorOverlay({ title = 'Something went wrong', message = '', actions = [] }) {
  if (!overlayEl || !titleEl || !messageEl || !actionsEl) return;
  titleEl.textContent = title;
  messageEl.textContent = message;
  actionsEl.innerHTML = '';
  for (const { label, onClick } of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-primary error-overlay-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      onClick?.();
    });
    actionsEl.appendChild(btn);
  }
  overlayEl.classList.add('visible');
}

export function hideErrorOverlay() {
  overlayEl?.classList.remove('visible');
}
