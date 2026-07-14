import { mkdir, readFile, rm, stat, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { listDistributionFiles } from './distribution-files.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const sourceSkill = join(repoRoot, '.agents', 'skills', 'argus');
const pluginRoot = join(repoRoot, 'plugins', 'realsee-skills');
const targetSkill = join(pluginRoot, 'skills', 'argus');
const manifestPath = join(pluginRoot, 'copy-manifest.json');
const expectedPluginRoot = join(repoRoot, 'plugins', 'realsee-skills');
const rootPackage = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
const pluginLicense = 'LicenseRef-Realsee-SDK';

const pluginPackage = {
  name: 'realsee-skills',
  version: rootPackage.version,
  private: true,
  type: 'module',
  description: 'Claude plugin packaging for Realsee skills.',
  scripts: {
    validate: 'node scripts/validate-plugin.mjs',
    'doctor:local': 'node scripts/doctor-local-env.mjs'
  },
  dependencies: {},
  devDependencies: {}
};

// No userConfig: the skill resolves credentials at runtime by asking the user
// in chat and (with their consent) persisting them to ~/.realsee/credentials.
// See .agents/skills/argus/SKILL.md.
const pluginMetadata = {
  $schema: 'https://json.schemastore.org/claude-code-plugin-manifest.json',
  name: 'realsee-skills',
  description: 'Realsee Argus for Claude Code: reconstruct 1–99 exact 2:1 panoramas into validated depth, a merged GLB point cloud, poses, and optional intrinsics.',
  author: {
    name: 'Realsee',
    url: 'https://github.com/realsee-developer'
  },
  homepage: 'https://argus.realsee.ai/',
  repository: 'https://github.com/realsee-developer/skills',
  license: pluginLicense,
  keywords: ['realsee', 'argus', 'panorama', 'metric-3d', 'point-cloud', 'depth-map']
};

const validatePluginScript = String.raw`import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const pluginRoot = resolve(import.meta.dirname, '..');
const officialManifest = join(pluginRoot, '.claude-plugin', 'plugin.json');
const wrongManifest = join(pluginRoot, 'plugin.json');
const packagePath = join(pluginRoot, 'package.json');
const pluginLicense = join(pluginRoot, 'LICENSE');
const skillPath = join(pluginRoot, 'skills', 'argus');
const skillFile = join(skillPath, 'SKILL.md');
const skillLicense = join(skillPath, 'LICENSE');
const brandManifest = join(skillPath, 'assets', 'brand', 'manifest.json');
const forbiddenLocalPath = ['', 'Users', ''].join('/');

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('symlink is forbidden: ' + relative(pluginRoot, path));
    if (stat.isDirectory()) files.push(...await walk(path));
    if (stat.isFile()) files.push(path);
  }
  return files;
}

function assertNoWorkspaceOrLinkDeps(pkg, label) {
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[section] ?? {};
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === 'string' && (version.startsWith('workspace:') || version.startsWith('link:'))) {
        throw new Error(label + ' uses forbidden dependency protocol in ' + section + '.' + name);
      }
    }
  }
}

function parseFrontmatterName(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const nameLine = match[1].split('\n').find((line) => line.startsWith('name:'));
  return nameLine ? nameLine.slice('name:'.length).trim() : null;
}

async function containsForbiddenLocalPath(file) {
  let tail = '';
  for await (const chunk of createReadStream(file, { highWaterMark: 64 * 1024 })) {
    const text = tail + chunk.toString('latin1');
    if (text.includes(forbiddenLocalPath)) return true;
    tail = text.slice(-(forbiddenLocalPath.length - 1));
  }
  return false;
}

if (!(await exists(officialManifest))) {
  throw new Error('missing official plugin manifest: .claude-plugin/plugin.json');
}
if (await exists(wrongManifest)) {
  throw new Error('wrong plugin manifest path exists: plugin.json');
}
if (!(await exists(packagePath))) {
  throw new Error('missing package.json');
}
if (!(await exists(pluginLicense))) {
  throw new Error('missing plugin license: LICENSE');
}
if (!(await exists(skillPath))) {
  throw new Error('missing skill directory: skills/argus');
}
if (!(await exists(skillLicense))) {
  throw new Error('missing skill license: skills/argus/LICENSE');
}
if (!(await exists(brandManifest))) {
  throw new Error('missing Argus brand manifest');
}

const files = await walk(pluginRoot);
for (const file of files) {
  if (await containsForbiddenLocalPath(file)) {
    throw new Error('forbidden local user path in ' + relative(pluginRoot, file));
  }
}

assertNoWorkspaceOrLinkDeps(JSON.parse(await readFile(packagePath, 'utf8')), 'plugin package');
const pluginManifest = JSON.parse(await readFile(officialManifest, 'utf8'));
if (pluginManifest.license !== 'LicenseRef-Realsee-SDK') {
  throw new Error('plugin manifest license must be LicenseRef-Realsee-SDK');
}
const skillPackagePath = join(skillPath, 'package.json');
if (await exists(skillPackagePath)) {
  assertNoWorkspaceOrLinkDeps(JSON.parse(await readFile(skillPackagePath, 'utf8')), 'skill package');
}

const skillName = parseFrontmatterName(await readFile(skillFile, 'utf8'));
if (skillName !== 'argus') {
  throw new Error('skill frontmatter name must be argus');
}

console.log('claude plugin validation ok');
`;

const doctorScript = String.raw`import { lstat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const pluginRoot = resolve(import.meta.dirname, '..');
const required = [
  '.claude-plugin/plugin.json',
  'LICENSE',
  'skills/argus',
  'skills/argus/LICENSE',
  'skills/argus/assets/brand/manifest.json',
  'package.json'
];

for (const rel of required) {
  try {
    await lstat(join(pluginRoot, rel));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('missing ' + rel);
    throw new Error('failed to check ' + relative(pluginRoot, join(pluginRoot, rel)) + ': ' + error.message);
  }
}

console.log('claude plugin local env ok');
`;

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

async function writeText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

await stat(sourceSkill);
if (pluginRoot !== expectedPluginRoot) {
  throw new Error('refusing to remove unexpected plugin root: ' + pluginRoot);
}
await rm(pluginRoot, { recursive: true, force: true });
await mkdir(pluginRoot, { recursive: true });
await copyFile(join(repoRoot, 'LICENSE'), join(pluginRoot, 'LICENSE'));
await writeJson(join(pluginRoot, 'package.json'), pluginPackage);
await writeJson(join(pluginRoot, '.claude-plugin', 'plugin.json'), pluginMetadata);
await writeText(join(pluginRoot, 'scripts', 'validate-plugin.mjs'), validatePluginScript);
await writeText(join(pluginRoot, 'scripts', 'doctor-local-env.mjs'), doctorScript);

const copied = [];
const distributionFiles = await listDistributionFiles({ repoRoot, sourceRoot: sourceSkill });
for (const rel of distributionFiles) {
  const source = join(sourceSkill, rel);
  const target = join(targetSkill, rel);
  const sourceStat = await stat(source);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  copied.push({
    source: relative(repoRoot, source),
    target: relative(repoRoot, target),
    size: sourceStat.size
  });
}
await writeJson(manifestPath, {
  source: relative(repoRoot, sourceSkill),
  target: relative(repoRoot, targetSkill),
  files: copied
});

console.log('synced ' + copied.length + ' files to ' + relative(repoRoot, targetSkill));
