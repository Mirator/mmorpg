// @ts-check

import { buildDebugTextState, installDebugSurface } from './debugSurface.js';
import { createSocialUi } from './social-ui.js';

/**
 * Wire social UI and debug surface behavior around the core systems.
 *
 * @param {{
 *   ctx: any;
 *   gameState: any;
 *   ui: any;
 *   getConnection: () => any;
 *   menu: any;
 *   auth: any;
 *   combat: any;
 *   renderSystem: any;
 *   getInputKeys: () => any;
 *   getPlayerSpeed: (keys?: any) => number;
 *   connection: any;
 *   sendWithSeq: (msg: any) => void;
 * }} deps
 */
export function setupSocialAndDebug({
  ctx,
  gameState,
  ui,
  getConnection,
  menu,
  auth,
  combat,
  renderSystem,
  getInputKeys,
  getPlayerSpeed,
  connection,
  sendWithSeq,
}) {
  const socialUi = createSocialUi({
    ctx,
    gameState,
    ui,
    getConnection,
  });

  function buildTextState() {
    return buildDebugTextState({
      gameState,
      ui,
      menu,
      auth,
      ctx,
      combat,
      getInputKeys,
      getMovementSpeed: (keys) => getPlayerSpeed(keys),
    });
  }

  installDebugSurface({
    getTextState: buildTextState,
    connection,
    sendWithSeq,
    combatRef: { current: combat },
    renderSystem,
    combat,
    ui,
    ctx,
    getInputKeys,
  });

  return { socialUi };
}

