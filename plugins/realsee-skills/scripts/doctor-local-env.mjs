import { lstat } from 'node:fs/promises';
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
