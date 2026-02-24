// @ts-check
import { tryStartHarvest } from '../../logic/resources.js';
import { tryLootCorpse } from '../../logic/corpses.js';

export function handleInteract(/** @type {any} */ ctx) {
  const { player, resources, corpses, config, persistence } = ctx;
  const harvest = tryStartHarvest(resources, player, Date.now(), {
    harvestRadius: config.resource.harvestRadius,
    harvestDurationMs: config.resource.harvestDurationMs,
    respawnMs: config.resource.respawnMs,
    stackMax: player.invStackMax,
  });
  if (harvest) {
    return;
  }
  const { looted } = tryLootCorpse(corpses ?? [], player, {
    lootRadius: config.corpse?.lootRadius ?? 2.5,
  });
  if (looted) {
    persistence.markDirty(player);
  }
}
