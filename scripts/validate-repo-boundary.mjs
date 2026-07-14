import { resolve } from 'node:path';

import {
  createLiteralMatcher,
  scanFile,
  walkRepositoryFiles
} from './repository-content-scan.mjs';

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
  [['ex', 'tracted from'].join(''), 'h5.realsee.cn'].join(' '),
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

const files = walkRepositoryFiles(root, {
  onEntry({ relativePath, stats }) {
    for (const needle of deniedPaths) {
      if (relativePath.includes(needle)) throw new Error(`forbidden path ${needle} in ${relativePath}`);
    }
    if (stats.isSymbolicLink()) throw new Error(`symlink is forbidden: ${relativePath}`);
  }
});

for await (const { path, relativePath } of files) {
  let matches;
  try {
    matches = await scanFile(
      path,
      () => [createLiteralMatcher(deniedText)],
      { stopAfterFirst: true }
    );
  } catch (error) {
    throw new Error(`failed to read ${relativePath}: ${error.message}`);
  }
  if (matches.length > 0) {
    throw new Error(`forbidden text ${matches[0]} in ${relativePath}`);
  }
}

console.log('repo boundary ok');
