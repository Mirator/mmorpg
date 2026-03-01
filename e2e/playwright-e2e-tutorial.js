// @ts-check

import { getContractOffersForVendor } from '../shared/contracts.js';
import { getRecipeById } from '../shared/recipes.js';
import { distance, waitForCondition, TEST_TIMEOUT_MS } from './helpers.js';
import {
  countInventoryKind,
  createUniqueToken,
  getInventoryItems,
  moveToPoint,
  runScenario,
  signUpAndCreateCharacter,
} from './scenario-runtime.js';

function getNearestVendor(/** @type {any} */ state) {
  const player = state?.player ?? null;
  const vendors = Array.isArray(state?.world?.vendors) ? state.world.vendors : [];
  if (!player || vendors.length === 0) return null;
  return vendors.reduce((/** @type {any} */ best, /** @type {any} */ vendor) => {
    if (!best) return vendor;
    return distance(player, vendor) < distance(player, best) ? vendor : best;
  }, null);
}

function getNearestAvailableResource(/** @type {any} */ state) {
  const player = state?.player ?? null;
  const resources = Array.isArray(state?.resources) ? state.resources.filter((/** @type {any} */ entry) => entry?.available) : [];
  if (!player || resources.length === 0) return null;
  return resources.reduce((/** @type {any} */ best, /** @type {any} */ resource) => {
    if (!best) return resource;
    return distance(player, resource) < distance(player, best) ? resource : best;
  }, null);
}

function getNearestAliveMob(/** @type {any} */ state) {
  const player = state?.player ?? null;
  const mobs = Array.isArray(state?.mobs) ? state.mobs.filter((/** @type {any} */ mob) => !mob?.dead && (mob?.hp ?? 0) > 0) : [];
  if (!player || mobs.length === 0) return null;
  return mobs.reduce((/** @type {any} */ best, /** @type {any} */ mob) => {
    if (!best) return mob;
    return distance(player, mob) < distance(player, best) ? mob : best;
  }, null);
}

function findSellSlot(/** @type {any} */ state) {
  return (
    getInventoryItems(state).find(
      (/** @type {any} */ item) =>
        item?.slot != null &&
        item.kind !== 'crystal' &&
        !String(item.kind ?? '').startsWith('armor_')
    ) ?? null
  );
}

function getCurrentVendorOffers(/** @type {any} */ state, /** @type {string} */ vendorId) {
  const cachedOffers = Array.isArray(state?.player?.contractOffersByVendor?.[vendorId])
    ? state.player.contractOffersByVendor[vendorId]
    : [];
  const level = Math.max(1, Math.floor(Number(state?.player?.level) || 1));
  const now = Number.isFinite(state?.serverTime) ? Math.floor(state.serverTime) : Date.now();
  const rotatingOffers = getContractOffersForVendor(vendorId, level, now);
  const dailyOffer =
    cachedOffers.find((/** @type {any} */ offer) => offer?.bonusType === 'daily_commission') ?? null;
  if (!dailyOffer) {
    return rotatingOffers;
  }
  const duplicateIndex = rotatingOffers.findIndex((/** @type {any} */ offer) => offer?.id === dailyOffer.id);
  if (duplicateIndex >= 0) {
    rotatingOffers[duplicateIndex] = {
      ...rotatingOffers[duplicateIndex],
      bonusType: dailyOffer.bonusType,
      resetAt: dailyOffer.resetAt,
    };
    return rotatingOffers;
  }
  return [dailyOffer, ...rotatingOffers];
}

function findOfferToTurnInImmediately(/** @type {any} */ state, /** @type {string} */ vendorId) {
  const offers = getCurrentVendorOffers(state, vendorId);
  const deliveryOffer =
    offers.find(
      (/** @type {any} */ offer) =>
        offer?.kind === 'delivery' &&
        countInventoryKind(state, offer.deliveryItemKind ?? '') >=
          Math.max(1, Number(offer.deliveryItemCount ?? offer.requiredCount ?? 1))
    ) ?? null;
  if (deliveryOffer) return deliveryOffer;
  const herbGatherOffer =
    offers.find((/** @type {any} */ offer) => offer?.kind === 'gather' && offer?.target === 'herb') ?? null;
  if (herbGatherOffer) return herbGatherOffer;
  const herbCount = countInventoryKind(state, 'herb');
  const craftOffer =
    offers.find(
      (/** @type {any} */ offer) =>
        offer?.kind === 'craft' &&
        offer.target === 'herb_health_potion' &&
        herbCount >= Math.max(1, Number(offer.requiredCount ?? 1)) * 2
    ) ?? null;
  if (craftOffer) return craftOffer;
  return offers.find((/** @type {any} */ offer) => offer?.kind === 'gather' && typeof offer?.target === 'string') ?? null;
}

