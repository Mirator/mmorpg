// @ts-check

import {
  abandonContract,
  acceptContract,
  getContractSyncPayload,
  turnInContract,
} from '../../logic/contracts.js';
import { applyTutorialProgress } from '../../logic/tutorial.js';

function findVendorInRange(/** @type {any} */ world, /** @type {any} */ player, /** @type {any} */ vendorId) {
  const vendor = world?.vendors?.find?.((/** @type {any} */ entry) => entry.id === vendorId) ?? null;
  if (!vendor || !player?.pos) return null;
  const maxDist = world.vendorInteractRadius ?? 2.5;
  const dist = Math.hypot((player.pos.x ?? 0) - vendor.x, (player.pos.z ?? 0) - vendor.z);
  if (dist > maxDist) return null;
  return vendor;
}

function syncContracts(/** @type {any} */ ctx, /** @type {any} */ now = Date.now()) {
  const { player, safeSend, ws, sendPrivateState } = ctx;
  const payload = getContractSyncPayload(player, now);
  safeSend(ws, {
    type: 'contracts',
    offersByVendor: payload.offersByVendor,
    activeContracts: payload.activeContracts,
  });
  sendPrivateState?.(ws, player, now);
  return payload;
}

export function handleContractAccept(/** @type {any} */ ctx) {
  const { player, msg, safeSend, ws, persistence } = ctx;
  if (!findVendorInRange(ctx.world, player, msg.vendorId)) {
    safeSend(ws, { type: 'contractResult', action: 'accept', contractId: msg.contractId, ok: false, error: 'out_of_range' });
    return;
  }
  const result = acceptContract(player, msg.vendorId, msg.contractId, Date.now());
  if (result.ok) {
    const tutorialResult = applyTutorialProgress(player, 'accept_contract');
    if (tutorialResult.changed) {
      persistence.markDirty(player);
    }
    persistence.markDirty(player);
    syncContracts(ctx);
  } else {
    safeSend(ws, { type: 'contractResult', action: 'accept', contractId: msg.contractId, ok: false, error: result.error });
  }
}

export function handleContractAbandon(/** @type {any} */ ctx) {
  const { player, msg, safeSend, ws, persistence } = ctx;
  const result = abandonContract(player, msg.contractId);
  if (result.ok) {
    persistence.markDirty(player);
    syncContracts(ctx);
  } else {
    safeSend(ws, { type: 'contractResult', action: 'abandon', contractId: msg.contractId, ok: false, error: result.error });
  }
}

export function handleContractTurnIn(/** @type {any} */ ctx) {
  const { player, msg, safeSend, ws, persistence, sendPrivateState } = ctx;
  if (!findVendorInRange(ctx.world, player, msg.vendorId)) {
    safeSend(ws, { type: 'contractResult', action: 'turn_in', contractId: msg.contractId, ok: false, error: 'out_of_range' });
    return;
  }
  const result = turnInContract(player, msg.vendorId, msg.contractId, Date.now());
  if (!result.ok) {
    safeSend(ws, { type: 'contractResult', action: 'turn_in', contractId: msg.contractId, ok: false, error: result.error });
    return;
  }
  const tutorialResult = applyTutorialProgress(player, 'turn_in_contract', {
    now: Date.now(),
    nextItemIdRef: ctx.nextItemIdRef,
  });
  persistence.markDirty(player);
  if (result.rewards?.professionMasteries) {
    safeSend(ws, {
      type: 'masteryUpdated',
      professionMasteries: result.rewards.professionMasteries,
      unlockedRecipeIds: result.rewards.unlockedRecipeIds ?? [],
    });
  }
  safeSend(ws, {
    type: 'contractResult',
    action: 'turn_in',
    contractId: msg.contractId,
    ok: true,
    rewards: result.rewards,
  });
  if (tutorialResult.changed || tutorialResult.rewarded) {
    sendPrivateState?.(ws, player, Date.now());
  }
  syncContracts(ctx);
}

export function handleContractSyncOnConnect(/** @type {any} */ ctx) {
  syncContracts(ctx);
}
