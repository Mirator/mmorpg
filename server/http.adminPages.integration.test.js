import { describe, expect, it } from 'vitest';
import {
  createMockStore,
  createWorldFixture,
  buildHttpApp,
  buildServerConfig,
  installHttpRepoMocks,
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

describe('admin page routes', () => {
  it('serves redesigned admin pages and module screens', async () => {
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
      const dashboard = await requestText(baseUrl, '/admin');
      expect(dashboard.res.status).toBe(200);
      expect(dashboard.text).toContain('Zone List');

      const map = await requestText(baseUrl, '/admin/map');
      expect(map.res.status).toBe(200);
      expect(map.text).toContain('Zone Canvas');

      const placeholders = [
        ['/admin/patches', 'Patch Manager'],
        ['/admin/assets', 'Asset Manager'],
        ['/admin/events', 'Event & Trigger'],
        ['/admin/nav', 'Navmesh'],
        ['/admin/collab', 'Collaboration'],
        ['/admin/playtest', 'Playtest'],
      ];

      for (const [route, marker] of placeholders) {
        const page = await requestText(baseUrl, route);
        expect(page.res.status).toBe(200);
        expect(page.text).toContain(marker);
      }
    } finally {
      await stopHttpTestServer(server);
      files.cleanup();
    }
  });
});