async function acceptTutorialContract(
  /** @type {import('playwright').Page} */ page,
  /** @type {any} */ state,
  /** @type {string} */ vendorId
) {
  let nextState = state;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offer = findOfferToTurnInImmediately(nextState, vendorId);
    if (!offer?.id) {
      throw new Error('No completable tutorial contract is currently available');
    }
    await page.evaluate(
      (/** @type {{ vendorId: string, contractId: string }} */ payload) =>
        window.__game?.contractAccept(payload.vendorId, payload.contractId),
      { vendorId, contractId: offer.id }
    );
    try {
      nextState = await waitForCondition(
        page,
        (/** @type {any} */ refreshedState) =>
          refreshedState.player?.tutorial?.activeStepId === 'turn_in_contract' &&
          Array.isArray(refreshedState.player?.activeContracts) &&
          refreshedState.player.activeContracts.some(
            (/** @type {any} */ contract) =>
              contract?.contractId === offer.id || contract?.templateId === offer.id
          ),
        2500,
        'tutorial accept contract'
      );
      return { state: nextState, offer };
    } catch {
      nextState = await waitForCondition(
        page,
        (/** @type {any} */ refreshedState) => !!refreshedState.player,
        1000,
        'refresh tutorial contract offers'
      );
    }
  }
  throw new Error('Failed to accept a valid tutorial contract after retries');
}

function getActiveContract(/** @type {any} */ state, /** @type {string} */ contractId) {
  const contracts = Array.isArray(state?.player?.activeContracts) ? state.player.activeContracts : [];
  return contracts.find((/** @type {any} */ contract) => contract?.contractId === contractId || contract?.templateId === contractId) ?? null;
}

function getNearestMatchingResource(/** @type {any} */ state, /** @type {string} */ resourceType) {
  const player = state?.player ?? null;
  const resources = Array.isArray(state?.resources)
    ? state.resources.filter((/** @type {any} */ entry) => entry?.available && entry.type === resourceType)
    : [];
  if (!player || resources.length === 0) return null;
  return resources.reduce((/** @type {any} */ best, /** @type {any} */ resource) => {
    if (!best) return resource;
    return distance(player, resource) < distance(player, best) ? resource : best;
  }, null);
}

function createApproachPoint(
  /** @type {{ x: number, z: number } | null | undefined} */ from,
  /** @type {{ x: number, z: number }} */ target,
  /** @type {number} */ stopDistance
) {
  if (!from) return { x: target.x, z: target.z };
  const dx = Number(from.x ?? 0) - Number(target.x ?? 0);
  const dz = Number(from.z ?? 0) - Number(target.z ?? 0);
  const distanceToTarget = Math.hypot(dx, dz);
  if (!(distanceToTarget > stopDistance) || distanceToTarget <= 0.0001) {
    return { x: target.x, z: target.z };
  }
  const scale = stopDistance / distanceToTarget;
  return {
    x: target.x + dx * scale,
    z: target.z + dz * scale,
  };
}

