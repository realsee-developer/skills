import { readdir, lstat, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const deniedText = [
  ['/', 'Users', '/'].join(''),
  ['/', 'private', '/'].join(''),
  ['Owner', 'confirmation'].join(' '),
  ['local', 'H5', 'source'].join(' '),
  ['Hard-coded', 'H5', 'credentials'].join(' '),
  ['credential', 'pairs'].join(' '),
  ['live', 'smoked'].join('-'),
  ['live', 'smoke'].join(' '),
  ['i', 'app-gateway', 'realsee', 'com'].join('.'),
  [['ex', 'tracted from'].join(''), 'h5.realsee.ai'].join(' '),
  [['ex', 'tracted from'].join(''), 'h5.realsee.com'].join(' '),
  ['REQUIRED', 'SUB-SKILL'].join(' '),
  ['realsee-skill-workspace', ['realsee-skills-product-tech', 'spec'].join('-') + '.md'].join('/'),
  ['realsee-skills-product-tech', 'spec'].join('-') + '.md',
  ['realsee-skills-implementation', 'plan'].join('-') + '.md'
];
const deniedPaths = [
  ['docs', 'superpowers'].join('/'),
  ['argus', 'openapi', 'evidence'].join('-') + '.md',
  ['live', 'scorecard'].join('-') + '.json',
  ['realsee-skills-product-tech', 'spec'].join('-') + '.md',
  ['realsee-skills-implementation', 'plan'].join('-') + '.md'
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    const rel = relative(root, path);
    for (const needle of deniedPaths) {
      if (rel.includes(needle)) throw new Error(`forbidden path ${needle} in ${rel}`);
    }
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`symlink is forbidden: ${rel}`);
    if (stat.isDirectory()) out.push(...await walk(path));
    if (stat.isFile()) out.push(path);
  }
  return out;
}

async function readText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    throw new Error(`failed to read ${relative(root, file)}: ${error.message}`);
  }
}

for (const file of await walk(root)) {
  const text = await readText(file);
  for (const needle of deniedText) {
    if (text.includes(needle)) throw new Error(`forbidden text ${needle} in ${relative(root, file)}`);
  }
}

console.log('repo boundary ok');
