import { describe, expect, it } from 'vitest';
import { ASSET_PATHS } from './assetPaths.js';
import { createItemPreviewResolver, getItemPreviewSource } from './itemPreview.js';

describe('item preview source resolution', () => {
  it('maps known weapon and resource kinds to model paths', () => {
    const weapon = getItemPreviewSource('weapon_training_sword');
    expect(weapon?.modelPath).toBe(ASSET_PATHS.weapons.sword);
    expect(weapon?.category).toBe('weapon');

    const ore = getItemPreviewSource('ore');
    expect(ore?.modelPath).toBe(ASSET_PATHS.resourceNodes.ore);
    expect(ore?.category).toBe('material');
  });

  it('falls back to category placeholders for unknown kinds', () => {
    const source = getItemPreviewSource('mysterious_artifact');
    expect(source?.modelPath).toBe(null);
    expect(source?.category).toBe('misc');
  });
});

describe('item preview resolver cache behavior', () => {
  it('deduplicates in-flight renders and caches the result', async () => {
    let renderCalls = 0;
    const resolver = createItemPreviewResolver({
      renderThumbnail: async () => {
        renderCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'data:image/png;base64,test';
      },
      maxEntries: 32,
    });

    const [a, b] = await Promise.all([
      resolver.resolveItemPreviewKind('weapon_training_sword'),
      resolver.resolveItemPreviewKind('weapon_training_sword'),
    ]);

    expect(a).toBe('data:image/png;base64,test');
    expect(b).toBe('data:image/png;base64,test');
    expect(renderCalls).toBe(1);
    expect(resolver.getCached('weapon_training_sword')).toBe('data:image/png;base64,test');
  });

  it('stores null fallback on renderer failure', async () => {
    const resolver = createItemPreviewResolver({
      renderThumbnail: async () => null,
      maxEntries: 32,
    });
    const value = await resolver.resolveItemPreviewKind('weapon_training_sword');
    expect(value).toBe(null);
    expect(resolver.getCached('weapon_training_sword')).toBe(null);
  });
});
