import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRunWorkspace } from '../src/workspace.mjs';
import { readState, writeState } from '../src/state.mjs';
import { writeJsonAtomic } from '../src/output.mjs';

test('creates isolated run directory and writes json atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-workspace-'));
  try {
    const run = await createRunWorkspace(root, new Date('2026-05-11T00:00:00Z'));
    assert.match(run, /20260511T000000Z-/);
    await writeJsonAtomic(join(run, 'result.json'), { status: 'success' });
    assert.equal(JSON.parse(await readFile(join(run, 'result.json'), 'utf8')).status, 'success');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('state schema v2 persists checkpoints but rejects signed URLs and credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-state-'));
  try {
    const run = await createRunWorkspace(root, new Date('2026-05-11T00:00:00Z'));
    await writeState(run, {
      region: 'global',
      phase: 'submitted',
      task_code: 'task-1',
      upload: { provider: 'aws', object_path: 'prefix/input.zip', etag: 'etag' }
    });
    const state = await readState(run);
    assert.equal(state.schema_version, 2);
    assert.equal(state.task_code, 'task-1');
    assert.equal(JSON.stringify(state).includes('access_token'), false);

    await assert.rejects(
      () => writeState(run, { output_url: 'https://signed.invalid/?q=x' }),
      /may not persist sensitive field/
    );
    await assert.rejects(
      () => writeState(run, { upload_token: { sessionToken: 'secret' } }),
      /may not persist sensitive field/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
