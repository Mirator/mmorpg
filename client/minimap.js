/**
 * Minimap - top-down 2D map showing player, mobs, resources, and base.
 */

const COLORS = {
  background: 'rgba(27, 38, 32, 0.85)',
  base: '#d8b880',
  obstacle: '#3a3f44',
  resource: '#5ef2c2',
  resourceDim: '#1b2a28',
  mob: '#ff4d4d',
  player: '#4da3ff',
  playerStroke: '#ffffff',
};

const DEFAULT_MAP_SIZE = 400;
const MINIMAP_SIZE = 130;
const DOT_RADIUS = 2;
const PLAYER_RADIUS = 4;

export function createMinimap(containerEl) {
  const canvas = containerEl?.querySelector('#minimap') ?? containerEl?.querySelector('canvas');
  if (!canvas) {
    return { render: () => {}, resize: () => {} };
  }

  let width = MINIMAP_SIZE;
  let height = MINIMAP_SIZE;
  let dpr = 1;

  function worldToCanvas(x, z, mapSize, drawW, drawH) {
    const half = mapSize / 2;
    const px = ((x + half) / mapSize) * drawW;
    const py = ((z + half) / mapSize) * drawH;
    return { px, py };
  }

  function resize() {
    if (!containerEl || !canvas) return;
    const size = MINIMAP_SIZE;
    dpr = Math.min(2, window.devicePixelRatio ?? 1);
    width = Math.max(1, Math.floor(size * dpr));
    height = Math.max(1, Math.floor(size * dpr));
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
  }

  function render(state) {
    if (!canvas || !state) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mapSize = state.worldConfig?.mapSize ?? DEFAULT_MAP_SIZE;
    const base = state.worldConfig?.base ?? { x: 0, z: 0, radius: 8 };
    const obstacles = state.worldConfig?.obstacles ?? [];
    const resources = state.resources ?? [];
    const mobs = state.mobs ?? [];
    const playerPos = state.playerPos;

    ctx.save();
    ctx.scale(dpr, dpr);
    const drawW = width / dpr;
    const drawH = height / dpr;

    // 1. Background
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, drawW, drawH);

    // 2. Base circle
    const baseP = worldToCanvas(base.x, base.z, mapSize, drawW, drawH);
    const baseRadiusPx = (base.radius / mapSize) * drawW;
    ctx.fillStyle = COLORS.base;
    ctx.beginPath();
    ctx.arc(baseP.px, baseP.py, baseRadiusPx, 0, Math.PI * 2);
    ctx.fill();

    // 3. Obstacles
    ctx.fillStyle = COLORS.obstacle;
    for (const obs of obstacles) {
      const p = worldToCanvas(obs.x, obs.z, mapSize, drawW, drawH);
      const r = Math.max(1, (obs.r ?? 1) / mapSize * drawW);
      ctx.beginPath();
      ctx.arc(p.px, p.py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Resources
    for (const r of resources) {
      const p = worldToCanvas(r.x, r.z, mapSize, drawW, drawH);
      ctx.fillStyle = r.available ? COLORS.resource : COLORS.resourceDim;
      ctx.beginPath();
      ctx.arc(p.px, p.py, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Mobs (skip dead)
    ctx.fillStyle = COLORS.mob;
    for (const m of mobs) {
      if (m.dead) continue;
      const p = worldToCanvas(m.x, m.z, mapSize, drawW, drawH);
      ctx.beginPath();
      ctx.arc(p.px, p.py, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Player
    if (playerPos && Number.isFinite(playerPos.x) && Number.isFinite(playerPos.z)) {
      const p = worldToCanvas(playerPos.x, playerPos.z, mapSize, drawW, drawH);
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(p.px, p.py, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.playerStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }

  resize();
  return { render, resize };
}
