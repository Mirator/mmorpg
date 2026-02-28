import { describe, it, expect, vi } from 'vitest';
import { createInventory } from '../../logic/inventory.js';
import { handleInteract } from './interact.js';

describe('handleInteract', () => {
  it('stops click-to-move and sends private state when harvest starts', () => {
    const player = {
      dead: false,
      hp: 127,
      pos: { x: 0, y: 0, z: 0 },
      inventory: createInventory(6),
      invStackMax: 20,
      target: { x: 1.5, y: 0, z: 0 },
      harvest: null,
    };
    const ws = { id: 'ws-1' };
    const sendPrivateState = vi.fn();

    handleInteract({
      player,
      ws,
      sendPrivateState,
      resources: [{ id: 'r1', x: 0, y: 0, z: 0, type: 'crystal', available: true, respawnAt: 0 }],
      corpses: [],
      config: {
        resource: {
          harvestRadius: 2,
          harvestDurationMs: 2500,
          respawnMs: 15000,
        },
        corpse: {
          lootRadius: 2.5,
        },
      },
      persistence: {
        markDirty: vi.fn(),
      },
    });

    expect(player.harvest).toMatchObject({
      resourceId: 'r1',
      resourceType: 'crystal',
    });
    expect(player.target).toBeNull();
    expect(sendPrivateState).toHaveBeenCalledTimes(1);
    expect(sendPrivateState).toHaveBeenCalledWith(ws, player, expect.any(Number));
  });
});
