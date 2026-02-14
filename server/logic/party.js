import crypto from 'node:crypto';

const parties = new Map();
const pendingInvites = new Map();

function generatePartyId() {
  if (typeof crypto.randomUUID === 'function') {
    return `party-${crypto.randomUUID()}`;
  }
  return `party-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Create a party with the leader as sole member.
 * @param {string} leaderId
 * @param {Map<string, object>} players - Players Map to check existing party and set partyId
 * @returns {string | null} partyId or null if leader already in a party
 */
export function createParty(leaderId, players) {
  if (!leaderId || !players?.get) return null;
  const existing = getPartyForPlayer(leaderId, players);
  if (existing) return null;
  const partyId = generatePartyId();
  parties.set(partyId, { memberIds: [leaderId] });
  const leader = players.get(leaderId);
  if (leader) leader.partyId = partyId;
  return partyId;
}

/**
 * Invite a player to a party. Stores pending invite.
 * @param {string} partyId
 * @param {string} inviterId
 * @param {string} targetId
 * @param {Map<string, object>} players - Players Map to check if target is in party
 * @returns {{ ok: boolean, reason?: string }}
 */
export function invitePlayer(partyId, inviterId, targetId, players) {
  if (!partyId || !inviterId || !targetId) return { ok: false, reason: 'invalid' };
  const party = parties.get(partyId);
  if (!party || !party.memberIds.includes(inviterId)) return { ok: false, reason: 'not_in_party' };
  if (targetId === inviterId) return { ok: false, reason: 'cannot_invite_self' };
  if (party.memberIds.includes(targetId)) return { ok: false, reason: 'already_in_party' };
  const targetParty = players ? getPartyForPlayer(targetId, players) : null;
  if (targetParty) return { ok: false, reason: 'target_in_party' };
  pendingInvites.set(targetId, { inviterId, partyId, at: Date.now() });
  return { ok: true };
}

/**
 * Accept an invite from another player.
 * @param {string} playerId - The player accepting
 * @param {string} inviterId - The player who sent the invite
 * @returns {{ ok: boolean, partyId?: string, reason?: string }}
 */
export function acceptInvite(playerId, inviterId) {
  if (!playerId || !inviterId) return { ok: false, reason: 'invalid' };
  const invite = pendingInvites.get(playerId);
  if (!invite || invite.inviterId !== inviterId) return { ok: false, reason: 'no_invite' };
  pendingInvites.delete(playerId);
  const party = parties.get(invite.partyId);
  if (!party || !party.memberIds.includes(inviterId)) return { ok: false, reason: 'party_gone' };
  if (party.memberIds.includes(playerId)) return { ok: true, partyId: invite.partyId };
  party.memberIds.push(playerId);
  return { ok: true, partyId: invite.partyId };
}

/**
 * Leave the current party.
 * @param {string} playerId
 * @param {Map<string, object>} players - Players Map to clear player.partyId
 * @returns {{ ok: boolean, disbanded?: boolean }}
 */
export function leaveParty(playerId, players) {
  if (!playerId) return { ok: false };
  const player = players?.get?.(playerId);
  const partyId = player?.partyId ?? null;
  if (!partyId) return { ok: true };
  const party = parties.get(partyId);
  if (!party) {
    if (player) player.partyId = null;
    return { ok: true };
  }
  const memberIds = party.memberIds.filter((id) => id !== playerId);
  if (player) player.partyId = null;
  if (memberIds.length === 0) {
    parties.delete(partyId);
    return { ok: true, disbanded: true };
  }
  party.memberIds = memberIds;
  return { ok: true };
}

/**
 * Get party members by party ID.
 * @param {string} partyId
 * @returns {string[]}
 */
export function getPartyMembers(partyId) {
  const party = parties.get(partyId);
  return party ? [...party.memberIds] : [];
}

/**
 * Get the party a player belongs to.
 * @param {string} playerId
 * @param {Map<string, object>} players - Players Map to look up player.partyId
 * @returns {{ id: string, memberIds: string[] } | null}
 */
export function getPartyForPlayer(playerId, players) {
  if (!playerId || !players?.get) return null;
  const player = players.get(playerId);
  const partyId = player?.partyId ?? null;
  if (!partyId) return null;
  const party = parties.get(partyId);
  if (!party || !party.memberIds.includes(playerId)) return null;
  return { id: partyId, memberIds: [...party.memberIds] };
}

/**
 * Set a player's partyId. Used when joining/leaving.
 * @param {object} player
 * @param {string | null} partyId
 */
export function setPlayerPartyId(player, partyId) {
  if (!player) return;
  player.partyId = partyId ?? null;
}

/**
 * Get pending invite for a player.
 * @param {string} targetId
 * @returns {{ inviterId: string, partyId: string } | null}
 */
export function getPendingInvite(targetId) {
  const invite = pendingInvites.get(targetId);
  return invite ? { inviterId: invite.inviterId, partyId: invite.partyId } : null;
}
