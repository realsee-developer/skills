import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { applyArkclawOverlay, ARKCLAW_ENTRYPOINT } from './arkclaw-overlay.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const sourceRoot = join(repoRoot, '.agents', 'skills', 'argus');
const targetRoot = join(repoRoot, 'arkclaw', 'argus');
const expectedTarget = join(repoRoot, 'arkclaw', 'argus');

async function copyTree(source, target) {
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`source symlink is forbidden: ${relative(repoRoot, source)}`);
  }
  if (stat.isDirectory()) {
    await mkdir(target, { recursive: true });
    const entries = await readdir(source, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      await copyTree(join(source, entry.name), join(target, entry.name));
    }
    return;
  }
  if (!stat.isFile()) return;
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

if (targetRoot !== expectedTarget) {
  throw new Error(`refusing to replace unexpected Arkclaw target: ${targetRoot}`);
}

await rm(targetRoot, { recursive: true, force: true });
await copyTree(sourceRoot, targetRoot);

const entrypoint = join(targetRoot, ARKCLAW_ENTRYPOINT);
const original = await readFile(entrypoint, 'utf8');
await writeFile(entrypoint, applyArkclawOverlay(original, ARKCLAW_ENTRYPOINT));

console.log(`synced canonical argus skill to ${relative(repoRoot, targetRoot)} with CN-only entrypoint overlay`);

