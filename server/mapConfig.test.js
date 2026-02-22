import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAP_CONFIG_VERSION } from '../shared/mapConfig.js';
import { createMapConfigHandlers } from './mapConfig.js';

function buildConfig(overrides = {}) {
  return {
    version: MAP_CONFIG_VERSION,
    mapSize: 80,
    base: { x: 0, z: 0, radius: 6 },
    spawnPoints: [{ x: 3, z: 3 }],
    obstacles: [],
    structures: [{ id: 's1', kind: 'market', x: 10, z: 0, colliderRadius: 3 }],
    resourceNodes: [{ id: 'r1', x: 6, z: 6 }],
    vendors: [{ id: 'vendor-1', name: 'Vendor', x: 5, z: -2 }],
    mobSpawns: [{ id: 'm1', x: -8, z: 6 }],
    ...overrides,
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createRequest({ adminSessionHeader, body } = {}) {
  return {
    body,
    query: {},
    get(name) {
      if (name.toLowerCase() !== 'x-admin-session') return undefined;
      return adminSessionHeader;
    },
  };
}

describe('map config handlers', () => {
  it('rejects unauthorized requests', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapcfg-'));
    const filePath = path.join(tmpDir, 'world-map.json');
    fs.writeFileSync(filePath, JSON.stringify(buildConfig()), 'utf8');
    const handlers = createMapConfigHandlers({
      mapConfigPath: filePath,
      isAuthorized: (req) => req.get?.('x-admin-session') === 'session-ok',
    });

    const res = createResponse();
    handlers.getHandler(createRequest({ adminSessionHeader: 'nope' }), res);
    expect(res.statusCode).toBe(401);

    const res2 = createResponse();
    await handlers.putHandler(createRequest({ adminSessionHeader: '', body: {} }), res2);
    expect(res2.statusCode).toBe(401);
  });

  it('serves map config', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapcfg-'));
    const filePath = path.join(tmpDir, 'world-map.json');
    const config = buildConfig();
    fs.writeFileSync(filePath, JSON.stringify(config), 'utf8');
    const handlers = createMapConfigHandlers({
      mapConfigPath: filePath,
      isAuthorized: (req) => req.get?.('x-admin-session') === 'session-ok',
    });

    const res = createResponse();
    handlers.getHandler(createRequest({ adminSessionHeader: 'session-ok' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.mapSize).toBe(config.mapSize);
  });

  it('supports custom authorization callback', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapcfg-'));
    const filePath = path.join(tmpDir, 'world-map.json');
    const config = buildConfig();
    fs.writeFileSync(filePath, JSON.stringify(config), 'utf8');
    const handlers = createMapConfigHandlers({
      mapConfigPath: filePath,
      isAuthorized: (req) => req.query?.allow === '1',
    });

    const req = createRequest({ adminSessionHeader: 'bad' });
    req.query = { allow: '1' };
    const res = createResponse();
    handlers.getHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.mapSize).toBe(config.mapSize);
  });

  it('validates and saves map config', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapcfg-'));
    const filePath = path.join(tmpDir, 'world-map.json');
    fs.writeFileSync(filePath, JSON.stringify(buildConfig()), 'utf8');

    const handlers = createMapConfigHandlers({
      mapConfigPath: filePath,
      isAuthorized: (req) => req.get?.('x-admin-session') === 'session-ok',
    });

    const invalid = buildConfig({
      resourceNodes: [
        { id: 'r1', x: 1, z: 1 },
        { id: 'r1', x: 2, z: 2 },
      ],
    });
    const resInvalid = createResponse();
    await handlers.putHandler(
      createRequest({ adminSessionHeader: 'session-ok', body: invalid }),
      resInvalid
    );
    expect(resInvalid.statusCode).toBe(400);
    expect(Array.isArray(resInvalid.body.details)).toBe(true);

    const next = buildConfig({
      mapSize: 90,
      base: { x: 2, z: -1, radius: 6 },
    });
    const resValid = createResponse();
    await handlers.putHandler(
      createRequest({ adminSessionHeader: 'session-ok', body: next }),
      resValid
    );
    expect(resValid.statusCode).toBe(200);
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(saved.mapSize).toBe(90);
  });
});
