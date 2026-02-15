import { tryHarvest } from '../../logic/resources.js';
import { tryLootCorpse } from '../../logic/corpses.js';

export function handleInteract(ctx) {
  const { player, resources, corpses, config, persistence } = ctx;
  const harvested = tryHarvest(resources, player, Date.now(), {
    harvestRadius: config.resource.harvestRadius,
    respawnMs: config.resource.respawnMs,
    stackMax: player.invStackMax,
  });
  if (harvested) {
    persistence.markDirty(player);
    return;
  }
  const { looted } = tryLootCorpse(corpses ?? [], player, {
    lootRadius: config.corpse?.lootRadius ?? 2.5,
  });
  if (looted) {
    persistence.markDirty(player);
  }
}
