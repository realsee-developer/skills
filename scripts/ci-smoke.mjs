// Fresh-install smoke for every supported skill distribution:
//   1. Claude Code plugin copy
//   2. Codex installer
//   3. `npx skills ... --copy` filesystem contract
//   4. CN-only Arkclaw ZIP
//
// Runtime dependencies install from the warmed npm cache; the pinned `skills`
// CLI may be fetched by npx. The skill is intentionally shaped as SKILL.md
// instructions + one run-argus.mjs entrypoint with explicit commands.
import { createReadStream, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ARKCLAW_MAX_ZIP_BYTES, buildArkclawZip } from './build-arkclaw-zip.mjs';
import { syncArkclaw } from './sync-arkclaw.mjs';

const root = resolve(import.meta.dirname, '..');
const SKILLS_CLI_VERSION = '1.5.15';

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function parseFrontmatterName(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const line = match[1].split('\n').find((l) => l.startsWith('name:'));
  return line ? line.slice('name:'.length).trim() : null;
}

async function assertFile(label, path) {
  if (!(await exists(path))) {
    throw new Error(`${label} missing: ${path}`);
  }
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function runChild(label, command, args, options = {}) {
  const child = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout
  });
  if (child.error) {
    throw new Error(`${label} failed: ${child.error.message}`, { cause: child.error });
  }
  if (child.status !== 0) {
    throw new Error(
      `${label} failed (exit ${child.status ?? 'unknown'}):\n${(child.stderr || child.stdout).trim()}`
    );
  }
  return child.stdout;
}

async function copyFresh(source, target) {
  await cp(source, target, {
    recursive: true,
    filter: (path) => !path.split(/[\\/]/u).includes('node_modules')
  });
}

async function assertTreeHasNoSymlinks(path, label) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`${label} must be a copy, not a symlink: ${path}`);
  if (!stat.isDirectory()) return;
  for (const entry of await readdir(path)) {
    await assertTreeHasNoSymlinks(join(path, entry), label);
  }
}

async function assertInstalledSkillRuntime(skillDir, label) {
  const skillMd = join(skillDir, 'SKILL.md');
  await assertFile(`${label} SKILL.md`, skillMd);
  await assertFile(`${label} LICENSE`, join(skillDir, 'LICENSE'));
  if (parseFrontmatterName(await readFile(skillMd, 'utf8')) !== 'argus') {
    throw new Error(`${label} SKILL.md frontmatter name must be argus`);
  }
  const examplesManifestPath = join(skillDir, 'examples', 'manifest.json');
  await assertFile(`${label} examples manifest`, examplesManifestPath);
  const examplesManifest = JSON.parse(await readFile(examplesManifestPath, 'utf8'));
  const sampleDigests = new Set();
  for (const [region, count] of [['cn', 12], ['global', 14]]) {
    const expectedFiles = examplesManifest.sets?.[region]?.files ?? [];
    if (expectedFiles.length !== count) {
      throw new Error(`${label} ${region} manifest must list ${count} examples`);
    }
    for (const file of expectedFiles) {
      if (!/^pano\d{2}\.jpg$/u.test(file.name)) {
        throw new Error(`${label} ${region} manifest contains invalid example name ${file.name}`);
      }
      const source = new URL(file.source_url);
      if (source.protocol !== 'https:' || !Number.isSafeInteger(file.bytes) || file.bytes <= 0) {
        throw new Error(`${label} ${region}/${file.name} has invalid CDN metadata`);
      }
      if (!/^[a-f0-9]{64}$/u.test(file.sha256) || sampleDigests.has(file.sha256)) {
        throw new Error(`${label} ${region}/${file.name} has invalid or duplicate SHA-256`);
      }
      sampleDigests.add(file.sha256);
    }
  }
  const panoramaJpegs = await findPanoramaJpegs(join(skillDir, 'examples'));
  if (panoramaJpegs.length) {
    throw new Error(`${label} must not distribute panorama example JPEGs: ${panoramaJpegs.join(', ')}`);
  }
  await assertFile(`${label} example downloader`, join(skillDir, 'scripts', 'download-examples.mjs'));
  const brandManifestPath = join(skillDir, 'assets', 'brand', 'manifest.json');
  await assertFile(`${label} brand manifest`, brandManifestPath);
  const brandManifest = JSON.parse(await readFile(brandManifestPath, 'utf8'));
  if (brandManifest.official_site !== 'https://argus.realsee.ai/') {
    throw new Error(`${label} brand manifest must reference the official Argus site`);
  }
  const expectedBrandFiles = brandManifest.files.map((file) => file.name).sort();
  const actualBrandFiles = (await readdir(join(skillDir, 'assets', 'brand'), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== 'manifest.json')
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(actualBrandFiles) !== JSON.stringify(expectedBrandFiles)) {
    throw new Error(
      `${label} brand assets must be ${expectedBrandFiles.join(', ')}; got: ${actualBrandFiles.join(', ')}`
    );
  }
  for (const file of brandManifest.files) {
    const digest = await sha256File(join(skillDir, 'assets', 'brand', file.name));
    if (digest !== file.sha256) {
      throw new Error(`${label} brand asset ${file.name} SHA-256 does not match manifest`);
    }
  }
  for (const [dependency, path] of [
    ['universal uploader', join('node_modules', '@realsee', 'universal-uploader', 'package.json')],
    ['AWS Node', join('node_modules', '@aws-sdk', 'client-s3', 'package.json')],
    ['ZIP', join('node_modules', 'yauzl', 'package.json')],
    ['JSON Schema', join('node_modules', 'ajv', 'package.json')]
  ]) {
    await assertFile(`${label} ${dependency} dependency`, join(skillDir, path));
  }

  const cliUrl = pathToFileURL(join(skillDir, 'src', 'cli.mjs')).href;
  const probe = [
    `const { parseArgs } = await import(${JSON.stringify(cliUrl)});`,
    "const value = parseArgs(['status', '--workspace', '.', '--json']);",
    "if (value.command !== 'status' || value.json !== true) process.exit(9);"
  ].join('\n');
  runChild(`${label} runtime import`, process.execPath, ['--input-type=module', '--eval', probe], {
    cwd: skillDir
  });
}

