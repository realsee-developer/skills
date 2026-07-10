// Fresh-install smoke for every supported skill distribution:
//   1. Claude Code plugin copy
//   2. Codex installer
//   3. `npx skills ... --copy` filesystem contract
//   4. CN-only Arkclaw ZIP
//
// Runtime dependencies install from the warmed npm cache; the pinned `skills`
// CLI may be fetched by npx. The skill is intentionally shaped as SKILL.md
// instructions + one run-argus.mjs entrypoint with explicit commands.
import { mkdtempSync, rmSync } from 'node:fs';
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildArkclawZip } from './build-arkclaw-zip.mjs';
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
  if (parseFrontmatterName(await readFile(skillMd, 'utf8')) !== 'argus') {
    throw new Error(`${label} SKILL.md frontmatter name must be argus`);
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
  // The skill is exactly one script + the runtime modules behind it. Any
  // additional scripts under .agents/skills/argus/scripts/ are a regression
  // toward the bad pattern of building CLIs the agent should drive via Bash.
  const scriptsDir = join(root, '.agents', 'skills', 'argus', 'scripts');
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(scriptsDir);
  if (entries.length !== 1 || entries[0] !== 'run-argus.mjs') {
    throw new Error(
      `skill scripts/ should contain only run-argus.mjs; got: ${entries.join(', ')}. ` +
        'Helper scripts (check-credentials, save-credentials, task-status, open-result) ' +
        'were intentionally removed — SKILL.md drives the agent through Bash instead.'
    );
  }
  // The skill's package.json must NOT advertise removed helper scripts.
  const pkg = JSON.parse(await readFile(join(root, '.agents', 'skills', 'argus', 'package.json'), 'utf8'));
  const allowed = new Set(['test', 'argus', 'audit:prod']);
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
  await assertFile('claude plugin manifest', manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.name !== 'realsee-skills') {
    throw new Error(`plugin.json name must be realsee-skills (got: ${manifest.name})`);
  }
  if (manifest.userConfig) {
    throw new Error('plugin.json must not declare userConfig (credentials resolved at runtime by SKILL.md)');
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
  const syncedScripts = await readdir(join(pluginDir, 'skills', 'argus', 'scripts'));
  if (syncedScripts.length !== 1 || syncedScripts[0] !== 'run-argus.mjs') {
    throw new Error(`plugin skill scripts/ should contain only run-argus.mjs; got: ${syncedScripts.join(', ')}`);
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
  const tmpRoot = mkdtempSync(join(tmpdir(), 'argus-arkclaw-smoke-'));
  try {
    runChild('Arkclaw ZIP extraction', 'unzip', ['-q', zipPath, '-d', tmpRoot], { cwd: root });
    const installRoot = join(tmpRoot, 'argus');
    const entrypoint = await readFile(join(installRoot, 'scripts', 'run-argus.mjs'), 'utf8');
    if (!entrypoint.includes("env: { ...process.env, REALSEE_REGION: 'cn' },")) {
      throw new Error('fresh Arkclaw install is missing the forced CN-only region overlay');
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
    await writeFile(
      join(sourceRoot, 'SKILL.md'),
      '---\nname: argus\ndescription: Arkclaw ignore fixture\nmetadata:\n  version: 2.0.0\n---\n'
    );
    await writeFile(join(sourceRoot, 'package.json'), '{"name":"argus","version":"2.0.0"}\n');
    await writeFile(
      join(sourceRoot, 'scripts', 'run-argus.mjs'),
      'const options = { env: process.env, };\n'
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
    await writeFile(join(targetRoot, 'workspace', 'late-secret.json'), '{}\n');
    await writeFile(join(targetRoot, '.env'), 'SECRET=late\n');
    await writeFile(join(targetRoot, 'late.glb'), 'late\n');
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
    'Never place credential values in a CLI argument'
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
    ['skill surface = SKILL.md + run-argus.mjs only', checkSkillSurface],
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
