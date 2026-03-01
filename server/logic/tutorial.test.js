import { describe, expect, it } from 'vitest';
import { applyTutorialProgress, ensureTutorialState } from './tutorial.js';

describe('tutorial progression', () => {
  it('advances in order and grants the completion reward once', () => {
    const player = {
      level: 1,
      xp: 0,
      currencyCopper: 0,
      invStackMax: 20,
      inventory: Array.from({ length: 5 }, () => null),
    };
    const nextItemIdRef = { current: 1 };

    ensureTutorialState(player);
    expect(player.tutorial.activeStepId).toBe('move');

    expect(applyTutorialProgress(player, 'harvest', { nextItemIdRef }).changed).toBe(false);

    for (const stepId of [
      'move',
      'harvest',
      'sell',
      'equip',
      'attack',
      'accept_contract',
      'turn_in_contract',
    ]) {
      applyTutorialProgress(player, stepId, { nextItemIdRef, now: 1000 });
    }

    expect(player.tutorial.completed).toBe(true);
    expect(player.tutorial.activeStepId).toBe(null);
    expect(player.currencyCopper).toBe(50);
    expect(player.xp).toBe(100);
    expect(player.inventory[0]).toEqual(
      expect.objectContaining({
        kind: 'consumable_minor_health_potion',
        count: 2,
      })
    );

    const afterComplete = applyTutorialProgress(player, 'turn_in_contract', { nextItemIdRef, now: 2000 });
    expect(afterComplete.changed).toBe(false);
    expect(player.currencyCopper).toBe(50);
    expect(player.xp).toBe(100);
  });
});
