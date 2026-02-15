import * as party from './party.js';
import * as chat from './chat.js';
import * as player from './player.js';
import * as interact from './interact.js';
import * as inventory from './inventory.js';
import * as ability from './ability.js';
import * as vendor from './vendor.js';
import * as craft from './craft.js';

/**
 * Returns an array of [match, handler] for message dispatch.
 * match(msg) returns true if the handler should process this message.
 * Each handler receives (ctx) with player, players, msg, etc.
 */
export function createMessageHandlers() {
  return [
    [(msg) => msg.type === 'respawn', player.handleRespawn],
    [(msg) => msg.type === 'partyInvite', party.handlePartyInvite],
    [(msg) => msg.type === 'partyAccept', party.handlePartyAccept],
    [(msg) => msg.type === 'partyLeave', party.handlePartyLeave],
    [(msg) => msg.type === 'chat', chat.handleChat],
    [(msg) => msg.type === 'input', player.handleInput],
    [(msg) => msg.type === 'moveTarget', player.handleMoveTarget],
    [(msg) => msg.type === 'targetSelect', player.handleTargetSelect],
    [(msg) => msg.type === 'action' && msg.kind === 'interact', interact.handleInteract],
    [(msg) => msg.type === 'classSelect', player.handleClassSelect],
    [(msg) => msg.type === 'inventorySwap', inventory.handleInventorySwap],
    [(msg) => msg.type === 'equipSwap', inventory.handleEquipSwap],
    [(msg) => msg.type === 'action' && msg.kind === 'ability', ability.handleAbility],
    [(msg) => msg.type === 'vendorSell', vendor.handleVendorSell],
    [(msg) => msg.type === 'vendorBuy', vendor.handleVendorBuy],
    [(msg) => msg.type === 'craft', craft.handleCraft],
  ];
}
