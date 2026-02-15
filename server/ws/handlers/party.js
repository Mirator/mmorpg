import {
  createParty,
  getPartyForPlayer,
  getPartyMembers,
  setPlayerPartyId,
  invitePlayer,
  acceptInvite,
  leaveParty,
} from '../../logic/party.js';

export function handlePartyInvite(ctx) {
  const { player, players, msg, safeSend, sendPrivateState } = ctx;
  if (player.isGuest) return;
  const target = players.get(msg.targetId);
  if (!target || !target.ws || target.dead) return;
  const party = getPartyForPlayer(player.id, players);
  const partyId = party ? party.id : createParty(player.id, players);
  if (!partyId) return;
  const result = invitePlayer(partyId, player.id, msg.targetId, players);
  if (result.ok && target.ws) {
    safeSend(target.ws, {
      type: 'partyInviteReceived',
      inviterId: player.id,
      inviterName: player.name ?? player.persistName ?? 'Unknown',
    });
  }
}

export function handlePartyAccept(ctx) {
  const { player, players, msg, sendPrivateState, persistence } = ctx;
  if (player.isGuest) return;
  const result = acceptInvite(player.id, msg.inviterId);
  if (result.ok && result.partyId) {
    setPlayerPartyId(player, result.partyId);
    persistence.markDirty(player);
    const memberIds = getPartyMembers(result.partyId);
    for (const mid of memberIds) {
      const m = players.get(mid);
      if (m?.ws) sendPrivateState(m.ws, m, Date.now());
    }
  }
}

export function handlePartyLeave(ctx) {
  const { player, players, ws, sendPrivateState, persistence } = ctx;
  const partyBefore = getPartyForPlayer(player.id, players);
  leaveParty(player.id, players);
  persistence.markDirty(player);
  sendPrivateState(ws, player, Date.now());
  if (partyBefore) {
    for (const mid of partyBefore.memberIds) {
      if (mid === player.id) continue;
      const m = players.get(mid);
      if (m?.ws) sendPrivateState(m.ws, m, Date.now());
    }
  }
}
