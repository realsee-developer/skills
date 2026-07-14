import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import {
  createLiteralMatcher,
  createSecretMatchers
} from '../scripts/repository-content-scan.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const secretScanner = join(repoRoot, 'scripts', 'scan-secrets.mjs');
const boundaryScanner = join(repoRoot, 'scripts', 'validate-repo-boundary.mjs');

test('secret matchers retain every rule across every possible chunk split', () => {
  const token = ['not', 'a', 'real', 'secret', 'value'].join('-');
  const fixtures = [
    { text: ['access', 'token'].join('_') + ' = ' + token, label: 'access token' },
    { text: ['upload', 'token'].join('-') + ': ' + token, label: 'upload token' },
    { text: ['tmp', 'Secret', 'Key'].join('') + "='placeholder'", label: 'temporary secret' },
    {
      text: ['Author', 'ization'].join('') + ': Bearer ' + token,
      label: 'authorization bearer token'
    },
    {
      text: 'https://download.invalid/result?safe=x&' + ['X', 'Amz', 'Expires'].join('-') + '=60',
      label: 'signed url'
    }
  ];

  for (const { text, label } of fixtures) {
    for (let split = 0; split <= text.length; split += 1) {
      assert.ok(scanSecretChunks([text.slice(0, split), text.slice(split)]).has(label), `${label} split ${split}`);
    }
  }
});

test('secret matchers handle separators and signed URLs longer than one stream chunk', () => {
  const token = ['not', 'a', 'real', 'secret', 'value'].join('-');
  const keyed = ['access', 'token'].join('_') + ' '.repeat(70 * 1024) + token;
  assert.ok(scanSecretChunks(splitChunks(keyed)).has('access token'));

  const signed = 'https://download.invalid/result?padding=' + 'a'.repeat(70 * 1024) + '&' +
    ['q', 'signature'].join('-') + '=placeholder';
  assert.ok(scanSecretChunks(splitChunks(signed)).has('signed url'));
});

test('literal matcher retains forbidden text across every possible chunk split', () => {
  const forbidden = ['', 'Users', 'private-owner', 'artifact'].join('/');
  for (let split = 0; split <= forbidden.length; split += 1) {
    const matcher = createLiteralMatcher([[forbidden, 'local path']]);
    matcher.push(forbidden.slice(0, split));
    matcher.push(forbidden.slice(split));
    assert.ok(matcher.matches.has('local path'), `literal split ${split}`);
  }
});

