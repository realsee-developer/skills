import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
  cwd: root,
  encoding: 'utf8'
});

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`git status failed (exit ${result.status ?? 'unknown'}): ${result.stderr.trim()}`);
}
if (result.stdout.trim()) {
  throw new Error(`release smoke changed the worktree:\n${result.stdout.trim()}`);
}

console.log('worktree is clean after release smoke');
