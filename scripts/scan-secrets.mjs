import { resolve } from 'node:path';

import {
  createSecretMatchers,
  scanFile,
  walkRepositoryFiles
} from './repository-content-scan.mjs';

const root = resolve(process.cwd());
const failures = [];

for await (const { path, relativePath } of walkRepositoryFiles(root)) {
  let matches;
  try {
    matches = await scanFile(path, createSecretMatchers);
  } catch (error) {
    throw new Error(`failed to read ${relativePath}: ${error.message}`);
  }
  for (const label of matches) failures.push(`${relativePath}: ${label}`);
}

if (failures.length) throw new Error(`secret scan failed:\n${failures.join('\n')}`);
console.log('secret scan ok');
