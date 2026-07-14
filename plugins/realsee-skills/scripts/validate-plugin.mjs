import { createReadStream } from 'node:fs';
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