async function findPanoramaJpegs(rootDir, prefix = '') {
  const matches = [];
  for (const entry of await readdir(rootDir, { withFileTypes: true })) {
    const relativePath = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      matches.push(...await findPanoramaJpegs(join(rootDir, entry.name), relativePath));
    } else if (entry.isFile() && /\.jpe?g$/iu.test(entry.name)) {
      matches.push(relativePath);
    }
  }
  return matches;
}

async function installSkillDependencies(skillDir, label) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  runChild(
    `${label} dependency install`,
    npm,
    ['ci', '--offline', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: skillDir }
  );
  await assertInstalledSkillRuntime(skillDir, label);
}

async function checkCanonicalSkill() {
  const skillDir = join(root, '.agents', 'skills', 'argus');
  const skillMd = join(skillDir, 'SKILL.md');
  await assertFile('canonical skill dir', skillDir);
  await assertFile('canonical SKILL.md', skillMd);
  const name = parseFrontmatterName(await readFile(skillMd, 'utf8'));
  if (name !== 'argus') {
    throw new Error(`canonical SKILL.md frontmatter name must be 'argus' (got: ${name})`);
  }
}

async function checkSkillSurface() {
  // The skill has one Argus lifecycle entrypoint and one explicit example
  // downloader. Any
  // additional scripts under .agents/skills/argus/scripts/ are a regression
  // toward the bad pattern of building CLIs the agent should drive via Bash.
  const scriptsDir = join(root, '.agents', 'skills', 'argus', 'scripts');
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(scriptsDir);
  const expectedScripts = ['download-examples.mjs', 'run-argus.mjs'];
  if (JSON.stringify(entries.sort()) !== JSON.stringify(expectedScripts)) {
    throw new Error(
      `skill scripts/ should contain only ${expectedScripts.join(', ')}; got: ${entries.join(', ')}. ` +
        'Helper scripts (check-credentials, save-credentials, task-status, open-result) ' +
        'were intentionally removed — SKILL.md drives the agent through Bash instead.'
    );
  }
  // The skill's package.json must NOT advertise removed helper scripts.
  const pkg = JSON.parse(await readFile(join(root, '.agents', 'skills', 'argus', 'package.json'), 'utf8'));
  const allowed = new Set(['test', 'argus', 'examples:download', 'audit:prod']);
  for (const name of Object.keys(pkg.scripts ?? {})) {
    if (!allowed.has(name)) {
      throw new Error(`skill package.json has unexpected script "${name}" (allowed: ${[...allowed].join(', ')})`);
    }
  }
  if (pkg.version !== '2.0.0') {
    throw new Error(`argus package version must be 2.0.0 (got: ${pkg.version})`);
  }
  for (const dependency of [
    '@realsee/universal-uploader',
    '@aws-sdk/client-s3',
    'ajv',
    'yauzl'
  ]) {
    if (!pkg.dependencies?.[dependency]) {
      throw new Error(`argus package is missing runtime dependency ${dependency}`);
    }
  }
}

