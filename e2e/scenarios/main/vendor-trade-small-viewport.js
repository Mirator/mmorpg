export async function run(/** @type {any} */ ctx) {
  return ctx?.mainFlows?.vendorTradeSmallViewport?.(ctx);
}
