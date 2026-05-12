import { readdir, readFile, lstat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const patterns = [
  [/Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/i, 'authorization bearer token'],
  [/\baccess[_-]?token["'\s:=]+[A-Za-z0-9._-]{16,}/i, 'access token'],
  [/\bupload[_-]?token["'\s:=]+[A-Za-z0-9._-]{16,}/i, 'upload token'],
  [/\btmpSecret(Key|Id)["'\s:=]+[A-Za-z0-9._-]{8,}/, 'temporary secret'],
  [/https?:\/\/[^\s"'<>]+\?(X-Amz-|Signature=|sign=|token=)/i, 'signed url']
];

async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    const stat = await lstat(path);
    if (stat.isDirectory()) result.push(...await files(path));
    if (stat.isFile()) result.push(path);
  }
  return result;
}

async function readText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    throw new Error(`failed to read ${relative(root, file)}: ${error.message}`);
  }
}

const failures = [];
for (const file of await files(root)) {
  const text = await readText(file);
  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) failures.push(`${relative(root, file)}: ${label}`);
  }
}
if (failures.length) throw new Error(`secret scan failed:\n${failures.join('\n')}`);
console.log('secret scan ok');