test('secret scan rejects a token embedded in a binary file across stream chunks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'realsee-secret-scan-'));
  const token = ['not', 'a', 'real', 'secret', 'value'].join('-');
  const marker = ['access', 'token'].join('_') + ' = ' + token;
  try {
    await writeBinaryFixture(join(root, 'fixture.png'), marker);
    const result = runScanner(secretScanner, root);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /fixture\.png: access token/u);
    assert.doesNotMatch(output, new RegExp(token, 'u'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repository boundary rejects a local path embedded in a binary file across stream chunks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'realsee-boundary-scan-'));
  const localPath = ['', 'Users', 'private-owner', 'artifact'].join('/');
  try {
    await writeBinaryFixture(join(root, 'fixture.png'), localPath);
    const result = runScanner(boundaryScanner, root);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /forbidden text .* in fixture\.png/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repository scanners accept a safe binary file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'realsee-safe-scan-'));
  try {
    await writeFile(join(root, 'fixture.png'), Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(96 * 1024, 0xa5)
    ]));
    for (const scanner of [secretScanner, boundaryScanner]) {
      const result = runScanner(scanner, root);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repository scanners ignore the Git control file in a linked worktree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'realsee-worktree-scan-'));
  try {
    const gitDirectory = ['', 'Users', 'private-owner', 'repository', '.git', 'worktrees', 'fixture'].join('/');
    await writeFile(join(root, '.git'), `gitdir: ${gitDirectory}\n`);
    await writeFile(join(root, 'safe.txt'), 'public fixture\n');
    for (const scanner of [secretScanner, boundaryScanner]) {
      const result = runScanner(scanner, root);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repository scanners do not ignore a regular file named node_modules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'realsee-node-modules-file-scan-'));
  const token = ['not', 'a', 'real', 'secret', 'value'].join('-');
  const secret = ['access', 'token'].join('_') + ' = ' + token;
  const localPath = ['', 'Users', 'private-owner', 'artifact'].join('/');
  try {
    await writeFile(join(root, 'node_modules'), `${secret}\n${localPath}\n`);

    const secretResult = runScanner(secretScanner, root);
    assert.notEqual(secretResult.status, 0, `${secretResult.stdout}\n${secretResult.stderr}`);
    assert.match(`${secretResult.stdout}\n${secretResult.stderr}`, /node_modules: access token/u);

    const boundaryResult = runScanner(boundaryScanner, root);
    assert.notEqual(boundaryResult.status, 0, `${boundaryResult.stdout}\n${boundaryResult.stderr}`);
    assert.match(`${boundaryResult.stdout}\n${boundaryResult.stderr}`, /forbidden text .* in node_modules/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repository scanners keep memory bounded for a large binary file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'realsee-bounded-scan-'));
  const file = await open(join(root, 'large.bin'), 'w');
  try {
    await file.truncate(128 * 1024 * 1024);
  } finally {
    await file.close();
  }
  try {
    for (const scanner of [secretScanner, boundaryScanner]) {
      const result = runScanner(scanner, root, ['--max-old-space-size=64']);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('standalone Claude plugin validation scans binary files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'realsee-plugin-scan-'));
  const validator = join(root, 'scripts', 'validate-plugin.mjs');
  try {
    await mkdir(dirname(validator), { recursive: true });
    await copyFile(join(repoRoot, 'plugins', 'realsee-skills', 'scripts', 'validate-plugin.mjs'), validator);
    await writeJson(join(root, '.claude-plugin', 'plugin.json'), {
      name: 'realsee-skills',
      license: 'LicenseRef-Realsee-SDK'
    });
    await writeJson(join(root, 'package.json'), { name: 'realsee-skills' });
    await writeFile(join(root, 'LICENSE'), 'fixture plugin license\n');
    await mkdir(join(root, 'skills', 'argus'), { recursive: true });
    await writeFile(join(root, 'skills', 'argus', 'SKILL.md'), '---\nname: argus\n---\n');
    await writeFile(join(root, 'skills', 'argus', 'LICENSE'), 'fixture\n');
    await writeJson(join(root, 'skills', 'argus', 'assets', 'brand', 'manifest.json'), {});
    await writeBinaryFixture(
      join(root, 'skills', 'argus', 'assets', 'brand', 'fixture.png'),
      ['', 'Users', 'private-owner', 'artifact'].join('/')
    );

    const result = runScanner(validator, root);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /forbidden local user path/u);
    assert.match(output, /fixture\.png/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeBinaryFixture(path, marker) {
  await mkdir(dirname(path), { recursive: true });
  const markerBytes = Buffer.from(marker);
  const prefixLength = 64 * 1024 - Math.floor(markerBytes.length / 2);
  await writeFile(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(prefixLength - 8, 0xa5),
    markerBytes,
    Buffer.alloc(1024, 0xa5)
  ]));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`);
}

function runScanner(script, cwd, nodeOptions = []) {
  return spawnSync(process.execPath, [...nodeOptions, script], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000
  });
}

function scanSecretChunks(chunks) {
  const matchers = createSecretMatchers();
  const matches = new Set();
  for (const chunk of chunks) {
    for (const matcher of matchers) {
      matcher.push(chunk);
      for (const label of matcher.matches) matches.add(label);
    }
  }
  return matches;
}

function splitChunks(text) {
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += 64 * 1024) {
    chunks.push(text.slice(offset, offset + 64 * 1024));
  }
  return chunks;
}
