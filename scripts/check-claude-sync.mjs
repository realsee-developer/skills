import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { listDistributionFiles } from './distribution-files.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const sourceRoot = join(repoRoot, '.agents', 'skills', 'argus');
const targetRoot = join(repoRoot, 'plugins', 'realsee-skills', 'skills', 'argus');

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

if (!(await exists(sourceRoot))) throw new Error('missing canonical source skill');
if (!(await exists(targetRoot))) throw new Error('missing generated skill copy; run npm run sync:claude-plugin');

const sourceFiles = await listDistributionFiles({ repoRoot, sourceRoot });
const targetFiles = await listDistributionFiles({ repoRoot, sourceRoot: targetRoot });
const sourceSet = new Set(sourceFiles);
const targetSet = new Set(targetFiles);
const failures = [];

for (const file of sourceFiles) {
  if (!targetSet.has(file)) failures.push('missing: ' + file);
}
for (const file of targetFiles) {
  if (!sourceSet.has(file)) failures.push('extra: ' + file);
}
for (const file of sourceFiles) {
  if (!targetSet.has(file)) continue;
  const source = await readFile(join(sourceRoot, file));
  const target = await readFile(join(targetRoot, file));
  if (!source.equals(target)) failures.push('differs: ' + file);
}

if (failures.length) {
  throw new Error('claude sync check failed:\n' + failures.join('\n'));
}

console.log('claude sync ok');
