import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

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

async function listFiles(root) {
  const files = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const path = join(dir, entry.name);
      const stat = await lstat(path);
      const rel = relative(root, path);
      if (stat.isSymbolicLink()) throw new Error('symlink is forbidden: ' + rel);
      if (stat.isDirectory()) await walk(path);
      if (stat.isFile()) files.push(rel);
    }
  }

  await walk(root);
  return files;
}

if (!(await exists(sourceRoot))) throw new Error('missing canonical source skill');
if (!(await exists(targetRoot))) throw new Error('missing generated skill copy; run npm run sync:claude-plugin');

const sourceFiles = await listFiles(sourceRoot);
const targetFiles = await listFiles(targetRoot);
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
