// @ts-check

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['client', 'server', 'shared', 'admin', 'scripts', 'e2e'];
const EXCLUDED_PREFIXES = [
  'client/vendor/',
];
const EXCLUDED_FILES = new Set([
  'client/utils/BufferGeometryUtils.js',
]);

/**
 * @param {string} dirPath
 * @returns {string[]}
 */
function walkJsFiles(dirPath) {
  /** @type {string[]} */
  const out = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkJsFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.js')) continue;
    out.push(fullPath);
  }
  return out;
}

/**
 * @param {string} relPath
 * @returns {boolean}
 */
function isTargeted(relPath) {
  if (relPath.endsWith('.test.js')) return false;
  if (EXCLUDED_FILES.has(relPath)) return false;
  for (const prefix of EXCLUDED_PREFIXES) {
    if (relPath.startsWith(prefix)) return false;
  }
  return true;
}

/**
 * @param {string} relPath
 * @returns {boolean}
 */
function hasTsCheck(relPath) {
  const fullPath = path.join(ROOT, relPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split(/\r?\n/, 3);
  if (lines[0]?.startsWith('#!')) {
    return lines[1]?.trim() === '// @ts-check';
  }
  return lines[0]?.trim() === '// @ts-check';
}

/** @type {string[]} */
const missing = [];
/** @type {string[]} */
const checkedFiles = [];

for (const targetDir of TARGET_DIRS) {
  const absoluteDir = path.join(ROOT, targetDir);
  if (!fs.existsSync(absoluteDir)) continue;
  const jsFiles = walkJsFiles(absoluteDir);
  for (const fullPath of jsFiles) {
    const relPath = path.relative(ROOT, fullPath).replaceAll(path.sep, '/');
    if (!isTargeted(relPath)) continue;
    checkedFiles.push(relPath);
    if (!hasTsCheck(relPath)) missing.push(relPath);
  }
}

checkedFiles.sort();
missing.sort();

if (missing.length > 0) {
  console.error('Missing // @ts-check in targeted first-party JS files:');
  for (const relPath of missing) {
    console.error(`- ${relPath}`);
  }
  process.exit(1);
}

console.log(`ts-check coverage OK (${checkedFiles.length} files).`);
