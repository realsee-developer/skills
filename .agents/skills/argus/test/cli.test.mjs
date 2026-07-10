import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, parseArgs } from '../src/cli.mjs';
import { writeResult, writeState } from '../src/state.mjs';

const ENV = {
  REALSEE_REGION: 'global',
  REALSEE_APP_KEY: 'key',
  REALSEE_APP_SECRET: 'secret'
};

test('parses explicit start/status/collect lifecycle commands', () => {
  const start = parseArgs([
    'start', '--image', 'one.jpg', '--image', 'two.webp',
    '--workspace', './runs', '--title', 'room', '--yes', '--json'
  ]);
  assert.equal(start.command, 'start');
  assert.deepEqual(start.images, ['one.jpg', 'two.webp']);
  assert.equal(start.title, 'room');
  assert.equal(start.yes, true);
  assert.equal(parseArgs(['status', '--workspace', './run', '--json']).command, 'status');
  assert.equal(parseArgs(['collect', '--workspace', './run', '--json']).command, 'collect');
});

test('entrypoint exits 0 for partial with warning and nonzero for algorithm error', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'argus-cli-exit-'));
  const entrypoint = new URL('../scripts/run-argus.mjs', import.meta.url).pathname;
  try {
    await writeState(workspace, {
      region: 'global', phase: 'completed', task_code: 'task-1', task_status: 'succeeded', workspace_dir: workspace
    });
    await writeResult(workspace, {
      region: 'global', workspace_dir: workspace, task_code: 'task-1',
      task_status: 'succeeded', result_status: 'partial', missing_ids: ['000001'], warnings: []
    });
    const partial = spawnSync(process.execPath, [entrypoint, 'collect', '--workspace', workspace, '--json'], {
      encoding: 'utf8', env: { PATH: process.env.PATH }
    });
    assert.equal(partial.status, 0);
    assert.match(partial.stderr, /WARNING.*000001/);
    assert.equal(JSON.parse(partial.stdout).result_status, 'partial');

    await writeResult(workspace, {
      region: 'global', workspace_dir: workspace, task_code: 'task-1',
      task_status: 'succeeded', result_status: 'error', missing_ids: [], warnings: [],
      error: { code: 'RECONSTRUCTION_FAILED', message: 'No result' }
    });
    const error = spawnSync(process.execPath, [entrypoint, 'collect', '--workspace', workspace, '--json'], {
      encoding: 'utf8', env: { PATH: process.env.PATH }
    });
    assert.equal(error.status, 2);
    assert.equal(JSON.parse(error.stdout).result_status, 'error');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('enforces image/zip exclusivity and rejects removed v1 flags', () => {
  assert.throws(
    () => parseArgs(['start', '--image', 'a.jpg', '--zip', 'a.zip', '--workspace', './runs']),
    /exactly one/
  );
  assert.throws(() => parseArgs(['start', '--workspace', './runs']), /exactly one/);
  for (const oldFlag of ['--type', '--async', '--resume']) {
    assert.throws(
      () => parseArgs(['start', '--image', 'a.jpg', '--workspace', './runs', oldFlag]),
      /Unknown arg/
    );
  }
  assert.throws(
    () => parseArgs(['status', '--workspace', './run', '--image', 'a.jpg']),
    /only accepts/
  );
});

test('partial collect prints a visible warning but resolves successfully', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'argus-cli-'));
  const stdout = capture();
  const stderr = capture();
  const lifecycle = {
    async collect() {
      return {
        schema_version: 2,
        workspace_dir: workspace,
        task_status: 'succeeded',
        result_status: 'partial',
        missing_ids: ['000001']
      };
    }
  };
  try {
    await writeState(workspace, {
      region: 'global', phase: 'succeeded', task_code: 'task-1', task_status: 'succeeded', workspace_dir: workspace
    });
    const result = await main(['collect', '--workspace', workspace, '--json'], {
      env: ENV, lifecycle, stdout, stderr
    });
    assert.equal(result.result_status, 'partial');
    assert.match(stderr.text, /WARNING.*000001/);
    assert.equal(JSON.parse(stdout.text).result_status, 'partial');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

function capture() {
  return {
    text: '',
    write(chunk) { this.text += String(chunk); }
  };
}
