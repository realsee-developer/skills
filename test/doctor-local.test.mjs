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
  await mkdir(join(root, '.agents/skills/argus/src'));
  for (const file of ['local-check.mjs', 'config.mjs']) {
    await copyFile(new URL(`../.agents/skills/argus/src/${file}`, import.meta.url), join(root, '.agents/skills/argus/src', file));
  }
  await copyFile(new URL('../.agents/skills/argus/package.json', import.meta.url), join(root, '.agents/skills/argus/package.json'));
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

test('repository doctor delegates Argus checks and keeps its JSON envelope', async (t) => {
  const { run } = await fixture(t);
  const result = run(['--json']);
  assert.equal(result.status, 0);
  assert.equal(result.report.skill, 'argus');
  assert.equal(result.report.schema_version, 1);
  assert.equal(result.report.status, 'needs_configuration');
  assert.equal(result.report.checks.filter((c) => c.id.startsWith('dependency:')).length, 4);
  assert.ok(result.report.checks.filter((c) => c.status === 'warn').every((c) => c.next_step));
});

test('missing npm and dependencies block Argus but do not affect Blender', async (t) => {
  const { root, run } = await fixture(t, { dependencies: false });
  await rm(join(root, 'bin/npm'));
  const argus = run(['--json']);
  assert.equal(argus.status, 1);
  assert.equal(argus.report.status, 'blocked');
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
