#!/usr/bin/env node
/**
 * Converts FBX files from hidden_resources to glTF and places them in client/assets.
 * Run: node scripts/convert-fbx-to-gltf.js
 */
import convert from 'fbx2gltf';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HIDDEN = join(ROOT, 'hidden_resources');
const ASSETS = join(ROOT, 'client', 'assets');

const CONVERSIONS = [
  // Ultimate Food Pack
  {
    src: join(HIDDEN, 'Ultimate Food Pack - Oct 2019/FBX/Bottle1.fbx'),
    dest: join(ASSETS, 'consumables/Bottle1.glb'),
  },
  {
    src: join(HIDDEN, 'Ultimate Food Pack - Oct 2019/FBX/Bottle2.fbx'),
    dest: join(ASSETS, 'consumables/Bottle2.glb'),
  },
  // Medieval Village Pack - Buildings
  {
    src: join(HIDDEN, 'Medieval Village Pack - Dec 2020/Buildings/FBX/House_1.fbx'),
    dest: join(ASSETS, 'environment/House_1.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Village Pack - Dec 2020/Buildings/FBX/Inn.fbx'),
    dest: join(ASSETS, 'environment/Inn.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Village Pack - Dec 2020/Buildings/FBX/House_2.fbx'),
    dest: join(ASSETS, 'environment/House_2.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Village Pack - Dec 2020/Buildings/FBX/House_3.fbx'),
    dest: join(ASSETS, 'environment/House_3.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Village Pack - Dec 2020/Buildings/FBX/House_4.fbx'),
    dest: join(ASSETS, 'environment/House_4.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Village Pack - Dec 2020/Buildings/FBX/Blacksmith.fbx'),
    dest: join(ASSETS, 'environment/Blacksmith.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Village Pack - Dec 2020/Buildings/FBX/Mill.fbx'),
    dest: join(ASSETS, 'environment/Mill.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Village Pack - Dec 2020/Buildings/FBX/Sawmill.fbx'),
    dest: join(ASSETS, 'environment/Sawmill.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Village Pack - Dec 2020/Buildings/FBX/Stable.fbx'),
    dest: join(ASSETS, 'environment/Stable.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Village Pack - Dec 2020/Buildings/FBX/Bell_Tower.fbx'),
    dest: join(ASSETS, 'environment/Bell_Tower.glb'),
  },
  // Medieval Weapons Pack
  {
    src: join(HIDDEN, 'Medieval Weapons Pack by @Quaternius/FBX/Sword.fbx'),
    dest: join(ASSETS, 'weapons/Sword.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Weapons Pack by @Quaternius/FBX/Bow_Wooden.fbx'),
    dest: join(ASSETS, 'weapons/Bow_Wooden.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Weapons Pack by @Quaternius/FBX/Axe.fbx'),
    dest: join(ASSETS, 'weapons/Axe.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Weapons Pack by @Quaternius/FBX/Spear.fbx'),
    dest: join(ASSETS, 'weapons/Spear.glb'),
  },
  {
    src: join(HIDDEN, 'Medieval Weapons Pack by @Quaternius/FBX/Dagger.fbx'),
    dest: join(ASSETS, 'weapons/Dagger.glb'),
  },
  // Ultimate RPG Items Pack - Crystals for resource nodes
  {
    src: join(HIDDEN, 'Ultimate RPG Items Pack - Aug 2019/FBX/Crystal1.fbx'),
    dest: join(ASSETS, 'resources/Crystal1.glb'),
  },
  {
    src: join(HIDDEN, 'Ultimate RPG Items Pack - Aug 2019/FBX/Crystal2.fbx'),
    dest: join(ASSETS, 'resources/Crystal2.glb'),
  },
  {
    src: join(HIDDEN, 'Ultimate RPG Items Pack - Aug 2019/FBX/Crystal3.fbx'),
    dest: join(ASSETS, 'resources/Crystal3.glb'),
  },
];

async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function convertOne({ src, dest }) {
  const { existsSync } = await import('fs');
  if (!existsSync(src)) {
    console.warn(`[skip] Source not found: ${src}`);
    return false;
  }
  if (existsSync(dest)) {
    console.log(`[skip] Already exists: ${dest.replace(ROOT, '')}`);
    return true;
  }
  await ensureDir(dest);
  try {
    await convert(src, dest, []);
    console.log(`[ok] ${src.split('/').pop()} → ${dest.replace(ROOT, '')}`);
    return true;
  } catch (err) {
    console.error(`[fail] ${src}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('Converting FBX → glTF...\n');
  let ok = 0;
  let fail = 0;
  for (const c of CONVERSIONS) {
    const success = await convertOne(c);
    if (success) ok++;
    else fail++;
  }
  console.log(`\nDone: ${ok} converted, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
