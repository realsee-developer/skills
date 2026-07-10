import { spawnSync } from 'node:child_process';
import { copyFile, lstat, mkdir, readdir } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';

const ALWAYS_EXCLUDED = new Set(['.git', 'node_modules']);

function toGitPath(path) {
  return path.split(sep).join('/');
}

export function isGitIgnored(repoRoot, path) {
  const rel = relative(repoRoot, path);
  if (!rel || rel.startsWith('..')) {
    throw new Error(`distribution path is outside the repository: ${path}`);
  }

  const result = spawnSync('git', ['check-ignore', '--no-index', '-q', '--', toGitPath(rel)], {
    cwd: repoRoot,
    stdio: 'ignore'
  });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git check-ignore failed for ${rel} (exit ${result.status ?? 'unknown'})`);
}

export async function listDistributionFiles({ repoRoot, sourceRoot }) {
  const files = [];

  async function walk(path) {
    const name = basename(path);
    if (ALWAYS_EXCLUDED.has(name) || isGitIgnored(repoRoot, path)) return;

    const stat = await lstat(path);
    const rel = relative(sourceRoot, path);
    if (stat.isSymbolicLink()) {
      throw new Error(`source symlink is forbidden: ${relative(repoRoot, path)}`);
    }
    if (stat.isDirectory()) {
      const entries = await readdir(path);
      entries.sort((a, b) => a.localeCompare(b));
      for (const entry of entries) await walk(join(path, entry));
      return;
    }
    if (stat.isFile()) files.push(rel);
  }

  await walk(sourceRoot);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

export async function copyDistributionFiles({ repoRoot, sourceRoot, targetRoot }) {
  const files = await listDistributionFiles({ repoRoot, sourceRoot });
  for (const rel of files) {
    const target = join(targetRoot, rel);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(sourceRoot, rel), target);
  }
  return files;
}
