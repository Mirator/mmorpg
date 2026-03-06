import { describe, expect, it } from 'vitest';
import { createPublicStateBuilder } from './stateView.js';
import {
  acceptInvite,
  createParty,
  invitePlayer,
  setPlayerPartyId,
} from '../logic/party.js';

describe('stateView', () => {
  it('serializes public players with visual state and keeps party members beyond AOI', () => {
    const local = {
      id: 'p-local',
      pos: { x: 0, y: 0, z: 0 },
      hp: 100,
      maxHp: 100,
      inv: 0,
      currencyCopper: 0,
      dead: false,
      classId: 'fighter',
      level: 1,
      name: 'Local',
      equipment: {
        weapon: { kind: 'weapon_training_sword' },
        offhand: null,
        head: { kind: 'armor_head_cloth' },
        chest: null,
        legs: null,
        feet: null,
      },
      partyId: 'party-1',
      keys: { walk: false },
    };
    const inRange = {
      id: 'p-near',
      pos: { x: 5, y: 0, z: 0 },
      hp: 90,
      maxHp: 100,
      inv: 1,
      currencyCopper: 10,
      dead: false,
      classId: 'mage',
      level: 2,
      name: 'Near',
      equipment: {
        weapon: { kind: 'weapon_apprentice_wand' },
        offhand: { kind: 'offhand_wooden_focus' },
        head: null,
        chest: { kind: 'armor_chest_leather' },
        legs: null,
        feet: null,
      },
      keys: { walk: true },
    };
    const farParty = {
      id: 'p-party-far',
      pos: { x: 999, y: 0, z: 999 },
      hp: 80,
      maxHp: 100,
      inv: 2,
      currencyCopper: 20,
      dead: false,
      classId: 'ranger',
      level: 3,
      name: 'PartyFar',
      equipment: {
        weapon: { kind: 'weapon_training_bow' },
        offhand: null,
        head: null,
        chest: null,
        legs: { kind: 'armor_legs_cloth' },
        feet: null,
      },
      partyId: 'party-1',
      keys: { walk: false },
    };
    const farOther = {
      id: 'p-far',
      pos: { x: 999, y: 0, z: -999 },
      hp: 70,
      maxHp: 100,
      inv: 3,
      currencyCopper: 30,
      dead: false,
      classId: 'priest',
      level: 4,
      name: 'Far',
      equipment: {
        weapon: { kind: 'weapon_training_staff' },
        offhand: null,
        head: null,
        chest: null,
        legs: null,
        feet: null,
      },
      keys: { walk: false },
    };

    const players = new Map([
      [local.id, local],
      [inRange.id, inRange],
      [farParty.id, farParty],
      [farOther.id, farOther],
    ]);
    const partyId = createParty(local.id, players);
    if (!partyId) throw new Error('failed to create party for test');
    const invite = invitePlayer(partyId, local.id, farParty.id, players);
    if (!invite.ok) throw new Error('failed to invite party member in test');
    const accepted = acceptInvite(farParty.id, local.id);
    if (!accepted.ok) throw new Error('failed to accept invite in test');
    setPlayerPartyId(farParty, partyId);

    const build = createPublicStateBuilder({
      players,
      resources: [],
      mobs: [],
      corpses: [],
      aoiRadius: 20,
    });

    const state = build(local, Date.now());

    expect(Object.keys(state.players).sort()).toEqual(
      [local.id, inRange.id, farParty.id].sort()
    );
    expect(state.players[local.id]?.visual).toEqual({
      outfitStyle: 'cloth',
      headKind: 'armor_head_cloth',
      weaponKind: 'weapon_training_sword',
      offhandKind: null,
    });
    expect(state.players[inRange.id]?.visual).toEqual({
      outfitStyle: 'leather',
      headKind: null,
      weaponKind: 'weapon_apprentice_wand',
      offhandKind: 'offhand_wooden_focus',
    });
    expect(state.players[farParty.id]?.visual).toEqual({
      outfitStyle: 'cloth',
      headKind: null,
      weaponKind: 'weapon_training_bow',
      offhandKind: null,
    });
  });
});
