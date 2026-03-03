export async function run(/** @type {any} */ ctx) {
  return ctx?.mainFlows?.targetingAndCombat?.(ctx);
}
