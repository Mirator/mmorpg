export async function run(/** @type {any} */ ctx) {
  return ctx?.mainFlows?.authFlow?.(ctx);
}
