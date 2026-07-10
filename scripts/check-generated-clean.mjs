import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedPaths = ['plugins/realsee-skills', 'arkclaw/argus'];
const result = spawnSync(
  'git',
  ['status', '--porcelain=v1', '--untracked-files=all', '--', ...generatedPaths],
  { cwd: root, encoding: 'utf8' }
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`git status failed (exit ${result.status ?? 'unknown'}): ${result.stderr.trim()}`);
}
if (result.stdout.trim()) {
  throw new Error(
    `generated distributions drift after rebuild; commit the canonical rebuild output:\n${result.stdout.trim()}`
  );
}

console.log('generated distributions are clean after rebuild');
