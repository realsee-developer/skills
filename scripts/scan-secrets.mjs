import { readdir, readFile, lstat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const signedUrlPattern = /https?:\/\/[^\s"'<>]+\?[^\s"'<>]*(?:X-Amz-|Signature=|sign=|token=|q-ak=|q-signature=|q-sign-algorithm=)/i;
const patterns = [
  [/Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/i, 'authorization bearer token'],
  [/\baccess[_-]?token["'\s:=]+[A-Za-z0-9._-]{16,}/i, 'access token'],
  [/\bupload[_-]?token["'\s:=]+[A-Za-z0-9._-]{16,}/i, 'upload token'],
  [/\btmpSecret(Key|Id)["'\s:=]+[A-Za-z0-9._-]{8,}/, 'temporary secret'],
  [signedUrlPattern, 'signed url']
];
const binaryExtensions = new Set([
  '.7z', '.avif', '.bin', '.exr', '.gif', '.glb', '.gz', '.heic', '.ico', '.jpeg',
  '.jpg', '.mov', '.mp3', '.mp4', '.otf', '.pdf', '.png', '.tar', '.tgz', '.tif',
  '.tiff', '.ttf', '.wasm', '.wav', '.webp', '.woff', '.woff2', '.zip'
]);
const binaryFilenames = new Set(['.DS_Store']);

const signedUrlFixtures = [
  'https://download.invalid/result?response-content-disposition=x&' +
    ['X', 'Amz', 'Signature'].join('-') + '=placeholder',
  'https://download.invalid/result?response-content-disposition=x&' +
    ['q', 'sign', 'algorithm'].join('-') + '=sha1&' +
    ['q', 'ak'].join('-') + '=placeholder&' +
    ['q', 'signature'].join('-') + '=placeholder'
];
for (const fixture of signedUrlFixtures) {
  if (!signedUrlPattern.test(fixture)) throw new Error('signed URL scanner regression');
}

function isTextFile(file) {
  const name = basename(file);
  return !binaryFilenames.has(name) && !binaryExtensions.has(extname(name).toLowerCase());
}

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
  if (!isTextFile(file)) continue;
  const text = await readText(file);
  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) failures.push(`${relative(root, file)}: ${label}`);
  }
}
if (failures.length) throw new Error(`secret scan failed:\n${failures.join('\n')}`);
console.log('secret scan ok');
