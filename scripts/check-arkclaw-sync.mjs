import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { applyArkclawOverlay } from './arkclaw-overlay.mjs';
import { listDistributionFiles } from './distribution-files.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const sourceRoot = join(repoRoot, '.agents', 'skills', 'argus');
const targetRoot = join(repoRoot, 'arkclaw', 'argus');

const sourceFiles = await listDistributionFiles({ repoRoot, sourceRoot });
const targetFiles = await listDistributionFiles({ repoRoot, sourceRoot: targetRoot });
const sourceSet = new Set(sourceFiles);
const targetSet = new Set(targetFiles);
const failures = [];

for (const file of sourceFiles) {
  if (!targetSet.has(file)) failures.push(`missing: ${file}`);
}
for (const file of targetFiles) {
  if (!sourceSet.has(file)) failures.push(`extra: ${file}`);
}
for (const file of sourceFiles) {
  if (!targetSet.has(file)) continue;
  const source = await readFile(join(sourceRoot, file));
  const expected = Buffer.from(applyArkclawOverlay(source.toString('utf8'), file));
  const target = await readFile(join(targetRoot, file));
  if (!expected.equals(target)) failures.push(`differs: ${file}`);
}

if (failures.length) {
  throw new Error(`arkclaw sync check failed:\n${failures.join('\n')}`);
}

console.log('arkclaw sync ok (canonical bytes plus deterministic CN-only entrypoint overlay)');