async function checkClaudePluginLayout() {
  const pluginDir = join(root, 'plugins', 'realsee-skills');
  const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
  await assertFile('claude plugin dir', pluginDir);
  await assertFile('claude plugin root license', join(pluginDir, 'LICENSE'));
  await assertFile('claude plugin manifest', manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.name !== 'realsee-skills') {
    throw new Error(`plugin.json name must be realsee-skills (got: ${manifest.name})`);
  }
  if (manifest.userConfig) {
    throw new Error('plugin.json must not declare userConfig (credentials resolved at runtime by SKILL.md)');
  }
  if (manifest.homepage !== 'https://argus.realsee.ai/') {
    throw new Error('plugin.json homepage must reference the official Argus site');
  }
  if (manifest.license !== 'LicenseRef-Realsee-SDK') {
    throw new Error('plugin.json license must be LicenseRef-Realsee-SDK');
  }
  if (await exists(join(pluginDir, '.mcp.json'))) {
    throw new Error('plugin must not ship .mcp.json (skill runs via Bash, not MCP)');
  }
  const skillPath = join(pluginDir, 'skills', 'argus', 'SKILL.md');
  await assertFile('claude plugin skill copy', skillPath);
  if (parseFrontmatterName(await readFile(skillPath, 'utf8')) !== 'argus') {
    throw new Error('claude plugin skill copy frontmatter name must be argus');
  }
  await assertFile('claude plugin run-argus.mjs', join(pluginDir, 'skills', 'argus', 'scripts', 'run-argus.mjs'));
  // Spot-check the plugin copy didn't smuggle a removed helper back in.
  const { readdir } = await import('node:fs/promises');
  const syncedScripts = (await readdir(join(pluginDir, 'skills', 'argus', 'scripts'))).sort();
  const expectedScripts = ['download-examples.mjs', 'run-argus.mjs'];
  if (JSON.stringify(syncedScripts) !== JSON.stringify(expectedScripts)) {
    throw new Error(`plugin skill scripts/ should contain only ${expectedScripts.join(', ')}; got: ${syncedScripts.join(', ')}`);
  }
}

