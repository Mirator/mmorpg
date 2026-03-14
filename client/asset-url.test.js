import { describe, expect, it } from 'vitest';
import { assetUrl, getClientAssetVersion } from './asset-url.js';

describe('assetUrl', () => {
  it('appends the configured version to managed asset paths', () => {
    const windowLike = {
      __MMORPG_CLIENT_CONFIG__: { assetVersion: '0.1.0' },
      location: { origin: 'http://localhost:3000' },
    };

    expect(assetUrl('/assets/monsters/Orc.gltf', { windowLike })).toBe('/assets/monsters/Orc.gltf?v=0.1.0');
    expect(assetUrl('/assets/monsters/Orc.gltf?quality=high', { windowLike })).toBe(
      '/assets/monsters/Orc.gltf?quality=high&v=0.1.0'
    );
  });

  it('leaves unmanaged or pre-versioned paths unchanged', () => {
    const windowLike = {
      __MMORPG_CLIENT_CONFIG__: { assetVersion: '0.1.0' },
      location: { origin: 'http://localhost:3000' },
    };

    expect(assetUrl('/shared/classes.js', { windowLike })).toBe('/shared/classes.js');
    expect(assetUrl('/assets/monsters/Orc.gltf?v=keep', { windowLike })).toBe(
      '/assets/monsters/Orc.gltf?v=keep'
    );
  });

  it('returns an empty version when client config is missing', () => {
    expect(getClientAssetVersion({})).toBe('');
    expect(assetUrl('/assets/monsters/Orc.gltf', { windowLike: {} })).toBe('/assets/monsters/Orc.gltf');
  });
});
