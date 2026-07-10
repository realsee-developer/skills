// Install the canonical Argus skill into $CODEX_HOME/skills/argus.
//
// Strategy: prefer symlink (so edits to the canonical skill flow through
// automatically), fall back to a recursive copy when symlink isn't viable
// (e.g. permission denied, cross-filesystem with no link support).
import { copyFile, lstat, mkdir, readdir, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceSkill = join(root, '.agents', 'skills', 'argus');
const codexHome = process.env.CODEX_HOME;

if (!codexHome) {
  console.error('FAIL: CODEX_HOME is required, for example CODEX_HOME=$HOME/.codex');
  process.exit(1);
}

const targetSkill = join(resolve(codexHome), 'skills', 'argus');

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function copyTree(source, target) {
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`source symlink is forbidden: ${relative(root, source)}`);
  }
  if (stat.isDirectory()) {
    await mkdir(target, { recursive: true });
    const entries = await readdir(source);
    entries.sort();
    for (const entry of entries) {
      if (entry === 'node_modules') continue;
      await copyTree(join(source, entry), join(target, entry));
    }
    return;
  }
  if (stat.isFile()) {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

await lstat(sourceSkill);
await rm(targetSkill, { recursive: true, force: true });
await mkdir(dirname(targetSkill), { recursive: true });

let installMode;
try {
  await symlink(sourceSkill, targetSkill, 'dir');
  installMode = 'symlink';
} catch (error) {
  // Fallback: some filesystems (Windows without SeCreateSymbolicLink, certain
  // sandboxes, cross-volume mounts) reject symlink(); fall back to copy.
  if (!['EPERM', 'EXDEV', 'ENOSYS', 'ENOTSUP'].includes(error.code)) {
    throw error;
  }
  await copyTree(sourceSkill, targetSkill);
  installMode = 'copy';
}

console.log(`installed argus to ${targetSkill} (${installMode})`);

// npm treats a symlink passed via --prefix as a linked package and expects an
// unrelated `argus@<version>` lock entry. Install at the real source path when
// the Codex target is a symlink; copied installs use the target directly.
const dependencyRoot = installMode === 'symlink' ? sourceSkill : targetSkill;
const lockfile = join(dependencyRoot, 'package-lock.json');
if (!(await exists(lockfile))) {
  throw new Error(`cannot install Argus runtime dependencies: missing ${lockfile}`);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const install = spawnSync(
  npmCommand,
  ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: dependencyRoot, stdio: 'inherit', env: process.env }
);
if (install.error) throw install.error;
if (install.status !== 0) {
  throw new Error(`failed to install Argus runtime dependencies (npm exit ${install.status ?? 'unknown'})`);
}
console.log(`installed Argus runtime dependencies in ${targetSkill}`);
