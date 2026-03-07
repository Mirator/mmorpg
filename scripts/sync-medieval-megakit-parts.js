#!/usr/bin/env node
// @ts-check
import { copyFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'hidden_resources', 'Medieval Village MegaKit[Standard]', 'glTF');
const DEST = join(ROOT, 'client', 'assets', 'medieval', 'parts');

const MODEL_NAMES = [
  'Floor_WoodLight',
  'Floor_WoodDark',
  'Floor_Brick',
  'Floor_RedBrick',
  'Wall_Plaster_Straight',
  'Wall_UnevenBrick_Straight',
  'Wall_Plaster_Door_Flat',
  'Wall_UnevenBrick_Door_Flat',
  'DoorFrame_Flat_WoodDark',
  'DoorFrame_Flat_Brick',
  'Door_2_Flat',
  'Wall_Arch',
  'Corner_Exterior_Wood',
  'Corner_Exterior_Brick',
  'Roof_Wooden_2x1',
  'Roof_RoundTile_2x1',
  'Roof_RoundTiles_6x6',
  'Roof_RoundTiles_6x8',
  'Roof_RoundTiles_6x10',
  'Roof_RoundTiles_8x8',
  'Roof_RoundTiles_8x10',
  'Roof_RoundTiles_8x12',
  'Roof_Front_Brick6',
  'Roof_Front_Brick8',
  'Roof_Tower_RoundTiles',
];

async function copyIfExists(/** @type {string} */ src, /** @type {string} */ dest) {
  if (!existsSync(src)) return false;
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  return true;
}

async function main() {
  if (!existsSync(SRC)) {
    throw new Error(`Source folder not found: ${SRC}`);
  }

  await mkdir(DEST, { recursive: true });
  let copied = 0;

  for (const name of MODEL_NAMES) {
    for (const ext of ['.gltf', '.bin']) {
      const src = join(SRC, `${name}${ext}`);
      const dest = join(DEST, `${name}${ext}`);
      if (await copyIfExists(src, dest)) {
        copied += 1;
        console.log(`[copy] ${name}${ext}`);
      }
    }
  }

  const entries = await readdir(SRC, { withFileTypes: true });
  const textureFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const file of textureFiles) {
    const src = join(SRC, file);
    const dest = join(DEST, file);
    await copyFile(src, dest);
    copied += 1;
    console.log(`[copy] ${file}`);
  }

  console.log(`\nDone: copied ${copied} files into ${DEST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
