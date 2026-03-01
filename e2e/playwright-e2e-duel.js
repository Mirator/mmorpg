// @ts-check

import { distance, waitForCondition, TEST_TIMEOUT_MS } from './helpers.js';
import {
  createUniqueToken,
  moveToPoint,
  runScenario,
  signUpAndCreateCharacter,
} from './scenario-runtime.js';

runScenario({
  name: 'duel-scenario',
  async run({ createPage, setStage }) {
    setStage('open-pages');
    const [{ page: pageA }, { page: pageB }] = await Promise.all([createPage(), createPage()]);
    const token = createUniqueToken('duel');

    setStage('create-characters');
    let [stateA, stateB] = await Promise.all([
      signUpAndCreateCharacter(pageA, {
        username: `${token}_a`,
        password: 'e2e_password',
        characterName: `DuelA ${token.slice(0, 4)}`,
        classId: 'fighter',
      }),
      signUpAndCreateCharacter(pageB, {
        username: `${token}_b`,
        password: 'e2e_password',
        characterName: `DuelB ${token.slice(0, 4)}`,
        classId: 'fighter',
      }),
    ]);
    const playerAId = String(stateA.player?.id ?? '');
    const playerBId = String(stateB.player?.id ?? '');
    if (!playerAId || !playerBId) {
      throw new Error('Missing player ids for duel scenario');
    }

    setStage('group-up');
    const playerAPoint = { x: 1.5, z: 0 };
    const playerBPoint = { x: -1.5, z: 0 };
    await Promise.all([
      moveToPoint(
        pageA,
        playerAPoint,
        (/** @type {any} */ nextState) => nextState.player && distance(nextState.player, playerAPoint) <= 1.5,
        'move duelist A into duel range'
      ),
      moveToPoint(
        pageB,
        playerBPoint,
        (/** @type {any} */ nextState) => nextState.player && distance(nextState.player, playerBPoint) <= 1.5,
        'move duelist B into duel range'
      ),
    ]);

    setStage('duel-open');
    await pageA.evaluate((/** @type {{ targetId: string }} */ payload) => window.__game?.duelRequest(payload.targetId), {
      targetId: playerBId,
    });
    await pageB.evaluate(
      (/** @type {{ challengerId: string }} */ payload) => window.__game?.duelAccept(payload.challengerId),
      { challengerId: playerAId }
    );

    [stateA, stateB] = await Promise.all([
      waitForCondition(
        pageA,
        (/** @type {any} */ nextState) => nextState.player?.duelOpponentId === playerBId,
        TEST_TIMEOUT_MS,
        'duel becomes active for player A'
      ),
      waitForCondition(
        pageB,
        (/** @type {any} */ nextState) => nextState.player?.duelOpponentId === playerAId,
        TEST_TIMEOUT_MS,
        'duel becomes active for player B'
      ),
    ]);

    setStage('duel-forfeit');
    await pageA.evaluate(() => window.__game?.duelForfeit());

    [stateA, stateB] = await Promise.all([
      waitForCondition(
        pageA,
        (/** @type {any} */ nextState) => !nextState.player?.duelOpponentId,
        TEST_TIMEOUT_MS,
        'duel clears for player A'
      ),
      waitForCondition(
        pageB,
        (/** @type {any} */ nextState) => !nextState.player?.duelOpponentId,
        TEST_TIMEOUT_MS,
        'duel clears for player B'
      ),
    ]);

    if (stateA.player?.dead || stateB.player?.dead) {
      throw new Error('Duel forfeit should not kill either player');
    }
  },
}).catch((/** @type {any} */ error) => {
  console.error(error);
  process.exit(1);
});