async function completeGatherContract(
  /** @type {import('playwright').Page} */ page,
  /** @type {any} */ state,
  /** @type {any} */ offer
) {
  let nextState = state;
  const contractId = String(offer.id ?? '');
  const harvestRadius = Number(state.world?.harvestRadius ?? 2);

  while (!getActiveContract(nextState, contractId)?.completed) {
    const resource = getNearestMatchingResource(nextState, String(offer.target ?? ''));
    if (!resource) {
      nextState = await waitForCondition(
        page,
        (/** @type {any} */ refreshedState) => !!getNearestMatchingResource(refreshedState, String(offer.target ?? '')),
        TEST_TIMEOUT_MS,
        'wait for gather contract resource'
      );
      continue;
    }

    const activeBefore = getActiveContract(nextState, contractId);
    const progressBefore = Number(activeBefore?.progress ?? 0);
    const approachPoint = createApproachPoint(
      nextState?.player,
      resource,
      Math.max(0.8, harvestRadius - 0.35)
    );
    await moveToPoint(
      page,
      approachPoint,
      (/** @type {any} */ refreshedState) =>
        refreshedState.player && distance(refreshedState.player, resource) <= harvestRadius + 0.6,
      `reach ${offer.target} for tutorial contract`
    );
    await page.evaluate(() => window.__game?.interact());
    nextState = await waitForCondition(
      page,
      (/** @type {any} */ refreshedState) => {
        const activeAfter = getActiveContract(refreshedState, contractId);
        const harvestedNode = Array.isArray(refreshedState?.resources)
          ? refreshedState.resources.find((/** @type {any} */ entry) => entry?.id === resource.id)
          : null;
        return (
          (activeAfter && Number(activeAfter.progress ?? 0) > progressBefore) ||
          (harvestedNode && harvestedNode.available === false)
        );
      },
      TEST_TIMEOUT_MS + 5000,
      `progress ${offer.target} tutorial contract`
    );
  }

  return nextState;
}

async function completeCraftContract(
  /** @type {import('playwright').Page} */ page,
  /** @type {any} */ state,
  /** @type {any} */ offer
) {
  const recipeId = String(offer.target ?? '');
  const craftCount = Math.max(1, Number(offer.requiredCount ?? 1));
  const recipe = getRecipeById(recipeId);
  if (!recipe) {
    throw new Error(`Unknown tutorial craft recipe: ${recipeId}`);
  }
  const outputKind = String(recipe.output?.kind ?? '');
  const outputCount = Math.max(1, Number(recipe.output?.count ?? 1)) * craftCount;
  const outputBefore = countInventoryKind(state, outputKind);
  const inputCountsBefore = recipe.inputs.map((input) => ({
    kind: String(input.kind ?? ''),
    count: countInventoryKind(state, String(input.kind ?? '')),
    expectedDelta: Math.max(1, Number(input.count ?? 1)) * craftCount,
  }));
  await page.evaluate(
    (/** @type {{ recipeId: string, count: number }} */ payload) =>
      window.__game?.craft(payload.recipeId, payload.count),
    {
      recipeId,
      count: craftCount,
    }
  );
  return waitForCondition(
    page,
    (/** @type {any} */ nextState) =>
      countInventoryKind(nextState, outputKind) >= outputBefore + outputCount ||
      inputCountsBefore.every((entry) => countInventoryKind(nextState, entry.kind) <= entry.count - entry.expectedDelta),
    TEST_TIMEOUT_MS,
    'complete tutorial craft contract'
  );
}

async function moveIntoMobRange(
  /** @type {import('playwright').Page} */ page,
  /** @type {any} */ state,
  /** @type {string} */ mobId,
  /** @type {number} */ range
) {
  let nextState = state;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const liveMob = Array.isArray(nextState?.mobs)
      ? nextState.mobs.find((/** @type {any} */ mob) => mob?.id === mobId && !mob.dead)
      : null;
    if (!liveMob) {
      throw new Error(`Tutorial mob ${mobId} disappeared before attack`);
    }
    if (distance(nextState.player, liveMob) <= range + 0.4) {
      return nextState;
    }

    const approachPoint = createApproachPoint(
      nextState?.player,
      liveMob,
      Math.max(0.8, range - 0.2)
    );
    await page.evaluate(
      (/** @type {{ x: number, z: number }} */ point) => window.__game?.moveTo(point.x, point.z),
      approachPoint
    );

    try {
      nextState = await waitForCondition(
        page,
        (/** @type {any} */ refreshedState) => {
          const refreshedMob = Array.isArray(refreshedState?.mobs)
            ? refreshedState.mobs.find((/** @type {any} */ mob) => mob?.id === mobId && !mob.dead)
            : null;
          return refreshedState.player && refreshedMob && distance(refreshedState.player, refreshedMob) <= range + 0.4;
        },
        4000,
        'close tutorial mob distance'
      );
      return nextState;
    } catch {
      nextState = await waitForCondition(
        page,
        (/** @type {any} */ refreshedState) => !!refreshedState.player,
        1500,
        'refresh tutorial movement state'
      );
    }
  }
  throw new Error('Failed to move into tutorial attack range');
}

