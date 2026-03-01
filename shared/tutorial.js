// @ts-check

/** @typedef {'move' | 'harvest' | 'sell' | 'equip' | 'attack' | 'accept_contract' | 'turn_in_contract'} TutorialStepId */

/** @typedef {{
 *   id: TutorialStepId,
 *   title: string,
 *   hudText: string,
 *   journalText: string,
 * }} TutorialStepDef
 */

/** @type {TutorialStepDef[]} */
export const TUTORIAL_STEPS = [
  {
    id: 'move',
    title: 'Move Around',
    hudText: 'Move with WASD or click the ground.',
    journalText: 'Move with WASD or click the ground to start exploring.',
  },
  {
    id: 'harvest',
    title: 'Harvest a Resource',
    hudText: 'Press E near a resource node to harvest.',
    journalText: 'Find a nearby resource node and press E to harvest it.',
  },
  {
    id: 'sell',
    title: 'Sell Your Loot',
    hudText: 'Visit a vendor and sell one item.',
    journalText: 'Open a vendor and sell one harvested item for copper.',
  },
  {
    id: 'equip',
    title: 'Equip an Item',
    hudText: 'Equip an item from your inventory.',
    journalText: 'Open your inventory and equip one item.',
  },
  {
    id: 'attack',
    title: 'Attack a Target',
    hudText: 'Target an enemy and use an attack.',
    journalText: 'Select an enemy and use an attack ability.',
  },
  {
    id: 'accept_contract',
    title: 'Accept a Contract',
    hudText: 'Accept a vendor contract.',
    journalText: 'Open the Contracts tab at a vendor and accept one contract.',
  },
  {
    id: 'turn_in_contract',
    title: 'Turn In a Contract',
    hudText: 'Complete and turn in your contract.',
    journalText: 'Finish an active contract and turn it in to the issuing vendor.',
  },
];

const STEP_INDEX_BY_ID = new Map(TUTORIAL_STEPS.map((step, index) => [step.id, index]));

/**
 * @returns {{
 *   completed: boolean,
 *   activeStepId: TutorialStepId | null,
 *   completedStepIds: TutorialStepId[],
 *   completedAt?: number,
 * }}
 */
export function createTutorialState() {
  return {
    completed: false,
    activeStepId: TUTORIAL_STEPS[0]?.id ?? null,
    completedStepIds: [],
  };
}

/**
 * @param {any} value
 * @returns {value is TutorialStepId}
 */
export function isTutorialStepId(value) {
  return typeof value === 'string' && STEP_INDEX_BY_ID.has(/** @type {TutorialStepId} */ (value));
}

/**
 * @param {any} raw
 */
export function normalizeTutorialState(raw) {
  const fallback = createTutorialState();
  const completedStepIds = Array.isArray(raw?.completedStepIds)
    ? raw.completedStepIds.filter(isTutorialStepId)
    : [];
  const dedupedCompleted = Array.from(new Set(completedStepIds));
  const completed = !!raw?.completed || dedupedCompleted.length >= TUTORIAL_STEPS.length;
  const activeStepId = completed
    ? null
    : isTutorialStepId(raw?.activeStepId)
      ? raw.activeStepId
      : TUTORIAL_STEPS.find((step) => !dedupedCompleted.includes(step.id))?.id ?? fallback.activeStepId;
  return {
    completed,
    activeStepId,
    completedStepIds: dedupedCompleted,
    ...(Number.isFinite(raw?.completedAt) ? { completedAt: Math.floor(raw.completedAt) } : {}),
  };
}

/**
 * @param {TutorialStepId | null | undefined} stepId
 * @returns {TutorialStepDef | null}
 */
export function getTutorialStep(stepId) {
  if (!stepId || !isTutorialStepId(stepId)) return null;
  return TUTORIAL_STEPS[STEP_INDEX_BY_ID.get(stepId) ?? -1] ?? null;
}

/**
 * @param {any} tutorial
 * @returns {TutorialStepDef | null}
 */
export function getActiveTutorialStep(tutorial) {
  const state = normalizeTutorialState(tutorial);
  return getTutorialStep(state.activeStepId);
}

/**
 * @param {TutorialStepId} stepId
 * @returns {TutorialStepId | null}
 */
export function getNextTutorialStepId(stepId) {
  const index = STEP_INDEX_BY_ID.get(stepId);
  if (typeof index !== 'number') return null;
  return TUTORIAL_STEPS[index + 1]?.id ?? null;
}
