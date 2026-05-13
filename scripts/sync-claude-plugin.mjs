import { mkdir, readdir, readFile, rm, stat, lstat, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const sourceSkill = join(repoRoot, '.agents', 'skills', 'argus');
const pluginRoot = join(repoRoot, 'plugins', 'realsee-skills');
const targetSkill = join(pluginRoot, 'skills', 'argus');
const manifestPath = join(pluginRoot, 'copy-manifest.json');
const expectedPluginRoot = join(repoRoot, 'plugins', 'realsee-skills');

const pluginPackage = {
  name: 'realsee-skills',
  version: '1.0.1',
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
  description: 'Realsee skills for Claude Code. Exposes the argus skill (Realsee Argus GLB output from local images).',
  author: {
    name: 'Realsee',
    url: 'https://github.com/realsee-developer'
  }
};

const validatePluginScript = String.raw`import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const pluginRoot = resolve(import.meta.dirname, '..');
const officialManifest = join(pluginRoot, '.claude-plugin', 'plugin.json');
const wrongManifest = join(pluginRoot, 'plugin.json');
const packagePath = join(pluginRoot, 'package.json');
const skillPath = join(pluginRoot, 'skills', 'argus');
const skillFile = join(skillPath, 'SKILL.md');

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

if (!(await exists(officialManifest))) {
  throw new Error('missing official plugin manifest: .claude-plugin/plugin.json');
}
if (await exists(wrongManifest)) {
  throw new Error('wrong plugin manifest path exists: plugin.json');
}
if (!(await exists(packagePath))) {
  throw new Error('missing package.json');
}
if (!(await exists(skillPath))) {
  throw new Error('missing skill directory: skills/argus');
}

const files = await walk(pluginRoot);
for (const file of files) {
  const text = await readFile(file, 'utf8');
  if (text.includes(['', 'Users', ''].join('/'))) {
    throw new Error('forbidden local user path in ' + relative(pluginRoot, file));
  }
}

assertNoWorkspaceOrLinkDeps(JSON.parse(await readFile(packagePath, 'utf8')), 'plugin package');
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
  'skills/argus',
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

async function copyTree(source, target, entries) {
  const sourceStat = await lstat(source);
  const rel = relative(sourceSkill, source);
  const targetPath = rel ? join(targetSkill, rel) : target;

  if (sourceStat.isSymbolicLink()) {
    throw new Error('source symlink is forbidden: ' + relative(repoRoot, source));
  }
  if (sourceStat.isDirectory()) {
    await mkdir(targetPath, { recursive: true });
    const children = await readdir(source);
    children.sort();
    for (const child of children) {
      if (child === 'node_modules') continue;
      await copyTree(join(source, child), target, entries);
    }
    return;
  }
  if (!sourceStat.isFile()) return;

  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(source, targetPath);
  entries.push({
    source: relative(repoRoot, source),
    target: relative(repoRoot, targetPath),
    size: sourceStat.size
  });
}

await stat(sourceSkill);
if (pluginRoot !== expectedPluginRoot) {
  throw new Error('refusing to remove unexpected plugin root: ' + pluginRoot);
}
await rm(pluginRoot, { recursive: true, force: true });
await mkdir(pluginRoot, { recursive: true });
await writeJson(join(pluginRoot, 'package.json'), pluginPackage);
await writeJson(join(pluginRoot, '.claude-plugin', 'plugin.json'), pluginMetadata);
await writeText(join(pluginRoot, 'scripts', 'validate-plugin.mjs'), validatePluginScript);
await writeText(join(pluginRoot, 'scripts', 'doctor-local-env.mjs'), doctorScript);

const copied = [];
await copyTree(sourceSkill, targetSkill, copied);
await writeJson(manifestPath, {
  source: relative(repoRoot, sourceSkill),
  target: relative(repoRoot, targetSkill),
  files: copied
});

console.log('synced ' + copied.length + ' files to ' + relative(repoRoot, targetSkill));