async function checkClaudePluginInstall() {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'argus-claude-plugin-smoke-'));
  const installRoot = join(tmpRoot, 'realsee-skills');
  try {
    await copyFresh(join(root, 'plugins', 'realsee-skills'), installRoot);
    runChild(
      'fresh Claude plugin validation',
      process.execPath,
      [join(installRoot, 'scripts', 'validate-plugin.mjs')],
      { cwd: installRoot }
    );
    await installSkillDependencies(join(installRoot, 'skills', 'argus'), 'fresh Claude plugin');
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

async function checkNpxSkillsCopyInstall() {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'argus-npx-skills-smoke-'));
  const sourceRoot = join(tmpRoot, 'fresh-source');
  const consumerRoot = join(tmpRoot, 'consumer');
  const installRoot = join(consumerRoot, '.agents', 'skills', 'argus');
  try {
    await mkdir(join(sourceRoot, '.agents', 'skills'), { recursive: true });
    await mkdir(consumerRoot, { recursive: true });
    await copyFresh(
      join(root, '.agents', 'skills', 'argus'),
      join(sourceRoot, '.agents', 'skills', 'argus')
    );
    runChild('npx skills consumer git init', 'git', ['init', '-q'], { cwd: consumerRoot });
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    runChild(
      'pinned npx skills copy install',
      npx,
      [
        '--yes', `skills@${SKILLS_CLI_VERSION}`, 'add', sourceRoot,
        '--skill', 'argus', '--agent', 'codex', '--copy', '--yes'
      ],
      {
        cwd: consumerRoot,
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 180_000
      }
    );
    await assertTreeHasNoSymlinks(installRoot, `skills@${SKILLS_CLI_VERSION} --copy install`);
    rmSync(sourceRoot, { recursive: true, force: true });
    await installSkillDependencies(installRoot, `fresh npx skills@${SKILLS_CLI_VERSION} copy`);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

async function checkArkclawInstall() {
  const zipPath = await buildArkclawZip();
  const zipStat = await lstat(zipPath);
  if (zipStat.size > ARKCLAW_MAX_ZIP_BYTES) {
    throw new Error(`Arkclaw ZIP exceeds ${ARKCLAW_MAX_ZIP_BYTES} bytes`);
  }
  const tmpRoot = mkdtempSync(join(tmpdir(), 'argus-arkclaw-smoke-'));
  try {
    runChild('Arkclaw ZIP extraction', 'unzip', ['-q', zipPath, '-d', tmpRoot], { cwd: root });
    const installRoot = join(tmpRoot, 'argus');
    const entrypoint = await readFile(join(installRoot, 'scripts', 'run-argus.mjs'), 'utf8');
    if (!entrypoint.includes("env: { ...process.env, REALSEE_REGION: 'cn' },")) {
      throw new Error('fresh Arkclaw install is missing the forced CN-only region overlay');
    }
    const exampleDownloader = await readFile(join(installRoot, 'scripts', 'download-examples.mjs'), 'utf8');
    if (!exampleDownloader.includes("const allowedRegions = ['cn'];")) {
      throw new Error('fresh Arkclaw install allows a non-CN example region');
    }
    await installSkillDependencies(installRoot, 'fresh CN-only Arkclaw ZIP');
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

async function checkArkclawIgnoredFixture() {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'argus-arkclaw-ignore-smoke-'));
  const fixtureRoot = join(tmpRoot, 'repo');
  const sourceRoot = join(fixtureRoot, '.agents', 'skills', 'argus');
  const targetRoot = join(fixtureRoot, 'arkclaw', 'argus');
  const fixtureZip = join(fixtureRoot, 'dist', 'arkclaw', 'argus.zip');
  try {
    await mkdir(join(sourceRoot, 'scripts'), { recursive: true });
    await writeFile(join(fixtureRoot, '.gitignore'), await readFile(join(root, '.gitignore')));
    runChild('fixture git init', 'git', ['init', '-q'], { cwd: fixtureRoot });
    for (const relativePath of [
      'SKILL.md',
      'README.md',
      'README.zh-CN.md',
      'references/examples.md',
      'references/examples.zh-CN.md'
    ]) {
      const target = join(sourceRoot, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await cp(join(root, '.agents', 'skills', 'argus', relativePath), target);
    }
    await writeFile(join(sourceRoot, 'package.json'), '{"name":"argus","version":"2.0.0"}\n');
    await writeFile(
      join(sourceRoot, 'scripts', 'run-argus.mjs'),
      'const options = { env: process.env, };\n'
    );
    await writeFile(
      join(sourceRoot, 'scripts', 'download-examples.mjs'),
      "const allowedRegions = ['cn', 'global'];\n"
    );
    await writeFile(join(sourceRoot, 'safe.txt'), 'safe\n');
    await writeFile(join(sourceRoot, '.env.example'), 'SAFE_PLACEHOLDER=1\n');

    const ignoredFiles = [
      ['.env', 'SECRET=source\n'],
      ['.env.production', 'SECRET=source-production\n'],
      ['workspace/task.json', '{"secret":true}\n'],
      ['output/result.json', '{"artifact":true}\n'],
      ['payload.zip', 'not-a-zip\n'],
      ['model.glb', 'not-a-glb\n'],
      ['depth.exr', 'not-an-exr\n'],
      ['trace.log', 'sensitive trace\n'],
      ['examples/cn/pano01.jpg', 'downloaded example\n'],
      ['examples/global/pano01.JPEG', 'downloaded example\n'],
      ['node_modules/local-only/package.json', '{"local":true}\n']
    ];
    for (const [rel, contents] of ignoredFiles) {
      await mkdir(join(sourceRoot, rel, '..'), { recursive: true });
      await writeFile(join(sourceRoot, rel), contents);
    }

    await syncArkclaw({
      repoRoot: fixtureRoot,
      sourceRoot,
      targetRoot,
      expectedTarget: targetRoot
    });
    await assertFile('Arkclaw safe fixture', join(targetRoot, 'safe.txt'));
    await assertFile('Arkclaw negated .env.example fixture', join(targetRoot, '.env.example'));
    for (const [rel] of ignoredFiles) {
      if (await exists(join(targetRoot, rel))) {
        throw new Error(`Arkclaw sync leaked ignored fixture: ${rel}`);
      }
    }

    // Inject ignored files after sync as well: the ZIP builder must apply the
    // same policy independently and must not trust its generated input tree.
    await mkdir(join(targetRoot, 'workspace'), { recursive: true });
    await mkdir(join(targetRoot, 'examples', 'cn'), { recursive: true });
    await writeFile(join(targetRoot, 'workspace', 'late-secret.json'), '{}\n');
    await writeFile(join(targetRoot, '.env'), 'SECRET=late\n');
    await writeFile(join(targetRoot, 'late.glb'), 'late\n');
    await writeFile(join(targetRoot, 'examples', 'cn', 'late.JPG'), 'late example\n');
    await buildArkclawZip({
      repoRoot: fixtureRoot,
      skillSource: targetRoot,
      distDir: join(fixtureRoot, 'dist', 'arkclaw'),
      zipPath: fixtureZip
    });
    const entries = runChild('Arkclaw fixture ZIP listing', 'unzip', ['-Z1', fixtureZip], {
      cwd: fixtureRoot
    }).trim().split('\n');
    for (const forbidden of ['argus/.env', 'argus/late.glb', 'argus/workspace/late-secret.json']) {
      if (entries.includes(forbidden)) throw new Error(`Arkclaw ZIP leaked ignored fixture: ${forbidden}`);
    }
    if (entries.some((entry) => /(?:^|\/)examples\/.*\.jpe?g$/iu.test(entry))) {
      throw new Error('Arkclaw ZIP leaked a panorama example JPEG');
    }
    if (!entries.includes('argus/.env.example') || !entries.includes('argus/safe.txt')) {
      throw new Error('Arkclaw ZIP omitted safe fixture files');
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function checkMarketplaceManifest() {
  const marketplacePath = join(root, '.claude-plugin', 'marketplace.json');
  return readFile(marketplacePath, 'utf8').then((text) => {
    const manifest = JSON.parse(text);
    if (manifest.name !== 'realsee-developer-skills') {
      throw new Error(`marketplace.json name must be realsee-developer-skills (got: ${manifest.name})`);
    }
    const plugin = (manifest.plugins ?? []).find((entry) => entry.name === 'realsee-skills');
    if (!plugin) {
      throw new Error('marketplace.json must include a plugin entry named realsee-skills');
    }
    if (plugin.source !== './plugins/realsee-skills') {
      throw new Error(`marketplace.json plugin source must be ./plugins/realsee-skills (got: ${plugin.source})`);
    }
    if (plugin.license !== 'LicenseRef-Realsee-SDK') {
      throw new Error('marketplace.json plugin license must be LicenseRef-Realsee-SDK');
    }
  });
}

async function checkSkillMdDescribesFlow() {
  // SKILL.md must spell out the agent-driven flow itself; removed helpers
  // would otherwise just become tribal knowledge in docs. Look for the
  // load anchors the agent relies on.
  const skillMd = await readFile(join(root, '.agents', 'skills', 'argus', 'SKILL.md'), 'utf8');
  const requiredAnchors = [
    '~/.realsee/credentials',
    'set -a',
    'run-argus.mjs start',
    'run-argus.mjs status',
    'run-argus.mjs collect',
    '--image',
    '--zip',
    'output.zip',
    'result.json',
    'v1.0.2',
    '(cd "<skillDir>" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)',
    'Do not ask a redundant second confirmation',
    'Never place credential values in a CLI argument',
    'download-examples.mjs',
    '--output'
  ];

  // Belt-and-suspenders: catch the specific anti-pattern of an env-prefix
  // immediately preceding a run-argus.mjs invocation in a code block. The
  // heredoc that writes ~/.realsee/credentials contains `REALSEE_APP_SECRET=`
  // legitimately (as file contents, not a command), so we look for the pair
  // {REALSEE_APP_SECRET=, run-argus.mjs} within a 6-line window, AND require
  // the absence of a `# WRONG` marker that flags it as an explicit example.
  const lines = skillMd.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes('REALSEE_APP_SECRET=')) continue;
    const window = lines.slice(Math.max(0, i - 8), Math.min(lines.length, i + 6));
    const windowText = window.join('\n');
    const looksLikeRunCommand = window.some((l, idx) => idx >= 8 - (8 - (i - Math.max(0, i - 8))) && l.includes('run-argus.mjs'));
    if (!looksLikeRunCommand) continue;
    if (windowText.includes('# WRONG')) continue;
    throw new Error(
      `SKILL.md line ${i + 1} pairs REALSEE_APP_SECRET= with a run-argus.mjs invocation outside a # WRONG block. ` +
        'Credentials must never appear on a Bash command line shown to the agent — source the env file instead.'
    );
  }
  const missing = requiredAnchors.filter((anchor) => !skillMd.includes(anchor));
  if (missing.length) {
    throw new Error(
      `SKILL.md is missing instruction anchors the agent needs:\n` +
        missing.map((entry) => `  - ${entry}`).join('\n')
    );
  }
}

async function checkCodexInstall() {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'argus-codex-smoke-'));
  const tmpHome = join(tmpRoot, 'codex-home');
  const tmpRepo = join(tmpRoot, 'fresh-source');
  try {
    await mkdir(join(tmpRepo, 'scripts'), { recursive: true });
    await cp(
      join(root, 'scripts', 'install-codex-skills.mjs'),
      join(tmpRepo, 'scripts', 'install-codex-skills.mjs')
    );
    await copyFresh(join(root, '.agents', 'skills', 'argus'), join(tmpRepo, '.agents', 'skills', 'argus'));

    const child = spawnSync(process.execPath, [join(tmpRepo, 'scripts', 'install-codex-skills.mjs')], {
      cwd: tmpRepo,
      env: { ...process.env, CODEX_HOME: tmpHome, NPM_CONFIG_OFFLINE: 'true' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    if (child.status !== 0) {
      const stderr = child.stderr?.toString?.() ?? '';
      throw new Error(`install-codex-skills.mjs failed: ${stderr.trim() || child.status}`);
    }
    const stdout = child.stdout?.toString?.() ?? '';
    if (!stdout.includes('installed Argus runtime dependencies')) {
      throw new Error('Codex installer did not report a completed runtime dependency install');
    }
    const skillTarget = join(tmpHome, 'skills', 'argus');
    await assertFile('codex skill target', skillTarget);
    await assertInstalledSkillRuntime(skillTarget, 'fresh Codex install');
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

async function main() {
  const checks = [
    ['canonical skill source', checkCanonicalSkill],
    ['skill surface = lifecycle plus example downloader', checkSkillSurface],
    ['marketplace manifest', checkMarketplaceManifest],
    ['claude plugin layout', checkClaudePluginLayout],
    ['claude plugin fresh install', checkClaudePluginInstall],
    ['SKILL.md describes the full agent flow', checkSkillMdDescribesFlow],
    ['codex fresh install (sandboxed)', checkCodexInstall],
    [`npx skills@${SKILLS_CLI_VERSION} copy fresh install`, checkNpxSkillsCopyInstall],
    ['Arkclaw ignored-file fixture', checkArkclawIgnoredFixture],
    ['CN-only Arkclaw ZIP fresh install', checkArkclawInstall]
  ];
  for (const [label, run] of checks) {
    process.stdout.write(`smoke: ${label} ... `);
    await run();
    process.stdout.write('ok\n');
  }
  console.log('ci-smoke ok');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nci-smoke failed: ${error.message}`);
    process.exit(1);
  });
}
