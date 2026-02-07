import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightPath = pathToFileURL(
  path.resolve(process.cwd(), 'node_modules/playwright/index.mjs')
).href;

export async function resolve(specifier, context, defaultResolve) {
  if (specifier === 'playwright') {
    return {
      url: playwrightPath,
      shortCircuit: true,
    };
  }
  return defaultResolve(specifier, context, defaultResolve);
}
