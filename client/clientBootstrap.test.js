import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('client bootstrap shell', () => {
  it('lazy-loads the gameplay runtime instead of statically importing heavy modules', () => {
    const source = fs.readFileSync(path.resolve('client/client.js'), 'utf8');

    expect(source).toContain("import('./game-runtime.js')");
    expect(source).not.toContain("from './render.js'");
    expect(source).not.toContain("from './world.js'");
    expect(source).not.toContain("from './assets.js'");
    expect(source).not.toContain("from './connection.js'");
    expect(source).not.toContain("from './combat.js'");
    expect(source).not.toContain("from './ui-state.js'");
  });
});
