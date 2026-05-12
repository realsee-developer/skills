import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRunWorkspace } from '../src/workspace.mjs';
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
