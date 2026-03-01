// @ts-check
import { getAbilitiesForClass } from '/shared/classes.js';
import { splitCurrency } from '/shared/economy.js';
import { xpToNext } from '/shared/progression.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { resolveTarget } from './targeting.js';

export function buildDebugTextState(/** @type {any} */ {
  gameState,
  ui,
  menu,
  auth,
  ctx,
  combat,
  getInputKeys,
  getMovementSpeed,
}) {
  const baseMe = gameState.getLocalPlayer();
  const me = baseMe ? { ...baseMe, ...(ctx.latestContracts ?? {}) } : null;
  const inputKeys = getInputKeys?.() ?? null;
  const worldConfig = gameState.getWorldConfig();
  const base = worldConfig?.base ?? null;
  const obstacles = worldConfig?.obstacles ?? [];
  const collisionObstacles = worldConfig?.collisionObstacles ?? obstacles;
  const structures = worldConfig?.structures ?? [];
  const mapSize = worldConfig?.mapSize ?? 0;
  const harvestRadius = worldConfig?.harvestRadius ?? 2;
  const harvestDurationMs = worldConfig?.harvestDurationMs ?? 2_500;
  const inventorySlots = Array.isArray(me?.inventory) ? me.inventory : [];
  const inventoryOpen = ui.isInventoryOpen();
  const tradeOpen = ui.isTradeOpen();
  const dialogOpen = ui.isDialogOpen();
  const classId = ui.getCurrentClassId(me);
  const weaponDef = getEquippedWeapon(me?.equipment, classId);
  const abilities = getAbilitiesForClass(classId, me?.level ?? 1, weaponDef);
  const slottedAbilities = ui.getSlottedAbilities?.(me) ?? [];
  const assignedSlotById = new Map();
  for (let i = 0; i < slottedAbilities.length; i += 1) {
    const ability = slottedAbilities[i];
    if (ability?.id && !assignedSlotById.has(ability.id)) {
      assignedSlotById.set(ability.id, i + 1);
    }
  }
  const serverNow = gameState.getServerNow();
  const vendor = ui.vendorUI?.getVendor?.() ?? null;
  const tradeTab = tradeOpen ? ui.vendorUI?.getTab?.() ?? null : null;
  const currencyCopper = me?.currencyCopper ?? 0;
  const inventorySlotCount =
    me?.invSlots ?? worldConfig?.playerInvSlots ?? inventorySlots.length;
  const inventoryStackMax =
    me?.invStackMax ?? worldConfig?.playerInvStackMax ?? 0;
  const menuState = menu.getState();
  const walking = !!me?.walking;
  const movementMode = (inputKeys?.walk ?? walking) ? 'walk' : 'sprint';
  const movementSpeed = me
    ? (Number(getMovementSpeed?.(inputKeys)) || 0)
    : 0;
  const target = resolveTarget(ctx.selectedTarget, {
    mobs: gameState.getLatestMobs(),
    players: gameState.getLatestPlayers(),
    vendors: worldConfig?.vendors ?? [],
  });
  const latestPlayerMap = gameState.getLatestPlayers?.() ?? {};
  const latestPlayers = Object.values(latestPlayerMap).filter(
    (/** @type {any} */ player) => player?.id && player.id !== ctx.playerId
  );

  return {
    mode: ui.isMenuOpen() ? 'menu' : 'play',
    menu: {
      ...menuState,
      account: auth.getAccount()?.username ?? null,
      character: auth.getCharacter()?.name ?? null,
    },
    coordSystem: {
      origin: 'map center',
      axes: { x: 'right', z: 'down', y: 'up' },
      units: 'world units',
    },
    world: {
      mapSize,
      base,
      harvestRadius,
      harvestDurationMs,
      vendors: worldConfig?.vendors ?? [],
      vendorInteractRadius: worldConfig?.vendorInteractRadius ?? 2.5,
      obstacles: obstacles.map((/** @type {any} */ o) => ({ x: o.x, z: o.z, r: o.r ?? o.radius })),
      collisionObstacles: collisionObstacles.map((/** @type {any} */ o) => ({
        x: o.x,
        z: o.z,
        r: o.r ?? o.radius,
      })),
      structures: structures.map((/** @type {any} */ structure) => ({
        id: structure.id,
        kind: structure.kind,
        x: structure.x,
        z: structure.z,
        rotation: structure.rotation ?? 0,
        colliderRadius: structure.colliderRadius,
        collides: structure.collides !== false,
      })),
    },
    serverTime: gameState.getServerNow(),
    player: me
      ? {
          id: ctx.playerId,
          x: me.x,
          z: me.z,
          hp: me.hp,
          maxHp: me.maxHp,
          classId,
          level: me.level ?? 1,
          xp: me.xp ?? 0,
          xpToNext: me.xpToNext ?? xpToNext(me.level ?? 1),
          attackCooldownUntil: me.attackCooldownUntil ?? 0,
          targetId: me.targetId ?? null,
          targetKind: me.targetKind ?? null,
          resourceType: me.resourceType ?? null,
          resourceMax: me.resourceMax ?? 0,
          resource: me.resource ?? 0,
          abilityCooldowns: me.abilityCooldowns ?? {},
          globalCooldownUntil: me.globalCooldownUntil ?? 0,
          moveSpeedMultiplier: me.moveSpeedMultiplier ?? 1,
          walking,
          movementMode,
          movementSpeed,
          equipment: me.equipment ?? null,
          weapon: weaponDef
            ? {
                kind: weaponDef.kind,
                name: weaponDef.name,
                attackType: weaponDef.attackType,
                range: weaponDef.range,
              }
            : null,
          inv: me.inv,
          invCap: me.invCap,
          invSlots: me.invSlots,
          invStackMax: me.invStackMax,
          currencyCopper,
          currency: splitCurrency(currencyCopper),
          dead: me.dead,
          respawnAt: me.respawnAt ?? 0,
          duelOpponentId: me.duelOpponentId ?? null,
          tutorial: me.tutorial ?? null,
          partyMemberIds: Array.isArray(me.partyMemberIds) ? me.partyMemberIds : [],
          activeContracts: Array.isArray(me.activeContracts) ? me.activeContracts : [],
          contractOffersByVendor: me.contractOffersByVendor ?? {},
          professionMasteries: me.professionMasteries ?? {},
          knownRecipes: Array.isArray(me.knownRecipes) ? me.knownRecipes : [],
          harvest: me.harvest
            ? {
                resourceId: me.harvest.resourceId ?? null,
                resourceType: me.harvest.resourceType ?? null,
                startedAt: me.harvest.startedAt ?? 0,
                endsAt: me.harvest.endsAt ?? 0,
              }
            : null,
        }
      : null,
    target: target
      ? {
          kind: target.kind,
          id: target.id,
          name: target.name ?? null,
          level: target.level ?? null,
          hp: target.hp ?? null,
          maxHp: target.maxHp ?? null,
        }
      : null,
    skills: {
      open: ui.isSkillsOpen(),
    },
    abilities: abilities.map((/** @type {any} */ ability) => ({
      id: ability.id,
      name: ability.name,
      slot: assignedSlotById.get(ability.id) ?? null,
      templateSlot: ability.slot,
      cooldownMs: ability.cooldownMs ?? 0,
      range: ability.range ?? 0,
      attackType: ability.attackType ?? null,
      targetType: ability.targetType ?? 'none',
      targetKind: ability.targetKind ?? null,
      cooldownRemainingMs: Math.max(
        0,
        (ability.id === 'basic_attack'
          ? me?.attackCooldownUntil ?? 0
          : me?.abilityCooldowns?.[ability.id] ?? 0) - serverNow
      ),
    })),
    combat: {
      targetSelectRange: combat.getTargetSelectRange(),
      recentEvents: combat.getCombatEvents()
        .filter((/** @type {any} */ event) => event.attackerId === ctx.playerId)
        .map((/** @type {any} */ event) => ({
          kind: event.kind ?? null,
          attackType: event.attackType ?? null,
          attackerId: event.attackerId ?? null,
          targetId: event.targetId ?? null,
          from: event.from ?? null,
          to: event.to ?? null,
          hit: !!event.hit,
          durationMs: event.durationMs ?? 0,
          impacts: Array.isArray(event.impacts)
            ? event.impacts.map((/** @type {any} */ impact) => ({
                kind: impact.kind ?? null,
                amount: Number.isFinite(impact.amount) ? impact.amount : 0,
                isCrit: !!impact.isCrit,
                targetId: impact.targetId ?? null,
                targetKind: impact.targetKind ?? null,
                x: Number.isFinite(impact.x) ? impact.x : null,
                y: Number.isFinite(impact.y) ? impact.y : null,
                z: Number.isFinite(impact.z) ? impact.z : null,
              }))
            : [],
          t: event.t ?? null,
        })),
    },
    trade: {
      dialogOpen,
      tradeOpen,
      tab: tradeTab,
      vendorId: vendor?.id ?? null,
    },
    inventory: {
      open: inventoryOpen,
      slots: inventorySlotCount,
      stackMax: inventoryStackMax,
      items: inventorySlots
        .map((/** @type {any} */ item, /** @type {any} */ index) =>
          item
            ? {
                slot: index,
                id: item.id ?? null,
                kind: item.kind ?? null,
                name: item.name ?? null,
                count: item.count ?? 0,
                rarity: item.rarity ?? null,
                durability: item.durability ?? null,
                maxDurability: item.maxDurability ?? null,
                craftedProfession: item.craftedProfession ?? null,
                sourceRecipeId: item.sourceRecipeId ?? null,
                isStarter: item.isStarter === true,
              }
            : null
        )
        .filter(Boolean),
    },
    resources: gameState.getLatestResources().map((/** @type {any} */ r) => ({
      id: r.id,
      x: r.x,
      z: r.z,
      type: r.type ?? null,
      available: r.available,
      respawnAt: r.respawnAt ?? 0,
    })),
    mobs: gameState.getLatestMobs().map((/** @type {any} */ m) => ({
      id: m.id,
      x: m.x,
      z: m.z,
      state: m.state,
      targetId: m.targetId ?? null,
      level: m.level ?? 1,
      hp: m.hp ?? 0,
      maxHp: m.maxHp ?? 0,
      dead: !!m.dead,
      respawnAt: m.respawnAt ?? 0,
    })),
    players: latestPlayers.map((/** @type {any} */ player) => ({
      id: player.id,
      name: player.name ?? player.persistName ?? 'Unknown',
      x: player.x ?? player.pos?.x ?? 0,
      z: player.z ?? player.pos?.z ?? 0,
      hp: player.hp ?? 0,
      maxHp: player.maxHp ?? 0,
      level: player.level ?? 1,
      dead: !!player.dead,
      duelOpponentId: player.duelOpponentId ?? null,
    })),
  };
}

