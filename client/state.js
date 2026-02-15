import { applyWASD } from '/shared/math.js';

export function createGameState({ interpDelayMs, maxSnapshots, maxSnapshotAgeMs }) {
  const snapshots = [];
  const mobSnapshots = [];
  let latestPlayers = {};
  let latestMe = null;
  let latestResources = [];
  let latestMobs = [];
  let latestCorpses = [];
  let worldConfig = null;
  let configSnapshot = null;
  let myId = null;

  let predictedLocalPos = null;
  const correction = 0.1;
  const snapThreshold = 5;

  let serverTimeOffsetMs = 0;
  let hasServerTime = false;
  let lastServerTimestamp = null;

  function setLocalPlayerId(id) {
    myId = id;
  }

  function setWorldConfig(config) {
    worldConfig = config ?? null;
  }

  function setConfigSnapshot(snapshot) {
    configSnapshot = snapshot ?? null;
  }

  function updateServerTime(serverNow) {
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

  function pushSnapshot(players, now) {
    snapshots.push({ t: now, players });
    latestPlayers = players;

    while (snapshots.length > maxSnapshots) {
      snapshots.shift();
    }
    while (snapshots.length > 2 && now - snapshots[0].t > maxSnapshotAgeMs) {
      snapshots.shift();
    }
  }

  function pushMobSnapshot(mobs, now) {
    const arr = Array.isArray(mobs) ? mobs : [];
    mobSnapshots.push({ t: now, mobs: arr.map((m) => ({ ...m })) });

    while (mobSnapshots.length > maxSnapshots) {
      mobSnapshots.shift();
    }
    while (mobSnapshots.length > 2 && now - mobSnapshots[0].t > maxSnapshotAgeMs) {
      mobSnapshots.shift();
    }
  }

  function updateMe(payload) {
    latestMe = payload ?? null;
  }

  function updateResources(resources) {
    latestResources = Array.isArray(resources) ? resources : [];
  }

  function updateMobs(mobs) {
    latestMobs = Array.isArray(mobs) ? mobs : [];
  }

  function updateCorpses(corpses) {
    latestCorpses = Array.isArray(corpses) ? corpses : [];
  }

  function mergePlayers(players, removedIds = []) {
    if (!players || typeof players !== 'object') return;
    latestPlayers = { ...latestPlayers, ...players };
    for (const id of removedIds) {
      delete latestPlayers[id];
    }
  }

  function mergeResources(resources, removedIds = []) {
    if (!Array.isArray(resources)) return;
    const byId = new Map(latestResources.map((r) => [r.id, { ...r }]));
    for (const r of resources) {
      if (r?.id != null) byId.set(r.id, { ...r });
    }
    for (const id of removedIds) {
      byId.delete(id);
    }
    latestResources = Array.from(byId.values());
  }

  function mergeMobs(mobs, removedIds = []) {
    if (!Array.isArray(mobs)) return;
    const byId = new Map(latestMobs.map((m) => [m.id, { ...m }]));
    for (const m of mobs) {
      if (m?.id != null) byId.set(m.id, { ...m });
    }
    for (const id of removedIds) {
      byId.delete(id);
    }
    latestMobs = Array.from(byId.values());
  }

  function mergeCorpses(corpses, removedIds = []) {
    if (!Array.isArray(corpses)) return;
    const byId = new Map(latestCorpses.map((c) => [c.id, { ...c }]));
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

  function renderInterpolatedPlayers(now) {
    if (snapshots.length === 0) return { positions: {}, localPos: null };

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

    const positions = {};
    let localPos = null;

    for (const [id, newerPos] of Object.entries(newer.players)) {
      const olderPos = older.players?.[id];
      const x = olderPos ? olderPos.x + (newerPos.x - olderPos.x) * alpha : newerPos.x;
      const y = olderPos
        ? (olderPos.y ?? 0) + ((newerPos.y ?? 0) - (olderPos.y ?? 0)) * alpha
        : newerPos.y ?? 0;
      const z = olderPos ? olderPos.z + (newerPos.z - olderPos.z) * alpha : newerPos.z;
      positions[id] = { x, y, z };
      if (id === myId) {
        localPos = { x, y, z };
      }
    }

    return { positions, localPos };
  }

  function renderInterpolatedMobs(now) {
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

    const olderById = new Map(older.mobs.map((m) => [m.id, m]));
    const result = [];

    for (const newMob of newer.mobs) {
      const oldMob = olderById.get(newMob.id);
      const x = oldMob
        ? oldMob.x + (newMob.x - oldMob.x) * alpha
        : newMob.x;
      const y = oldMob
        ? (oldMob.y ?? 0) + ((newMob.y ?? 0) - (oldMob.y ?? 0)) * alpha
        : newMob.y ?? 0;
      const z = oldMob
        ? oldMob.z + (newMob.z - oldMob.z) * alpha
        : newMob.z;
      result.push({ ...newMob, x, y, z });
    }

    return result;
  }

  function updateLocalPrediction(dt, serverPos, inputKeys, speed) {
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

  function resetPrediction(pos) {
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
