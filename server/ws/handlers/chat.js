import { getPartyForPlayer } from '../../logic/party.js';
import { addMessage as addChatMessage } from '../../logic/chat.js';

export function handleChat(ctx) {
  const { player, players, msg, config, safeSend, allowChatMessage } = ctx;
  if (player.isGuest) return;
  if (!allowChatMessage()) return;
  const { channel, text } = msg;
  if (channel === 'party') {
    const party = getPartyForPlayer(player.id, players);
    if (!party) return;
    const stored = addChatMessage(channel, player.id, player.name ?? player.persistName ?? 'Unknown', text, Date.now());
    if (!stored) return;
    const payload = {
      type: 'chat',
      channel: stored.channel,
      authorId: stored.authorId,
      author: stored.author,
      text: stored.text,
      timestamp: stored.timestamp,
    };
    for (const mid of party.memberIds) {
      const m = players.get(mid);
      if (m?.ws && !m.isGuest) safeSend(m.ws, payload);
    }
    return;
  }
  const authorName = player.name ?? player.persistName ?? 'Unknown';
  const authorId = player.id;
  const now = Date.now();
  const stored = addChatMessage(channel, authorId, authorName, text, now);
  if (!stored) return;
  const payload = {
    type: 'chat',
    channel: stored.channel,
    authorId: stored.authorId,
    author: stored.author,
    text: stored.text,
    timestamp: stored.timestamp,
  };
  const areaRadius = config.chat?.areaRadius ?? 80;
  const radius2 = areaRadius * areaRadius;
  if (channel === 'global' || channel === 'trade') {
    for (const p of players.values()) {
      if (p?.ws && !p.isGuest) safeSend(p.ws, payload);
    }
  } else if (channel === 'area') {
    const sx = player.pos?.x ?? 0;
    const sz = player.pos?.z ?? 0;
    for (const p of players.values()) {
      if (!p?.ws || p.isGuest) continue;
      const dx = (p.pos?.x ?? 0) - sx;
      const dz = (p.pos?.z ?? 0) - sz;
      if (dx * dx + dz * dz <= radius2) {
        safeSend(p.ws, payload);
      }
    }
  }
}
