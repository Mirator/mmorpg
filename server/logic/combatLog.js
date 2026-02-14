/**
 * Send combat log entries to a specific player.
 * @param {Map<string, object>} players
 * @param {string} playerId
 * @param {Array<{ kind: string, text: string, t: number }>} entries
 * @param {function} safeSend
 */
export function sendCombatLog(players, playerId, entries, safeSend) {
  if (!entries || entries.length === 0) return;
  const player = players.get(playerId);
  if (!player?.ws) return;
  safeSend(player.ws, {
    type: 'combatLog',
    t: Date.now(),
    entries: entries.map((e) => ({
      kind: e.kind ?? 'info',
      text: e.text ?? '',
      t: Number.isFinite(e.t) ? e.t : Date.now(),
    })),
  });
}
