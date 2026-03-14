import { describe, expect, it } from 'vitest';
import {
  buildHttpApp,
  buildServerConfig,
  createWorldFixture,
  installHttpRepoMocks,
  createMockStore,
  makeTempAssetFile,
  requestText,
  startHttpTestServer,
  stopHttpTestServer,
} from './test/httpHarness.js';

const store = createMockStore();
installHttpRepoMocks(store);

function createAdminFiles() {
  const mapFile = makeTempAssetFile(
    JSON.stringify(
      {
        version: 2,
        mapSize: 40,
        base: { x: 0, z: 0, radius: 4 },
        spawnPoints: [{ x: 0, z: 0 }],
        obstacles: [],
        structures: [],
        resourceNodes: [],
        vendors: [],
        mobSpawns: [],
      },
      null,
      2
    ),
    'world-map.json'
  );
  const designerFile = makeTempAssetFile('{}', 'world-map.designer.json');
  return {
    mapPath: mapFile.filePath,
    designerStatePath: designerFile.filePath,
    cleanup() {
      mapFile.cleanup();
      designerFile.cleanup();
    },
  };
}

describe('static client boot assets', () => {
  it('serves client config and immutable versioned asset headers', async () => {
    const files = createAdminFiles();
    const config = buildServerConfig();
    const world = createWorldFixture();
    const app = await buildHttpApp({
      config,
      world,
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startHttpTestServer(app);
    try {
      const configScript = await requestText(baseUrl, '/client-config.js');
      expect(configScript.res.status).toBe(200);
      expect(configScript.text).toContain('assetVersion');
      expect(configScript.text).toContain('0.1.0');

      const immutableAsset = await fetch(`${baseUrl}/assets/ui/theme-pro/loading-sigil.svg?v=0.1.0`);
      expect(immutableAsset.status).toBe(200);
      expect(immutableAsset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

      const regularAsset = await fetch(`${baseUrl}/assets/ui/theme-pro/loading-sigil.svg`);
      expect(regularAsset.status).toBe(200);
      expect(regularAsset.headers.get('cache-control')).not.toContain('immutable');
    } finally {
      await stopHttpTestServer(server);
      files.cleanup();
    }
  });
});
