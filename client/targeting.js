function titleCaseParts(value) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function deriveTargetName({ kind, id, name }) {
  if (typeof name === 'string' && name.trim()) return name.trim();
  if (kind === 'mob') {
    const mobId = typeof id === 'string' ? id : '';
    const numeric = mobId.match(/^m-?(\d+)$/);
    if (numeric) {
      return `Mob ${numeric[1]}`;
    }
    const cleaned = mobId.replace(/^m-/, '').replace(/^mob-/, '');
    const label = titleCaseParts(cleaned || 'mob');
    return label.endsWith('Mob') ? label : `${label} Mob`;
  }
  if (kind === 'vendor') return 'Vendor';
  if (kind === 'player') return 'Player';
  return 'Target';
}

export function resolveTarget(selection, { mobs, players, vendors }) {
  if (!selection || !selection.kind || !selection.id) return null;
  const kind = selection.kind;
  const id = selection.id;

  if (kind === 'mob') {
    const list = Array.isArray(mobs) ? mobs : [];
    const mob = list.find((item) => item?.id === id);
    if (!mob || mob.dead || mob.hp <= 0) return null;
    return {
      kind,
      id: mob.id,
      name: deriveTargetName({ kind, id: mob.id, name: mob.name }),
      level: mob.level ?? 1,
      hp: mob.hp ?? 0,
      maxHp: mob.maxHp ?? 0,
      pos: {
        x: mob.x ?? mob.pos?.x ?? 0,
        z: mob.z ?? mob.pos?.z ?? 0,
      },
    };
  }

  if (kind === 'player') {
    const pool = Array.isArray(players)
      ? players
      : players && typeof players === 'object'
        ? Object.entries(players).map(([pid, player]) => ({ id: pid, ...player }))
        : [];
    const player = pool.find((item) => item?.id === id);
    if (!player) return null;
    return {
      kind,
      id,
      name: deriveTargetName({ kind, id, name: player.name }),
      level: player.level ?? 1,
      hp: player.hp ?? null,
      maxHp: player.maxHp ?? null,
      pos: {
        x: player.x ?? 0,
        z: player.z ?? 0,
      },
    };
  }

  if (kind === 'vendor') {
    const list = Array.isArray(vendors) ? vendors : [];
    const vendor = list.find((item) => item?.id === id);
    if (!vendor) return null;
    return {
      kind,
      id: vendor.id,
      name: deriveTargetName({ kind, id: vendor.id, name: vendor.name }),
      level: null,
      hp: null,
      maxHp: null,
      pos: {
        x: vendor.x ?? 0,
        z: vendor.z ?? 0,
      },
    };
  }

  return null;
}
