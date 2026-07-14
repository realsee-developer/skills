import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import { syncArkclaw } from '../scripts/sync-arkclaw.mjs';
import { buildArkclawZip } from '../scripts/build-arkclaw-zip.mjs';

const repoRoot = resolve(import.meta.dirname, '..');

test('no panorama example JPEG is tracked by git', () => {
  const result = spawnSync(
    'git',
    ['ls-files', '-co', '--exclude-standard', '-z'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  const panoramaJpegs = result.stdout
    .split('\0')
    .filter((path) => path && existsSync(join(repoRoot, path)))
    .filter((path) => /(?:^|\/)examples\/.*\.jpe?g$/iu.test(path));
  assert.deepEqual(panoramaJpegs, []);
});

test('Arkclaw sync omits bundled panorama JPEGs and keeps usable manifest guidance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'realsee-arkclaw-distribution-'));
  const sourceRoot = join(root, '.agents', 'skills', 'argus');
  const targetRoot = join(root, 'arkclaw', 'argus');
  try {
    const copiedFiles = [
      'SKILL.md',
      'README.md',
      'README.zh-CN.md',
      'examples/manifest.json',
      'references/examples.md',
      'references/examples.zh-CN.md'
    ];
    for (const relativePath of copiedFiles) {
      const target = join(sourceRoot, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(repoRoot, '.agents', 'skills', 'argus', relativePath), target);
    }
    await mkdir(join(sourceRoot, 'scripts'), { recursive: true });
    await writeFile(
      join(sourceRoot, 'scripts', 'run-argus.mjs'),
      'const options = { env: process.env, };\n'
    );
    await writeFile(
      join(sourceRoot, 'scripts', 'download-examples.mjs'),
      "const allowedRegions = ['cn', 'global'];\n"
    );
    await writeFile(join(sourceRoot, 'package.json'), '{"name":"argus","version":"2.0.0"}\n');
    for (const region of ['cn', 'global']) {
      const image = join(sourceRoot, 'examples', region, 'pano01.jpg');
      await mkdir(dirname(image), { recursive: true });
      await writeFile(image, 'fixture image\n');
      await writeFile(join(sourceRoot, 'examples', region, 'pano02.JPEG'), 'fixture image\n');
    }
    await writeFile(join(root, '.gitignore'), await readFile(join(repoRoot, '.gitignore')));
    const git = spawnSync('git', ['init', '-q'], { cwd: root, encoding: 'utf8' });
    assert.equal(git.status, 0, git.stderr);

    await syncArkclaw({
      repoRoot: root,
      sourceRoot,
      targetRoot,
      expectedTarget: targetRoot
    });

    await stat(join(targetRoot, 'examples', 'manifest.json'));
    for (const region of ['cn', 'global']) {
      await assert.rejects(
        stat(join(targetRoot, 'examples', region, 'pano01.jpg')),
        (error) => error?.code === 'ENOENT'
      );
      await assert.rejects(
        stat(join(targetRoot, 'examples', region, 'pano02.JPEG')),
        (error) => error?.code === 'ENOENT'
      );
    }

    const guidance = await Promise.all([
      'SKILL.md',
      'README.md',
      'README.zh-CN.md',
      'references/examples.md',
      'references/examples.zh-CN.md'
    ].map((relativePath) => readFile(join(targetRoot, relativePath), 'utf8')));
    const combined = guidance.join('\n');
    for (const staleClaim of [
      'Two first-party example sets are bundled',
      'The files are available offline after installation.',
      'available without downloading anything after the Skill is installed',
      '安装后可离线读取这些文件。',
      'Skill 安装完成后无需再次下载',
      'Use `global` when it matches `REALSEE_REGION`.',
      '当 `REALSEE_REGION` 为 `global` 时改用 `global`。',
      'Use `--region global` for the Global download.',
      'Global 下载改用 `--region global`。'
    ]) {
      assert.doesNotMatch(combined, new RegExp(escapeRegExp(staleClaim), 'u'));
    }
    assert.match(combined, /Arkclaw/u);
    assert.match(combined, /examples\/manifest\.json/u);
    assert.match(combined, /source_url/u);
    assert.match(combined, /SHA-256/u);
    assert.match(combined, /CN-only Arkclaw/u);
    assert.match(combined, /仅接受 `cn`|只接受 `--region cn`/u);
    const downloader = await readFile(join(targetRoot, 'scripts', 'download-examples.mjs'), 'utf8');
    assert.match(downloader, /const allowedRegions = \['cn'\];/u);
    assert.doesNotMatch(downloader, /'global'/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Arkclaw ZIP rejects and removes an archive larger than 10 MB', async () => {
  const root = await mkdtemp(join(tmpdir(), 'realsee-arkclaw-size-'));
  const skillSource = join(root, 'arkclaw', 'argus');
  const zipPath = join(root, 'dist', 'arkclaw', 'argus.zip');
  try {
    await mkdir(skillSource, { recursive: true });
    await writeFile(
      join(skillSource, 'SKILL.md'),
      '---\nname: argus\ndescription: Arkclaw size fixture\nmetadata:\n  version: 2.0.0\n---\n'
    );
    await writeFile(join(skillSource, 'package.json'), '{"name":"argus","version":"2.0.0"}\n');
    await writeFile(join(skillSource, 'payload.bin'), randomBytes(10_000_001));
    await writeFile(join(root, '.gitignore'), await readFile(join(repoRoot, '.gitignore')));
    const git = spawnSync('git', ['init', '-q'], { cwd: root, encoding: 'utf8' });
    assert.equal(git.status, 0, git.stderr);

    await assert.rejects(
      buildArkclawZip({
        repoRoot: root,
        skillSource,
        distDir: dirname(zipPath),
        zipPath
      }),
      /exceeds Arkclaw 10 MB limit/u
    );
    await assert.rejects(stat(zipPath), (error) => error?.code === 'ENOENT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Claude plugin generator emits resolvable SPDX custom-license metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'realsee-claude-license-'));
  const sourceRoot = join(root, '.agents', 'skills', 'argus');
  const pluginRoot = join(root, 'plugins', 'realsee-skills');
  const rootLicense = 'fixture custom license\n';
  try {
    await mkdir(join(root, 'scripts'), { recursive: true });
    for (const script of ['sync-claude-plugin.mjs', 'distribution-files.mjs']) {
      await copyFile(join(repoRoot, 'scripts', script), join(root, 'scripts', script));
    }
    await writeFile(join(root, 'package.json'), '{"name":"fixture","version":"2.0.0"}\n');
    await writeFile(join(root, 'LICENSE'), rootLicense);
    await writeFile(join(root, '.gitignore'), await readFile(join(repoRoot, '.gitignore')));
    await mkdir(join(sourceRoot, 'assets', 'brand'), { recursive: true });
    await writeFile(join(sourceRoot, 'SKILL.md'), '---\nname: argus\n---\n');
    await writeFile(join(sourceRoot, 'LICENSE'), 'fixture skill license\n');
    await writeFile(join(sourceRoot, 'package.json'), '{"name":"argus","version":"2.0.0"}\n');
    await writeFile(join(sourceRoot, 'assets', 'brand', 'manifest.json'), '{}\n');
    const git = spawnSync('git', ['init', '-q'], { cwd: root, encoding: 'utf8' });
    assert.equal(git.status, 0, git.stderr);

    const sync = spawnSync(process.execPath, [join(root, 'scripts', 'sync-claude-plugin.mjs')], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(sync.status, 0, sync.stderr);

    const manifest = JSON.parse(await readFile(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
    assert.equal(manifest.license, 'LicenseRef-Realsee-SDK');
    assert.equal(await readFile(join(pluginRoot, 'LICENSE'), 'utf8'), rootLicense);

    const validator = join(pluginRoot, 'scripts', 'validate-plugin.mjs');
    const valid = spawnSync(process.execPath, [validator], { cwd: pluginRoot, encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);

    await rm(join(pluginRoot, 'LICENSE'));
    const missingLicense = spawnSync(process.execPath, [validator], {
      cwd: pluginRoot,
      encoding: 'utf8'
    });
    assert.notEqual(missingLicense.status, 0, missingLicense.stdout);
    assert.match(missingLicense.stderr, /missing plugin license/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Claude marketplace uses the plugin custom-license SPDX reference', async () => {
  const marketplace = JSON.parse(
    await readFile(join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8')
  );
  const plugin = marketplace.plugins.find((entry) => entry.name === 'realsee-skills');
  assert.equal(plugin.license, 'LicenseRef-Realsee-SDK');
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
