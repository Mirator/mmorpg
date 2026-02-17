/**
 * Responds to client ping with pong for RTT measurement.
 */
export function handlePing(ctx) {
  const { msg, safeSend, ws } = ctx;
  const t = typeof msg.t === 'number' && Number.isFinite(msg.t) ? msg.t : Date.now();
  safeSend(ws, { type: 'pong', t });
}
