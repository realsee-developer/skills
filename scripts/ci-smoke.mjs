// Smoke test for the three skill-distribution paths:
//   1. Claude Code plugin layout (plugins/realsee-skills/.claude-plugin/plugin.json valid + skill present)
//   2. Codex install layout    (`install-codex-skills.mjs` produces $CODEX_HOME/skills/argus)
//   3. Universal skill source  (.agents/skills/argus/SKILL.md is a valid skill frontmatter)
//
// This script never hits the network. The skill is intentionally shaped as
// SKILL.md instructions + one run-argus.mjs entrypoint with explicit
// start/status/collect commands.
import { mkdtempSync, rmSync } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');

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
  const tmpHome = mkdtempSync(join(tmpdir(), 'argus-codex-smoke-'));
  try {
    const child = spawnSync(process.execPath, [join(root, 'scripts', 'install-codex-skills.mjs')], {
      cwd: root,
      env: { ...process.env, CODEX_HOME: tmpHome },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    if (child.status !== 0) {
      const stderr = child.stderr?.toString?.() ?? '';
      throw new Error(`install-codex-skills.mjs failed: ${stderr.trim() || child.status}`);
    }
    const skillTarget = join(tmpHome, 'skills', 'argus');
    const skillMd = join(skillTarget, 'SKILL.md');
    await assertFile('codex skill target', skillTarget);
    await assertFile('codex SKILL.md', skillMd);
    if (parseFrontmatterName(await readFile(skillMd, 'utf8')) !== 'argus') {
      throw new Error('codex-installed SKILL.md frontmatter name must be argus');
    }
  } finally {
    rmSync(tmpHome, { recursive: true, force: true });
  }
}

async function main() {
  const checks = [
    ['canonical skill source', checkCanonicalSkill],
    ['skill surface = SKILL.md + run-argus.mjs only', checkSkillSurface],
    ['marketplace manifest', checkMarketplaceManifest],
    ['claude plugin layout', checkClaudePluginLayout],
    ['SKILL.md describes the full agent flow', checkSkillMdDescribesFlow],
    ['codex install (sandboxed)', checkCodexInstall]
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
