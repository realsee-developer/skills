import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const dependencyNames = ['@aws-sdk/client-s3', '@realsee/universal-uploader', 'ajv', 'yauzl'];

async function installation(t, { dependencies = true, npmVersion = '10.9.0' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'argus-installed-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillDir = join(root, 'host/skills/argus');
  const outside = join(root, 'unrelated-project');
  const bin = join(root, 'bin');
  const home = join(root, 'home');
  await Promise.all([skillDir, outside, bin, home].map((dir) => mkdir(dir, { recursive: true })));
  for (const file of ['src/local-check.mjs', 'src/config.mjs', 'scripts/check-local.mjs', 'package.json']) {
    const target = join(skillDir, file);
    await mkdir(join(target, '..'), { recursive: true });
    await copyFile(new URL(`../${file}`, import.meta.url), target);
  }
  await writeFile(join(skillDir, 'SKILL.md'), 'Installed skill fixture');
  if (dependencies) {
    for (const name of dependencyNames) {
      const dir = join(skillDir, 'node_modules', name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name, main: 'index.js' }));
      await writeFile(join(dir, 'index.js'), 'throw new Error("dependency must not execute during preflight");\n');
    }
  }
  await writeFile(join(bin, 'npm'), `#!/bin/sh\n[ "$1" = '--version' ] || exit 8\nprintf '%s\\n' '${npmVersion}'\nprintf 'private-child-output' >&2\n`, { mode: 0o755 });
  const env = { ...process.env, HOME: home, PATH: bin };
  for (const key of Object.keys(env)) if (/^(REALSEE_|ARGUS_|NODE_OPTIONS$|NODE_PATH$)/.test(key)) delete env[key];
  const run = (args = ['--json'], configured = {}) => {
    const child = spawnSync(process.execPath, [join(skillDir, 'scripts/check-local.mjs'), ...args], {
      cwd: outside, env: { ...env, ...configured }, encoding: 'utf8', timeout: 15000
    });
    assert.equal(child.error, undefined);
    return { ...child, report: args.includes('--json') ? JSON.parse(child.stdout) : null };
  };
  return { root, skillDir, home, bin, run };
}

const configured = {
  REALSEE_APP_KEY: 'private-key-value',
  REALSEE_APP_SECRET: 'private-secret-value',
  REALSEE_REGION: 'global'
};

test('installed preflight resolves its own package from an unrelated cwd without executing dependencies', async (t) => {
  const { skillDir, run } = await installation(t);
  const result = run(['--json'], configured);
  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'ready');
  assert.equal(result.report.schema_version, 1);
  assert.equal(result.report.skill, 'argus');
  assert.equal(result.report.skill_version, JSON.parse(await readFile(join(skillDir, 'package.json'), 'utf8')).version);
  assert.equal(result.report.checks.filter((check) => check.id.startsWith('dependency:') && check.status === 'pass').length, 4);
  assert.equal(result.stderr, '');
  assert.doesNotMatch(result.stdout, /private-/);
});

test('preflight still runs before dependencies are installed and gives locked-install guidance', async (t) => {
  const { run } = await installation(t, { dependencies: false });
  const result = run(['--json'], configured);
  assert.equal(result.status, 1);
  assert.equal(result.report.status, 'blocked');
  const failures = result.report.checks.filter((check) => check.id.startsWith('dependency:'));
  assert.equal(failures.length, 4);
  assert.ok(failures.every((check) => check.status === 'fail' && check.next_step.includes('npm ci')));
  assert.equal(result.stderr, '');
});

test('existing credentials are detected but neither read into configuration nor executed', async (t) => {
  const { home, run } = await installation(t);
  await mkdir(join(home, '.realsee'));
  const file = join(home, '.realsee/credentials');
  const marker = join(home, 'credentials-were-executed');
  const content = `REALSEE_APP_KEY=private-file-key\nREALSEE_APP_SECRET=private-file-secret\nREALSEE_REGION=cn\nprintf touched > '${marker}'\n`;
  await writeFile(file, content, { mode: 0o600 });
  const result = run();
  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'needs_configuration');
  assert.equal(result.report.checks.find((check) => check.id === 'credentials_file').status, 'warn');
  for (const id of ['REALSEE_APP_KEY', 'REALSEE_APP_SECRET', 'REALSEE_REGION']) {
    assert.equal(result.report.checks.find((check) => check.id === id).status, 'warn');
  }
  await assert.rejects(stat(marker), { code: 'ENOENT' });
  assert.equal(await readFile(file, 'utf8'), content);
  assert.doesNotMatch(result.stdout + result.stderr, /private-|credentials-were-executed/);
});

test('invalid and deprecated environment configuration cannot report ready or expose values', async (t) => {
  const { run } = await installation(t);
  const invalid = run(['--json'], { ...configured, REALSEE_REGION: 'private-invalid-region' });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.report.checks.find((check) => check.id === 'REALSEE_REGION').status, 'fail');
  assert.doesNotMatch(invalid.stdout + invalid.stderr, /private-/);
  const legacy = run(['--json'], { ...configured, ARGUS_REGION: 'private-legacy-region' });
  assert.equal(legacy.report.status, 'blocked');
  assert.equal(legacy.report.checks.find((check) => check.id === 'configuration').status, 'fail');
  assert.doesNotMatch(legacy.stdout + legacy.stderr, /private-/);
  const empty = run(['--json'], { ...configured, REALSEE_APP_KEY: '   ' });
  assert.equal(empty.report.status, 'needs_configuration');
});

test('missing metadata and unavailable or old npm produce local failures', async (t) => {
  const old = await installation(t, { npmVersion: '9.9.4' });
  assert.equal(old.run(['--json'], configured).report.checks.find((check) => check.id === 'npm').status, 'fail');
  const { skillDir, bin, run } = await installation(t);
  await rm(join(bin, 'npm'));
  const unavailable = run(['--json'], configured);
  assert.equal(unavailable.report.checks.find((check) => check.id === 'npm').status, 'fail');
  assert.doesNotMatch(unavailable.stdout + unavailable.stderr, /private-/);
  await rm(join(skillDir, 'SKILL.md'));
  await mkdir(join(skillDir, 'SKILL.md'));
  await writeFile(join(skillDir, 'package.json'), 'private-invalid-package-metadata');
  const missing = run();
  assert.equal(missing.report.checks.find((check) => check.id === 'skill').status, 'fail');
  assert.equal(missing.report.checks.find((check) => check.id === 'skill_version').status, 'fail');
  assert.doesNotMatch(missing.stdout + missing.stderr, /private-/);
});

test('help is offline and malformed arguments are structured without echoing them', async (t) => {
  const { bin, run } = await installation(t, { dependencies: false });
  await rm(join(bin, 'npm'));
  assert.equal(run(['--help', '--json']).report.status, 'ready');
  assert.match(run(['--help']).stdout, /check-local\.mjs/);
  for (const args of [['--json', '--private-argument'], ['--json', '--json'], ['--json', '--help', '--help']]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.report.status, 'blocked');
    assert.deepEqual(result.report.checks.map((check) => check.id), ['arguments']);
    assert.doesNotMatch(result.stdout + result.stderr, /private-/);
  }
});
