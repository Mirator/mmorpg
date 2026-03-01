// @ts-check

import { distance, waitForCondition, TEST_TIMEOUT_MS } from './helpers.js';
import {
  countInventoryKind,
  createUniqueToken,
  getInventoryItems,
  moveToPoint,
  runScenario,
  signUpAndCreateCharacter,
} from './scenario-runtime.js';

function getOfferItem(/** @type {any} */ state) {
  return getInventoryItems(state).find((/** @type {any} */ item) => item?.slot != null) ?? null;
}

runScenario({
  name: 'trade-scenario',
  async run({ createPage, setStage }) {
    setStage('open-pages');
    const [{ page: pageA }, { page: pageB }] = await Promise.all([createPage(), createPage()]);
    const token = createUniqueToken('trade');

    setStage('create-characters');
    let [stateA, stateB] = await Promise.all([
      signUpAndCreateCharacter(pageA, {
        username: `${token}_a`,
        password: 'e2e_password',
        characterName: `TraderA ${token.slice(0, 4)}`,
        classId: 'fighter',
      }),
      signUpAndCreateCharacter(pageB, {
        username: `${token}_b`,
        password: 'e2e_password',
        characterName: `TraderB ${token.slice(0, 4)}`,
        classId: 'fighter',
      }),
    ]);
    const playerAId = String(stateA.player?.id ?? '');
    const playerBId = String(stateB.player?.id ?? '');
    if (!playerAId || !playerBId) {
      throw new Error('Missing player ids for trade scenario');
    }

    setStage('group-up');
    const playerAPoint = { x: 1.5, z: 0 };
    const playerBPoint = { x: -1.5, z: 0 };
    await Promise.all([
      moveToPoint(
        pageA,
        playerAPoint,
        (/** @type {any} */ nextState) => nextState.player && distance(nextState.player, playerAPoint) <= 1.5,
        'move player A into trade range'
      ),
      moveToPoint(
        pageB,
        playerBPoint,
        (/** @type {any} */ nextState) => nextState.player && distance(nextState.player, playerBPoint) <= 1.5,
        'move player B into trade range'
      ),
    ]);

    const offeredItem = getOfferItem(stateB);
    if (!offeredItem) {
      throw new Error('Player B has no inventory item to offer for trade');
    }

    const copperOffer = 10;
    const itemKind = String(offeredItem.kind ?? '');
    const itemCount = Math.max(1, Number(offeredItem.count ?? 1));
    const aCurrencyBefore = Number(stateA.player?.currencyCopper ?? 0);
    const bCurrencyBefore = Number(stateB.player?.currencyCopper ?? 0);
    const aItemCountBefore = countInventoryKind(stateA, itemKind);
    const bItemCountBefore = countInventoryKind(stateB, itemKind);

    setStage('trade-open');
    await pageA.evaluate((/** @type {{ targetId: string }} */ payload) => window.__game?.tradeRequest(payload.targetId), {
      targetId: playerBId,
    });
    await pageB.evaluate((/** @type {{ traderId: string }} */ payload) => window.__game?.tradeAccept(payload.traderId), {
      traderId: playerAId,
    });

    await Promise.all([
      waitForCondition(
        pageA,
        (/** @type {any} */ nextState) => nextState.trade?.tradeOpen === true,
        TEST_TIMEOUT_MS,
        'trade panel opens for player A'
      ),
      waitForCondition(
        pageB,
        (/** @type {any} */ nextState) => nextState.trade?.tradeOpen === true,
        TEST_TIMEOUT_MS,
        'trade panel opens for player B'
      ),
    ]);

    setStage('trade-offers');
    await pageA.evaluate((/** @type {{ amount: number }} */ payload) => window.__game?.tradeOfferAddCopper(payload.amount), {
      amount: copperOffer,
    });
    await pageB.evaluate((/** @type {{ slot: number }} */ payload) => window.__game?.tradeOfferAddSlot(payload.slot), {
      slot: offeredItem.slot,
    });

    setStage('trade-confirm');
    await pageA.evaluate(() => window.__game?.tradeConfirm());
    await pageB.evaluate(() => window.__game?.tradeConfirm());

    [stateA, stateB] = await Promise.all([
      waitForCondition(
        pageA,
        (/** @type {any} */ nextState) =>
          nextState.trade?.tradeOpen === false &&
          Number(nextState.player?.currencyCopper ?? 0) === aCurrencyBefore - copperOffer &&
          countInventoryKind(nextState, itemKind) === aItemCountBefore + itemCount,
        TEST_TIMEOUT_MS,
        'trade completes for player A'
      ),
      waitForCondition(
        pageB,
        (/** @type {any} */ nextState) =>
          nextState.trade?.tradeOpen === false &&
          Number(nextState.player?.currencyCopper ?? 0) === bCurrencyBefore + copperOffer &&
          countInventoryKind(nextState, itemKind) === bItemCountBefore - itemCount,
        TEST_TIMEOUT_MS,
        'trade completes for player B'
      ),
    ]);

    const aCurrencyAfter = Number(stateA.player?.currencyCopper ?? 0);
    const bCurrencyAfter = Number(stateB.player?.currencyCopper ?? 0);
    const aItemCountAfter = countInventoryKind(stateA, itemKind);
    const bItemCountAfter = countInventoryKind(stateB, itemKind);

    if (aCurrencyAfter !== aCurrencyBefore - copperOffer) {
      throw new Error(`Player A copper mismatch after trade: expected ${aCurrencyBefore - copperOffer}, got ${aCurrencyAfter}`);
    }
    if (bCurrencyAfter !== bCurrencyBefore + copperOffer) {
      throw new Error(`Player B copper mismatch after trade: expected ${bCurrencyBefore + copperOffer}, got ${bCurrencyAfter}`);
    }
    if (aItemCountAfter !== aItemCountBefore + itemCount) {
      throw new Error(`Player A item count mismatch after trade: expected +${itemCount}, got ${aItemCountAfter - aItemCountBefore}`);
    }
    if (bItemCountAfter !== bItemCountBefore - itemCount) {
      throw new Error(`Player B item count mismatch after trade: expected -${itemCount}, got ${bItemCountAfter - bItemCountBefore}`);
    }
  },
}).catch((/** @type {any} */ error) => {
  console.error(error);
  process.exit(1);
});
