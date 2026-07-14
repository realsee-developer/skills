import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const skillRoot = join(root, '.agents', 'skills', 'argus');
const userDocGlobs = [
  join(skillRoot, 'README.md'),
  join(skillRoot, 'SKILL.md'),
  join(skillRoot, 'references')
];

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertFile(path, label) {
  const stat = await lstat(path);
  if (!stat.isFile()) {
    throw new Error(`${label} must be a file: ${relative(root, path)}`);
  }
}

async function assertMissing(path, label) {
  if (await exists(path)) {
    throw new Error(`${label} must not exist: ${relative(root, path)}`);
  }
}

async function walkFiles(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`symlink is forbidden: ${relative(root, path)}`);
  }
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) return [];

  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    files.push(...await walkFiles(join(path, entry.name)));
  }
  return files;
}

function frontmatterName(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return undefined;
  const nameLine = match[1].split(/\r?\n/).find((line) => line.trim().startsWith('name:'));
  return nameLine?.slice(nameLine.indexOf(':') + 1).trim().replace(/^['"]|['"]$/g, '');
}

await assertFile(join(skillRoot, 'SKILL.md'), 'Skill definition');
await assertFile(join(skillRoot, 'README.md'), 'Skill README');
await assertFile(join(skillRoot, 'LICENSE'), 'Skill license');
await assertMissing(join(skillRoot, 'agents', 'openai.yaml'), 'OpenAI agent config');

for (const file of await walkFiles(skillRoot)) {
  if (relative(skillRoot, file).split(/[/\\]/).join('/') === 'agents/openai.yaml') {
    throw new Error(`OpenAI agent config must not exist under skill: ${relative(root, file)}`);
  }
}

const skillText = await readFile(join(skillRoot, 'SKILL.md'), 'utf8');
if (frontmatterName(skillText) !== 'argus') {
  throw new Error('SKILL.md frontmatter name must be argus');
}
const skillPackage = JSON.parse(await readFile(join(skillRoot, 'package.json'), 'utf8'));
if (skillPackage.license !== 'SEE LICENSE IN LICENSE') {
  throw new Error('Skill package must reference its bundled LICENSE');
}

const docFiles = [];
for (const path of userDocGlobs) {
  if (await exists(path)) {
    docFiles.push(...await walkFiles(path));
  }
}

const publicArgusConfig = /\bARGUS_[A-Z0-9_]*\b/g;
const failures = [];
for (const file of docFiles) {
  const text = await readFile(file, 'utf8');
  const matches = [...new Set(text.match(publicArgusConfig) ?? [])];
  if (matches.length) {
    failures.push(`${relative(root, file)}: public docs must use REALSEE_* config names, found ${matches.join(', ')}`);
  }
}

if (failures.length) {
  throw new Error(`skill validation failed:\n${failures.join('\n')}`);
}

console.log('skill validation ok');
