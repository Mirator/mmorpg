import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeFailureArtifacts } from './artifacts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.resolve(__dirname, '../../output/e2e');
const PREFIX_PART = 'artifact-self-check';

function listSelfCheckArtifacts() {
  if (!fs.existsSync(ARTIFACT_DIR)) return [];
  return fs.readdirSync(ARTIFACT_DIR).filter((name) => name.includes(PREFIX_PART));
}

function removeSelfCheckArtifacts() {
  for (const fileName of listSelfCheckArtifacts()) {
    fs.rmSync(path.join(ARTIFACT_DIR, fileName), { force: true });
  }
}

function createFakePage() {
  const page = {
    isClosed() {
      return false;
    },
    async screenshot(options) {
      fs.writeFileSync(options.path, 'fake-image', 'utf8');
    },
    async evaluate() {
      return JSON.stringify({ mode: 'test', player: { x: 1, z: 2 } });
    },
  };
  page[Symbol.for('mmorpg.e2e.pageRuntime')] = {
    consoleErrors: ['console failure'],
    pageErrors: ['page failure'],
    requestFailures: ['GET http://localhost/fail :: net::ERR_FAILED'],
  };
  return page;
}

afterEach(() => {
  removeSelfCheckArtifacts();
});

describe('writeFailureArtifacts', () => {
  it('writes the expected diagnostic files under output/e2e', async () => {
    removeSelfCheckArtifacts();
    await writeFailureArtifacts({
      scenarioName: 'artifact-self-check',
      stage: 'forced-failure',
      error: new Error('forced failure'),
      pages: [createFakePage()],
      runId: 'artifact-self-check',
    });

    const files = listSelfCheckArtifacts();
    expect(files.some((name) => name.endsWith('.error.txt'))).toBe(true);
    expect(files.some((name) => name.endsWith('.screenshot.png'))).toBe(true);
    expect(files.some((name) => name.endsWith('.render-state.json'))).toBe(true);
    expect(files.some((name) => name.endsWith('.console.log'))).toBe(true);
  });
});
