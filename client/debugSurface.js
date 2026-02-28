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
}) {
  const me = gameState.getLocalPlayer();
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
  const serverNow = gameState.getServerNow();
  const vendor = ui.vendorUI?.getVendor?.() ?? null;
  const tradeTab = tradeOpen ? ui.vendorUI?.getTab?.() ?? null : null;
  const currencyCopper = me?.currencyCopper ?? 0;
  const inventorySlotCount =
    me?.invSlots ?? worldConfig?.playerInvSlots ?? inventorySlots.length;
  const inventoryStackMax =
    me?.invStackMax ?? worldConfig?.playerInvStackMax ?? 0;
  const menuState = menu.getState();
  const target = resolveTarget(ctx.selectedTarget, {
    mobs: gameState.getLatestMobs(),
    players: gameState.getLatestPlayers(),
    vendors: worldConfig?.vendors ?? [],
  });

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
      slot: ability.slot,
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
              }
            : null
        )
        .filter(Boolean),
    },
    resources: gameState.getLatestResources().map((/** @type {any} */ r) => ({
      id: r.id,
      x: r.x,
      z: r.z,
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
  };
}

export function installDebugSurface(/** @type {any} */ {
  getTextState,
  connection,
  sendWithSeq,
  combatRef,
  renderSystem,
  combat,
}) {
  window.render_game_to_text = () => JSON.stringify(getTextState());

  window.__game = {
    moveTo: (/** @type {any} */ x, /** @type {any} */ z) => {
      connection.sendMoveTarget({ x, z });
    },
    clearInput: () => {
      connection.sendInput({ w: false, a: false, s: false, d: false });
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
    forceAbility: (/** @type {any} */ slot) => {
      sendWithSeq({ type: 'action', kind: 'ability', slot });
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
