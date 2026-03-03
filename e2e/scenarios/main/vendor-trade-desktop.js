export async function run(/** @type {any} */ ctx) {
  return ctx?.mainFlows?.vendorTradeDesktop?.(ctx);
}
