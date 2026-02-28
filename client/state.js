// @ts-check
import { applyWASD } from '/shared/math.js';

export function createGameState(/** @type {any} */ { interpDelayMs, maxSnapshots, maxSnapshotAgeMs }) {
  const /** @type {any} */ snapshots = [];
  const /** @type {any} */ mobSnapshots = [];
  let /** @type {any} */ latestPlayers = {};
  let /** @type {any} */ latestMe = null;
  let /** @type {any} */ latestResources = [];
  let /** @type {any} */ latestMobs = [];
  let /** @type {any} */ latestCorpses = [];
  let /** @type {any} */ worldConfig = null;
  let /** @type {any} */ configSnapshot = null;
  let /** @type {any} */ myId = null;

  let /** @type {any} */ predictedLocalPos = null;
  const correction = 0.1;
  const snapThreshold = 5;
  const /** @type {Record<string, { x: number, y: number, z: number }>} */ interpolatedPlayers = {};
  const interpolatedLocalPos = { x: 0, y: 0, z: 0 };
  const interpolatedPlayerFrame = /** @type {{ positions: Record<string, { x: number, y: number, z: number }>, localPos: { x: number, y: number, z: number } | null }} */ ({
    positions: interpolatedPlayers,
    localPos: null,
  });
  const /** @type {any[]} */ interpolatedMobs = [];
  const olderMobScratch = new Map();

  let serverTimeOffsetMs = 0;
  let hasServerTime = false;
  let /** @type {any} */ lastServerTimestamp = null;

  function setLocalPlayerId(/** @type {any} */ id) {
    myId = id;
  }

  function setWorldConfig(/** @type {any} */ config) {
    worldConfig = config ?? null;
  }

  function setConfigSnapshot(/** @type {any} */ snapshot) {
    configSnapshot = snapshot ?? null;
  }

  function updateServerTime(/** @type {any} */ serverNow) {
    if (!Number.isFinite(serverNow)) return;
    serverTimeOffsetMs = serverNow - Date.now();
    hasServerTime = true;
    lastServerTimestamp = serverNow;
  }

  function getServerNow() {
    return hasServerTime ? Date.now() + serverTimeOffsetMs : Date.now();
  }

  function getLastServerTimestamp() {
    return lastServerTimestamp;
  }

  function pushSnapshot(/** @type {any} */ players, /** @type {any} */ now) {
    snapshots.push({ t: now, players });
    latestPlayers = players;

    while (snapshots.length > maxSnapshots) {
      snapshots.shift();
    }
    while (snapshots.length > 2 && now - snapshots[0].t > maxSnapshotAgeMs) {
      snapshots.shift();
    }
  }

  function pushMobSnapshot(/** @type {any} */ mobs, /** @type {any} */ now) {
    const arr = Array.isArray(mobs) ? mobs : [];
    mobSnapshots.push({ t: now, mobs: arr.map((/** @type {any} */ m) => ({ ...m })) });

    while (mobSnapshots.length > maxSnapshots) {
      mobSnapshots.shift();
    }
    while (mobSnapshots.length > 2 && now - mobSnapshots[0].t > maxSnapshotAgeMs) {
      mobSnapshots.shift();
    }
  }

  function updateMe(/** @type {any} */ payload) {
    latestMe = payload ?? null;
  }

  function updateResources(/** @type {any} */ resources) {
    latestResources = Array.isArray(resources) ? resources : [];
  }

  function updateMobs(/** @type {any} */ mobs) {
    latestMobs = Array.isArray(mobs) ? mobs : [];
  }

  function updateCorpses(/** @type {any} */ corpses) {
    latestCorpses = Array.isArray(corpses) ? corpses : [];
  }

  function mergePlayers(/** @type {any} */ players, /** @type {any} */ removedIds = []) {
    if (!players || typeof players !== 'object') return;
    latestPlayers = { ...latestPlayers, ...players };
    for (const id of removedIds) {
      delete latestPlayers[id];
    }
  }

  function mergeResources(/** @type {any} */ resources, /** @type {any} */ removedIds = []) {
    if (!Array.isArray(resources)) return;
    const byId = new Map(latestResources.map((/** @type {any} */ r) => [r.id, { ...r }]));
    for (const r of resources) {
      if (r?.id != null) byId.set(r.id, { ...r });
    }
    for (const id of removedIds) {
      byId.delete(id);
    }
    latestResources = Array.from(byId.values());
  }

  function mergeMobs(/** @type {any} */ mobs, /** @type {any} */ removedIds = []) {
    if (!Array.isArray(mobs)) return;
    const byId = new Map(latestMobs.map((/** @type {any} */ m) => [m.id, { ...m }]));
    for (const m of mobs) {
      if (m?.id != null) byId.set(m.id, { ...m });
    }
    for (const id of removedIds) {
      byId.delete(id);
    }
    latestMobs = Array.from(byId.values());
  }

  function mergeCorpses(/** @type {any} */ corpses, /** @type {any} */ removedIds = []) {
    if (!Array.isArray(corpses)) return;
    const byId = new Map(latestCorpses.map((/** @type {any} */ c) => [c.id, { ...c }]));
    for (const c of corpses) {
      if (c?.id != null) byId.set(c.id, { ...c });
    }
    for (const id of removedIds) {
      byId.delete(id);
    }
    latestCorpses = Array.from(byId.values());
  }

  function getLocalPlayer() {
    const publicPlayer = latestPlayers?.[myId];
    if (!publicPlayer) return null;
    if (latestMe && latestMe.id && latestMe.id !== myId) {
      return publicPlayer;
    }
    return { ...publicPlayer, ...(latestMe ?? {}) };
  }

  function renderInterpolatedPlayers(/** @type {any} */ now) {
    if (snapshots.length === 0) {
      for (const id in interpolatedPlayers) {
        delete interpolatedPlayers[id];
      }
      interpolatedPlayerFrame.localPos = null;
      return interpolatedPlayerFrame;
    }

    const renderTime = now - interpDelayMs;
    while (snapshots.length >= 2 && snapshots[1].t <= renderTime) {
      snapshots.shift();
    }

    const older = snapshots[0];
    const newer = snapshots[1] ?? snapshots[0];
    const span = newer.t - older.t;
    let alpha = 0;
    if (span > 0) {
      alpha = (renderTime - older.t) / span;
    }
    alpha = Math.max(0, Math.min(1, alpha));

    const newerPlayers = newer.players ?? {};
    for (const id in newerPlayers) {
      if (!Object.prototype.hasOwnProperty.call(newerPlayers, id)) continue;
      const newerPos = newerPlayers[id];
      const olderPos = older.players?.[id];
      const x = olderPos ? olderPos.x + (newerPos.x - olderPos.x) * alpha : newerPos.x;
      const y = olderPos
        ? (olderPos.y ?? 0) + ((newerPos.y ?? 0) - (olderPos.y ?? 0)) * alpha
        : newerPos.y ?? 0;
      const z = olderPos ? olderPos.z + (newerPos.z - olderPos.z) * alpha : newerPos.z;
      let target = interpolatedPlayers[id];
      if (!target) {
        target = { x, y, z };
        interpolatedPlayers[id] = target;
      } else {
        target.x = x;
        target.y = y;
        target.z = z;
      }
      if (id === myId) {
        interpolatedLocalPos.x = x;
        interpolatedLocalPos.y = y;
        interpolatedLocalPos.z = z;
        interpolatedPlayerFrame.localPos = interpolatedLocalPos;
      }
    }

    for (const id in interpolatedPlayers) {
      if (!Object.prototype.hasOwnProperty.call(newerPlayers, id)) {
        delete interpolatedPlayers[id];
      }
    }
    if (!myId || !Object.prototype.hasOwnProperty.call(newerPlayers, myId)) {
      interpolatedPlayerFrame.localPos = null;
    }

    return interpolatedPlayerFrame;
  }

  function renderInterpolatedMobs(/** @type {any} */ now) {
    if (mobSnapshots.length === 0) return latestMobs;

    const renderTime = now - interpDelayMs;
    while (mobSnapshots.length >= 2 && mobSnapshots[1].t <= renderTime) {
      mobSnapshots.shift();
    }

    const older = mobSnapshots[0];
    const newer = mobSnapshots[1] ?? mobSnapshots[0];
    const span = newer.t - older.t;
    let alpha = 0;
    if (span > 0) {
      alpha = (renderTime - older.t) / span;
    }
    alpha = Math.max(0, Math.min(1, alpha));

    olderMobScratch.clear();
    for (const oldMob of older.mobs) {
      olderMobScratch.set(oldMob.id, oldMob);
    }

    let writeIndex = 0;
    for (const newMob of newer.mobs) {
      const oldMob = olderMobScratch.get(newMob.id);
      const x = oldMob
        ? oldMob.x + (newMob.x - oldMob.x) * alpha
        : newMob.x;
      const y = oldMob
        ? (oldMob.y ?? 0) + ((newMob.y ?? 0) - (oldMob.y ?? 0)) * alpha
        : newMob.y ?? 0;
      const z = oldMob
        ? oldMob.z + (newMob.z - oldMob.z) * alpha
        : newMob.z;
      let target = interpolatedMobs[writeIndex];
      if (!target) {
        target = { x, y, z };
        interpolatedMobs[writeIndex] = target;
      }
      for (const key in newMob) {
        if (key === 'x' || key === 'y' || key === 'z') continue;
        target[key] = newMob[key];
      }
      for (const key in target) {
        if (key === 'x' || key === 'y' || key === 'z') continue;
        if (!Object.prototype.hasOwnProperty.call(newMob, key)) {
          delete target[key];
        }
      }
      target.x = x;
      target.y = y;
      target.z = z;
      writeIndex += 1;
    }
    interpolatedMobs.length = writeIndex;

    return interpolatedMobs;
  }

  function updateLocalPrediction(/** @type {any} */ dt, /** @type {any} */ serverPos, /** @type {any} */ inputKeys, /** @type {any} */ speed) {
    if (!serverPos) return null;

    const serverY = serverPos.y ?? 0;
    if (!predictedLocalPos) {
      predictedLocalPos = { x: serverPos.x, y: serverY, z: serverPos.z };
    } else {
      const errorX = serverPos.x - predictedLocalPos.x;
      const errorZ = serverPos.z - predictedLocalPos.z;
      const errorY = serverY - (predictedLocalPos.y ?? 0);
      const errorDist = Math.hypot(errorX, errorZ);
      if (errorDist > snapThreshold) {
        predictedLocalPos.x = serverPos.x;
        predictedLocalPos.y = serverY;
        predictedLocalPos.z = serverPos.z;
      } else {
        predictedLocalPos.x += errorX * correction;
        predictedLocalPos.y = (predictedLocalPos.y ?? 0) + errorY * correction;
        predictedLocalPos.z += errorZ * correction;
      }
    }

    const dir = applyWASD(inputKeys);
    if (dir.x !== 0 || dir.z !== 0) {
      predictedLocalPos.x += dir.x * speed * dt;
      predictedLocalPos.z += dir.z * speed * dt;
    }

    return predictedLocalPos;
  }

  function resetPrediction(/** @type {any} */ pos) {
    predictedLocalPos = pos ? { x: pos.x, y: pos.y ?? 0, z: pos.z } : null;
  }

  return {
    setLocalPlayerId,
    setWorldConfig,
    setConfigSnapshot,
    updateServerTime,
    getServerNow,
    getLastServerTimestamp,
    pushSnapshot,
    updateMe,
    updateResources,
    updateMobs,
    getLocalPlayer,
    renderInterpolatedPlayers,
    pushMobSnapshot,
    renderInterpolatedMobs,
    updateLocalPrediction,
    resetPrediction,
    reset: () => {
      snapshots.length = 0;
      mobSnapshots.length = 0;
      latestPlayers = {};
      latestMe = null;
      latestResources = [];
      latestMobs = [];
      latestCorpses = [];
      worldConfig = null;
      configSnapshot = null;
      myId = null;
      predictedLocalPos = null;
      serverTimeOffsetMs = 0;
      hasServerTime = false;
      lastServerTimestamp = null;
    },
    getLatestPlayers: () => latestPlayers,
    getLatestResources: () => latestResources,
    getLatestMobs: () => latestMobs,
    getLatestCorpses: () => latestCorpses,
    updateCorpses,
    mergeCorpses,
    mergePlayers,
    mergeResources,
    mergeMobs,
    getWorldConfig: () => worldConfig,
    getConfigSnapshot: () => configSnapshot,
  };
}