export function installDebugSurface(/** @type {any} */ {
  getTextState,
  connection,
  sendWithSeq,
  combatRef,
  renderSystem,
  combat,
  ui,
  ctx,
  getInputKeys,
}) {
  window.render_game_to_text = () => JSON.stringify(getTextState());

  window.__game = {
    moveTo: (/** @type {any} */ x, /** @type {any} */ z) => {
      connection.sendMoveTarget({ x, z });
    },
    clearInput: () => {
      connection.sendInput({
        w: false,
        a: false,
        s: false,
        d: false,
        walk: !!getInputKeys?.()?.walk,
      });
    },
    interact: () => {
      connection.sendInteract();
    },
    inventorySwap: (/** @type {any} */ from, /** @type {any} */ to) => {
      sendWithSeq({ type: 'inventorySwap', from, to });
    },
    equipSwap: (/** @type {any} */ { fromType, fromSlot, toType, toSlot }) => {
      sendWithSeq({ type: 'equipSwap', fromType, fromSlot, toType, toSlot });
    },
    vendorSell: (/** @type {any} */ slot, /** @type {any} */ vendorId) => {
      sendWithSeq({ type: 'vendorSell', slot, vendorId });
    },
    vendorBuy: (/** @type {any} */ kind, /** @type {any} */ count, /** @type {any} */ vendorId) => {
      sendWithSeq({ type: 'vendorBuy', kind, count, vendorId });
    },
    craft: (/** @type {any} */ recipeId, /** @type {any} */ count = 1) => {
      sendWithSeq({ type: 'craft', recipeId, count });
    },
    contractAccept: (/** @type {any} */ vendorId, /** @type {any} */ contractId) => {
      sendWithSeq({ type: 'contractAccept', vendorId, contractId });
    },
    contractAbandon: (/** @type {any} */ contractId) => {
      sendWithSeq({ type: 'contractAbandon', contractId });
    },
    contractTurnIn: (/** @type {any} */ vendorId, /** @type {any} */ contractId) => {
      sendWithSeq({ type: 'contractTurnIn', vendorId, contractId });
    },
    repairItem: (/** @type {any} */ fromType, /** @type {any} */ slot) => {
      sendWithSeq({ type: 'repairItem', fromType, slot });
    },
    salvageItem: (/** @type {any} */ slot) => {
      sendWithSeq({ type: 'salvageItem', slot });
    },
    duelRequest: (/** @type {any} */ targetId) => {
      connection.sendDuelRequest(targetId);
    },
    duelAccept: (/** @type {any} */ challengerId) => {
      connection.sendDuelAccept(challengerId);
    },
    duelDecline: (/** @type {any} */ challengerId) => {
      connection.sendDuelDecline(challengerId);
    },
    duelForfeit: () => {
      connection.sendDuelForfeit();
    },
    tradeRequest: (/** @type {any} */ targetId) => {
      connection.sendTradeRequest(targetId);
    },
    tradeAccept: (/** @type {any} */ traderId) => {
      connection.sendTradeAccept(traderId);
    },
    tradeDecline: (/** @type {any} */ traderId) => {
      connection.sendTradeDecline(traderId);
    },
    tradeOfferAddSlot: (/** @type {any} */ slot) => {
      connection.sendTradeOfferAddSlot(slot);
    },
    tradeOfferAddCopper: (/** @type {any} */ amount) => {
      connection.sendTradeOfferAddCopper(amount);
    },
    tradeConfirm: () => {
      connection.sendTradeConfirm();
    },
    tradeCancel: () => {
      connection.sendTradeCancel();
    },
    forceAbility: (/** @type {any} */ slot) => {
      const payload = ui.getAbilityActionPayload?.(ctx.currentMe, slot);
      if (!payload) return;
      sendWithSeq({ type: 'action', kind: 'ability', ...payload });
    },
    useAbility: (/** @type {any} */ slot) => {
      combatRef.current?.useAbility(slot);
    },
    projectToScreen: (/** @type {any} */ x, /** @type {any} */ z) => {
      return renderSystem.projectToScreen({ x, z });
    },
    getState: () => getTextState(),
    selectTarget: (/** @type {any} */ selection) => {
      combat.selectTarget(selection);
    },
  };
}
