// Build the Arkclaw distribution ZIP from the generated canonical skill copy.
// Run `npm run sync:arkclaw` first; package.json wires that automatically.
//
// Output layout (per agentskills.io spec — top-level entry is the skill dir):
//   argus.zip
//     argus/
//       SKILL.md
//       README.md
//       package.json
//       package-lock.json
//       scripts/
//       src/
//       references/
//
// Excludes: node_modules/, .DS_Store, .git/, anything matching .gitignore.
//
// Requires the `zip` command on PATH (standard on macOS/Linux; on Windows use
// WSL or Git Bash, or install Info-ZIP).

import { mkdir, rm, stat, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { listDistributionFiles } from './distribution-files.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const skillSource = join(repoRoot, 'arkclaw', 'argus');
const distDir = join(repoRoot, 'dist', 'arkclaw');
const zipPath = join(distDir, 'argus.zip');
export const ARKCLAW_MAX_ZIP_BYTES = 10_000_000;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function assertFrontmatterMatchesArkclawSpec(activeSkillSource) {
  const skillMd = join(activeSkillSource, 'SKILL.md');
  const text = await readFile(skillMd, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error('SKILL.md is missing YAML frontmatter');
  const body = match[1];

  const nameMatch = body.match(/^name:\s*(.+)$/m);
  if (!nameMatch || nameMatch[1].trim() !== 'argus') {
    throw new Error('SKILL.md frontmatter `name` must be `argus`');
  }
  const description = body.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!description) throw new Error('SKILL.md frontmatter `description` must be non-empty');
  if (description.length > 1024) throw new Error('SKILL.md `description` exceeds 1024 characters');

  // arkclaw onboarding form requires a version field. We carry it under
  // `metadata.version` so we stay agentskills.io-spec-compliant at the top
  // level.
  const versionMatch = body.match(/^\s*version:\s*['"]?([^\s'"]+)/m);
  if (!versionMatch) {
    throw new Error('SKILL.md frontmatter must include metadata.version for arkclaw');
  }

  const pkg = await readJson(join(activeSkillSource, 'package.json'));
  if (pkg.version !== versionMatch[1]) {
    throw new Error(
      `package.json version (${pkg.version}) does not match SKILL.md metadata.version (${versionMatch[1]})`
    );
  }
}

export async function buildArkclawZip(options = {}) {
  const activeRepoRoot = options.repoRoot ?? repoRoot;
  const activeSkillSource = options.skillSource ?? skillSource;
  const activeDistDir = options.distDir ?? distDir;
  const activeZipPath = options.zipPath ?? join(activeDistDir, 'argus.zip');

  if (!(await exists(activeSkillSource))) {
    throw new Error(`missing arkclaw skill source: ${relative(activeRepoRoot, activeSkillSource)}`);
  }

  await assertFrontmatterMatchesArkclawSpec(activeSkillSource);

  await mkdir(activeDistDir, { recursive: true });
  if (await exists(activeZipPath)) {
    await rm(activeZipPath);
  }

  // Enumerate the exact distributable files first. This applies the repository
  // .gitignore to every entry, so ignored credentials and local artifacts can
  // never enter the archive even if someone injects them directly under the
  // generated Arkclaw tree after sync.
  const files = await listDistributionFiles({ repoRoot: activeRepoRoot, sourceRoot: activeSkillSource });
  if (files.length === 0) throw new Error('Arkclaw distribution contains no files');
  const parent = dirname(activeSkillSource);
  const entry = basename(activeSkillSource);
  const archiveEntries = files.map((file) => `${entry}/${file.split(sep).join('/')}`);
  const args = ['-q', activeZipPath, '--', ...archiveEntries];
  const result = spawnSync('zip', args, { cwd: parent, stdio: 'inherit' });
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error('`zip` command not found on PATH — install Info-ZIP and retry');
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`zip failed with exit code ${result.status}`);
  }

  const archiveStat = await stat(activeZipPath);
  if (archiveStat.size > ARKCLAW_MAX_ZIP_BYTES) {
    await rm(activeZipPath, { force: true });
    throw new Error(
      `Arkclaw ZIP is ${archiveStat.size} bytes and exceeds Arkclaw 10 MB limit (${ARKCLAW_MAX_ZIP_BYTES} bytes)`
    );
  }
  console.log(
    `arkclaw zip ok: ${relative(activeRepoRoot, activeZipPath)} (${(archiveStat.size / 1024).toFixed(1)} KB)`
  );
  return activeZipPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildArkclawZip().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
