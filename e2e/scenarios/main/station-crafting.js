// @ts-check
export async function run(/** @type {any} */ ctx) {
  return ctx?.mainFlows?.stationCrafting?.(ctx);
}