async function completeTutorialAttack(
  /** @type {import('playwright').Page} */ page,
  /** @type {any} */ state,
  /** @type {string} */ mobId,
  /** @type {number} */ desiredRange
) {
  let nextState = state;
  let currentMobId = mobId;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const liveMob = Array.isArray(nextState?.mobs)
      ? nextState.mobs.find((/** @type {any} */ mob) => mob?.id === currentMobId && !mob.dead)
      : null;
    if (!liveMob) {
      const replacementMob = getNearestAliveMob(nextState);
      if (!replacementMob?.id) {
        throw new Error('No live mob remained for tutorial attack');
      }
      currentMobId = replacementMob.id;
    }
    nextState = await moveIntoMobRange(page, nextState, currentMobId, desiredRange);
    await page.evaluate(
      (/** @type {{ targetId: string }} */ payload) =>
        window.__game?.selectTarget({ kind: 'mob', id: payload.targetId }),
      { targetId: currentMobId }
    );
    await page.evaluate(() => window.__game?.forceAbility(1));
    try {
      return await waitForCondition(
        page,
        (/** @type {any} */ refreshedState) => refreshedState.player?.tutorial?.activeStepId === 'accept_contract',
        2500,
        'tutorial attack'
      );
    } catch {
      nextState = await waitForCondition(
        page,
        (/** @type {any} */ refreshedState) => !!refreshedState.player,
        1500,
        'refresh tutorial combat state'
      );
    }
  }
  throw new Error('Tutorial attack did not advance after repeated attempts');
}

