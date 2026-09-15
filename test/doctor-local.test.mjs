import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function fixture(t, { dependencies = true, blender = 'Blender 4.3.2', blenderExit = 0 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'realsee-doctor-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'bin'));
  await copyFile(new URL('../scripts/doctor-local.mjs', import.meta.url), join(root, 'scripts/doctor-local.mjs'));
  for (const skill of ['argus', 'realsee-blender-reconstruction']) {
    await mkdir(join(root, '.agents/skills', skill), { recursive: true });
    await writeFile(join(root, '.agents/skills', skill, 'SKILL.md'), 'fixture');
  }
  if (dependencies) {
    for (const name of ['@aws-sdk/client-s3', '@realsee/universal-uploader', 'ajv', 'yauzl']) {
      const dir = join(root, '.agents/skills/argus/node_modules', name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'index.js'), '');
    }
  }
  await writeFile(join(root, 'bin/npm'), '#!/bin/sh\nprintf "10.8.0\\n"\n', { mode: 0o755 });
  await writeFile(join(root, 'bin/blender'), `#!/bin/sh\nprintf '%s\\n' '${blender}'\nprintf 'private-child-output' >&2\nexit ${blenderExit}\n`, { mode: 0o755 });
  const env = { ...process.env, HOME: root, PATH: join(root, 'bin') };
  for (const key of Object.keys(env)) if (key.startsWith('REALSEE_')) delete env[key];
  return {
    root,
    run(args = [], configured = {}) {
      const child = spawnSync(process.execPath, [join(root, 'scripts/doctor-local.mjs'), ...args], {
        env: { ...env, ...configured }, encoding: 'utf8'
      });
      return { ...child, report: args.includes('--json') ? JSON.parse(child.stdout) : null };
    }
  };
}

test('Argus defaults to local configuration warnings without leaking credentials', async (t) => {
  const { root, run } = await fixture(t);
  await mkdir(join(root, '.realsee'));
  await writeFile(join(root, '.realsee/credentials'), 'private-file-credential');
  const result = run(['--json']);
  assert.equal(result.status, 0);
  assert.equal(result.report.skill, 'argus');
  assert.equal(result.report.schema_version, 1);
  assert.equal(result.report.status, 'needs_configuration');
  assert.ok(result.report.checks.some((c) => c.id === 'credentials_file'));
  assert.doesNotMatch(result.stdout, /private-file-credential/);
  assert.ok(result.report.checks.filter((c) => c.status === 'warn').every((c) => c.next_step));
  const ready = run(['--json'], { REALSEE_APP_KEY: 'private-key-value', REALSEE_APP_SECRET: 'private-secret-value', REALSEE_REGION: 'global' });
  assert.equal(ready.report.status, 'ready');
  assert.doesNotMatch(ready.stdout + ready.stderr, /private-/);
  const invalid = run(['--json'], { REALSEE_REGION: 'private-invalid-region' });
  assert.equal(invalid.status, 1);
  assert.doesNotMatch(invalid.stdout, /private-invalid-region/);
  assert.equal(run(['--json'], { REALSEE_APP_KEY: '   ' }).report.checks.find((c) => c.id === 'REALSEE_APP_KEY').status, 'warn');
});

test('missing runtime dependencies block Argus but do not affect Blender', async (t) => {
  const { run } = await fixture(t, { dependencies: false });
  assert.equal(run(['--json']).report.status, 'blocked');
  const result = run(['--skill', 'realsee-blender-reconstruction', '--json']);
  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'ready');
  assert.deepEqual(result.report.checks.map((c) => c.id), ['skill', 'blender']);
  assert.doesNotMatch(result.stdout + result.stderr, /private-child-output/);
});

test('Blender validates its version and supports an explicit executable', async (t) => {
  const { root, run } = await fixture(t);
  const result = run(['--skill', 'realsee-blender-reconstruction', '--blender', join(root, 'bin/blender'), '--json']);
  assert.equal(result.report.status, 'ready');
  const invalid = await fixture(t, { blender: 'unrelated program 4.0' });
  assert.equal(invalid.run(['--skill', 'realsee-blender-reconstruction', '--json']).status, 1);
  const failed = await fixture(t, { blenderExit: 1 });
  assert.equal(failed.run(['--skill', 'realsee-blender-reconstruction', '--json']).status, 1);
  assert.equal(run(['--skill', 'realsee-blender-reconstruction', '--blender', join(root, 'absent'), '--json']).status, 1);
});

test('argument errors remain structured and do not echo untrusted arguments', async (t) => {
  const { run } = await fixture(t);
  for (const args of [['--unknown-private'], ['--skill'], ['--skill', 'private-invalid'], ['--blender', 'private-path'], ['--json']]) {
    const result = run(['--json', ...args]);
    assert.equal(result.status, 1);
    assert.equal(result.report.status, 'blocked');
    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, /private-/);
  }
  assert.match(run(['--help']).stdout, /--skill/);
  assert.equal(run(['--help', '--json']).report.status, 'ready');
  assert.match(run().stdout, /Next: Configure the Argus environment locally/);
});

test('unavailable npm blocks Argus and is irrelevant to Blender', async (t) => {
  const { root, run } = await fixture(t);
  await rm(join(root, 'bin/npm'));
  const result = run(['--json']);
  assert.equal(result.status, 1);
  assert.equal(result.report.checks.find((c) => c.id === 'npm').status, 'fail');
  assert.equal(run(['--skill', 'realsee-blender-reconstruction', '--json']).report.status, 'ready');
});