runScenario({
  name: 'tutorial-scenario',
  async run({ createPage, setStage }) {
    setStage('open-page');
    const { page } = await createPage();
    const token = createUniqueToken('tutorial');

    setStage('create-character');
    let state = await signUpAndCreateCharacter(page, {
      username: `${token}_u`,
      password: 'e2e_password',
      characterName: `Tutor ${token.slice(0, 6)}`,
      classId: 'ranger',
    });

    if (state.player?.tutorial?.activeStepId !== 'move') {
      throw new Error(`Expected tutorial to start at "move", got "${state.player?.tutorial?.activeStepId ?? 'none'}"`);
    }

    setStage('tutorial-move');
    await page.evaluate((/** @type {{ x: number, z: number }} */ point) => {
      window.__game?.moveTo(point.x, point.z);
    }, {
      x: Number(state.player?.x ?? 0) + 2,
      z: Number(state.player?.z ?? 0),
    });
    state = await waitForCondition(
      page,
      (/** @type {any} */ nextState) => nextState.player?.tutorial?.activeStepId === 'harvest',
      TEST_TIMEOUT_MS,
      'tutorial move'
    );

    setStage('tutorial-harvest');
    const resource = getNearestAvailableResource(state);
    if (!resource) {
      throw new Error('No available resource found for tutorial harvest');
    }
    const harvestRadius = Number(state.world?.harvestRadius ?? 2);
    const harvestApproachPoint = createApproachPoint(
      state?.player,
      resource,
      Math.max(0.8, harvestRadius - 0.35)
    );
    await moveToPoint(
      page,
      harvestApproachPoint,
      (/** @type {any} */ nextState) => nextState.player && distance(nextState.player, resource) <= harvestRadius + 0.6,
      'reach tutorial resource'
    );
    await page.evaluate(() => window.__game?.interact());
    state = await waitForCondition(
      page,
      (/** @type {any} */ nextState) =>
        nextState.player?.harvest?.resourceId === resource.id ||
        nextState.player?.tutorial?.activeStepId === 'sell',
      TEST_TIMEOUT_MS,
      'start tutorial harvest'
    );
    if (state.player?.tutorial?.activeStepId !== 'sell') {
      state = await waitForCondition(
        page,
        (/** @type {any} */ nextState) => nextState.player?.tutorial?.activeStepId === 'sell',
        TEST_TIMEOUT_MS + 5000,
        'tutorial harvest'
      );
    }

    setStage('tutorial-sell');
    const vendor = getNearestVendor(state);
    if (!vendor) {
      throw new Error('No vendor found for tutorial sell');
    }
    const interactRadius = Number(state.world?.vendorInteractRadius ?? 2.5);
    await moveToPoint(
      page,
      vendor,
      (/** @type {any} */ nextState) => nextState.player && distance(nextState.player, vendor) <= interactRadius - 0.05,
      'reach tutorial vendor'
    );
    const sellItem = findSellSlot(state);
    if (!sellItem) {
      throw new Error('No sellable inventory item found for tutorial step');
    }
    await page.evaluate(
      (/** @type {{ slot: number, vendorId: string }} */ payload) =>
        window.__game?.vendorSell(payload.slot, payload.vendorId),
      { slot: sellItem.slot, vendorId: vendor.id }
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ nextState) => nextState.player?.tutorial?.activeStepId === 'equip',
      TEST_TIMEOUT_MS,
      'tutorial sell'
    );

    setStage('tutorial-equip');
    await page.evaluate(
      (/** @type {{ vendorId: string }} */ payload) =>
        window.__game?.vendorBuy('armor_head_cloth', 1, payload.vendorId),
      { vendorId: vendor.id }
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ nextState) =>
        getInventoryItems(nextState).some((/** @type {any} */ item) => item?.kind === 'armor_head_cloth'),
      TEST_TIMEOUT_MS,
      'buy tutorial armor'
    );
    const headArmor = getInventoryItems(state).find((/** @type {any} */ item) => item?.kind === 'armor_head_cloth');
    if (!headArmor) {
      throw new Error('Purchased armor was not found in inventory');
    }
    await page.evaluate(
      (/** @type {{ fromSlot: number }} */ payload) =>
        window.__game?.equipSwap({
          fromType: 'inventory',
          fromSlot: payload.fromSlot,
          toType: 'equipment',
          toSlot: 'head',
        }),
      { fromSlot: headArmor.slot }
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ nextState) => nextState.player?.tutorial?.activeStepId === 'attack',
      TEST_TIMEOUT_MS,
      'tutorial equip'
    );

    setStage('tutorial-attack');
    const mob = getNearestAliveMob(state);
    if (!mob) {
      throw new Error('No mob found for tutorial attack');
    }
    const weaponRange = Number(state.player?.weapon?.range ?? 2.2);
    const desiredAttackRange = Math.max(2.2, weaponRange - 0.8);
    state = await completeTutorialAttack(page, state, mob.id, desiredAttackRange);

    setStage('tutorial-accept-contract');
    state = await moveToPoint(
      page,
      vendor,
      (/** @type {any} */ nextState) => nextState.player && distance(nextState.player, vendor) <= interactRadius - 0.05,
      'return to tutorial vendor'
    );
    const acceptedContract = await acceptTutorialContract(page, state, vendor.id);
    state = acceptedContract.state;
    const offer = acceptedContract.offer;
    if (offer.kind === 'gather') {
      state = await completeGatherContract(page, state, offer);
    } else if (offer.kind === 'craft') {
      state = await completeCraftContract(page, state, offer);
    }

    setStage('tutorial-turn-in');
    state = await moveToPoint(
      page,
      vendor,
      (/** @type {any} */ nextState) => nextState.player && distance(nextState.player, vendor) <= interactRadius - 0.05,
      'return for tutorial turn-in'
    );
    await page.evaluate(
      (/** @type {{ vendorId: string, contractId: string }} */ payload) =>
        window.__game?.contractTurnIn(payload.vendorId, payload.contractId),
      { vendorId: vendor.id, contractId: offer.id }
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ nextState) =>
        nextState.player?.tutorial?.completed === true &&
        nextState.player?.tutorial?.activeStepId == null,
      TEST_TIMEOUT_MS,
      'tutorial completion'
    );

    const potionCount = countInventoryKind(state, 'consumable_minor_health_potion');
    if (potionCount < 2) {
      throw new Error(`Tutorial reward potions missing: expected at least 2, got ${potionCount}`);
    }
    if ((state.player?.tutorial?.completedStepIds?.length ?? 0) !== 7) {
      throw new Error('Tutorial completed but not all seven steps were recorded');
    }
  },
}).catch((/** @type {any} */ error) => {
  console.error(error);
  process.exit(1);
});
