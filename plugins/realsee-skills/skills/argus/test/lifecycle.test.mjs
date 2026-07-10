import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArgusTaskLifecycle } from '../src/lifecycle.mjs';
import {
  getWorkspacePaths,
  readState,
  withWorkspaceLock,
  writeResult,
  writeState
} from '../src/state.mjs';
import { buildJpegWithDimensions } from './helpers/jpeg.mjs';
import { validManifest, writeOutputZip } from './helpers/artifacts.mjs';

test('start validates, streams one canonical ZIP upload, submits once, and returns immediately', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-start-'));
  const imagePath = join(root, 'room.jpg');
  await writeFile(imagePath, buildJpegWithDimensions(4096, 2048));
  const calls = { allocate: 0, upload: 0, submit: 0, inspect: 0 };
  const taskPort = {
    async allocateUpload() {
      calls.allocate += 1;
      return fakeLease();
    },
    async submit(request) {
      calls.submit += 1;
      assert.equal(request.privateCosKey, 'vrfile/release/open_task_original/test/input.zip');
      return { task_code: 'task-start' };
    },
    async inspect() { calls.inspect += 1; throw new Error('start must not poll'); }
  };
  const transferPort = {
    async upload({ filePath, objectName }) {
      calls.upload += 1;
      assert.equal(objectName, 'input.zip');
      assert.ok((await stat(filePath)).size > 0);
      return {
        provider: 'aws',
        object_path: `vrfile/release/open_task_original/test/${objectName}`,
        key: objectName,
        etag: 'etag',
        bytes: (await stat(filePath)).size
      };
    },
    async download() { throw new Error('start must not download'); }
  };

  try {
    const lifecycle = new ArgusTaskLifecycle({ taskPort, transferPort, now: fixedNow });
    const state = await lifecycle.start({
      images: [imagePath], workspaceRoot: join(root, 'runs'), yes: true, region: 'global'
    });
    assert.deepEqual(calls, { allocate: 1, upload: 1, submit: 1, inspect: 0 });
    assert.equal(state.schema_version, 2);
    assert.equal(state.phase, 'submitted');
    assert.equal(state.task_code, 'task-start');
    assert.equal(state.input.image_count, 1);
    assert.equal(state.input.images[0].name, 'room.jpg');
    const persisted = await readFile(join(state.workspace_dir, 'state.json'), 'utf8');
    for (const forbidden of ['tmpSecretId', 'tmpSecretKey', 'sessionToken']) {
      assert.equal(persisted.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lost submit response is checkpointed as submission_unknown and never retried', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-unknown-'));
  const imagePath = join(root, 'room.jpg');
  await writeFile(imagePath, buildJpegWithDimensions(4096, 2048));
  let submits = 0;
  const taskPort = {
    async allocateUpload() { return fakeLease(); },
    async submit() {
      submits += 1;
      const error = new Error('response lost');
      error.submissionUnknown = true;
      throw error;
    }
  };
  const transferPort = {
    async upload() { return { provider: 'aws', object_path: 'prefix/input.zip', key: 'input.zip' }; }
  };
  const lifecycle = new ArgusTaskLifecycle({ taskPort, transferPort, now: fixedNow });
  try {
    let workspace;
    await assert.rejects(
      () => lifecycle.start({ images: [imagePath], workspaceRoot: join(root, 'runs'), yes: true, region: 'global' }),
      (error) => {
        workspace = error.workspaceDir;
        return error.code === 'SUBMISSION_UNKNOWN';
      }
    );
    assert.equal(submits, 1);
    const state = await readState(workspace);
    assert.equal(state.phase, 'submission_unknown');
    assert.equal(state.task_code, undefined);
    assert.equal(JSON.stringify(state).includes('response lost'), false);
    await assert.rejects(() => lifecycle.collect({ workspaceDir: workspace }), /do not resubmit/i);
    assert.equal(submits, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('status performs one query and never persists the signed output URL', async () => {
  const root = await createSubmittedWorkspace();
  let inspectCalls = 0;
  const lifecycle = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        inspectCalls += 1;
        return {
          status: 2,
          output_url: 'https://signed.invalid/output.zip?q=do-not-save',
          expiration_timestamp: 4_102_444_800
        };
      }
    },
    transferPort: {},
    now: fixedNow
  });
  try {
    const status = await lifecycle.status({ workspaceDir: root });
    assert.equal(inspectCalls, 1);
    assert.equal(status.task_status, 'succeeded');
    const persisted = await readFile(join(root, 'state.json'), 'utf8');
    assert.equal(persisted.includes('signed.invalid'), false);
    assert.equal(persisted.includes('do-not-save'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('status does not replace a terminal task with a delayed conflicting snapshot', async () => {
  for (const terminal of ['succeeded', 'failed']) {
    const delayedStatuses = terminal === 'succeeded' ? [0, 1, 3] : [0, 1, 2];
    for (const delayed of delayedStatuses) {
      const root = await createSubmittedWorkspace();
      const phase = terminal;
      const resultMetadata = terminal === 'succeeded' ? { path: 'output.zip', size: 123 } : undefined;
      const remoteError = terminal === 'failed' ? 'algorithm failed' : undefined;
      await writeState(root, {
        phase,
        task_status: terminal,
        result_metadata: resultMetadata,
        remote_error: remoteError
      });
      const lifecycle = new ArgusTaskLifecycle({
        taskPort: { async inspect() { return { status: delayed }; } },
        transferPort: {},
        now: fixedNow
      });
      try {
        const status = await lifecycle.status({ workspaceDir: root });
        assert.equal(status.phase, phase);
        assert.equal(status.task_status, terminal);
        const state = await readState(root);
        assert.deepEqual(state.result_metadata, resultMetadata);
        assert.equal(state.remote_error, remoteError);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  }
});

test('concurrent status atomically rejects a delayed nonterminal snapshot after terminal state is written', async () => {
  const root = await createSubmittedWorkspace();
  let releaseSlowInspect;
  let markSlowInspectStarted;
  const slowInspectStarted = new Promise((resolve) => { markSlowInspectStarted = resolve; });
  const slowInspectRelease = new Promise((resolve) => { releaseSlowInspect = resolve; });
  const slow = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        markSlowInspectStarted();
        await slowInspectRelease;
        return { status: 1 };
      }
    },
    transferPort: {},
    now: fixedNow
  });
  const fast = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        return {
          status: 2,
          output_url: 'https://signed.invalid/output.zip',
          expiration_timestamp: 4_102_444_800,
          path: 'output.zip',
          size: 123
        };
      }
    },
    transferPort: {},
    now: fixedNow
  });

  try {
    const delayed = slow.status({ workspaceDir: root });
    await slowInspectStarted;
    assert.equal((await fast.status({ workspaceDir: root })).task_status, 'succeeded');
    releaseSlowInspect();
    const delayedResult = await delayed;
    assert.equal(delayedResult.phase, 'succeeded');
    assert.equal(delayedResult.task_status, 'succeeded');
    const state = await readState(root);
    assert.equal(state.phase, 'succeeded');
    assert.equal(state.task_status, 'succeeded');
    assert.deepEqual(state.result_metadata, {
      path: 'output.zip',
      md5: null,
      size: 123,
      expiration_timestamp: 4_102_444_800
    });
  } finally {
    releaseSlowInspect?.();
    await rm(root, { recursive: true, force: true });
  }
});

test('delayed succeeded status cannot regress a completed phase or its result metadata', async () => {
  const root = await createSubmittedWorkspace();
  let releaseInspect;
  let markInspectStarted;
  const inspectStarted = new Promise((resolve) => { markInspectStarted = resolve; });
  const inspectRelease = new Promise((resolve) => { releaseInspect = resolve; });
  const lifecycle = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        markInspectStarted();
        await inspectRelease;
        return {
          status: 2,
          path: 'stale-output.zip',
          md5: 'stale-md5',
          size: 1,
          expiration_timestamp: 4_102_444_800
        };
      }
    },
    transferPort: {},
    now: fixedNow
  });
  const completedMetadata = {
    path: 'output.zip',
    md5: 'final-md5',
    size: 999,
    expiration_timestamp: 4_102_444_900
  };

  try {
    const delayed = lifecycle.status({ workspaceDir: root });
    await inspectStarted;
    await writeState(root, {
      phase: 'completed',
      task_status: 'succeeded',
      result_status: 'success',
      result_metadata: completedMetadata,
      completed_at: '2026-07-10T00:01:00.000Z'
    });
    releaseInspect();
    const status = await delayed;
    assert.equal(status.phase, 'completed');
    assert.equal(status.task_status, 'succeeded');
    const state = await readState(root);
    assert.equal(state.phase, 'completed');
    assert.deepEqual(state.result_metadata, completedMetadata);
  } finally {
    releaseInspect?.();
    await rm(root, { recursive: true, force: true });
  }
});

test('delayed succeeded status cannot regress a finalizing phase', async () => {
  const root = await createSubmittedWorkspace();
  let releaseInspect;
  let markInspectStarted;
  const inspectStarted = new Promise((resolve) => { markInspectStarted = resolve; });
  const inspectRelease = new Promise((resolve) => { releaseInspect = resolve; });
  const lifecycle = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        markInspectStarted();
        await inspectRelease;
        return { status: 2, path: 'stale-output.zip', size: 1 };
      }
    },
    transferPort: {},
    now: fixedNow
  });

  try {
    const delayed = lifecycle.status({ workspaceDir: root });
    await inspectStarted;
    await writeState(root, {
      phase: 'finalizing',
      task_status: 'succeeded',
      result_metadata: { path: 'output.zip', size: 999 }
    });
    releaseInspect();
    const status = await delayed;
    assert.equal(status.phase, 'finalizing');
    const state = await readState(root);
    assert.equal(state.phase, 'finalizing');
    assert.deepEqual(state.result_metadata, { path: 'output.zip', size: 999 });
  } finally {
    releaseInspect?.();
    await rm(root, { recursive: true, force: true });
  }
});

test('existing result reconciles a crash between result and state checkpoints', async () => {
  for (const entrypoint of ['status', 'collect']) {
    for (const outcome of [
      { taskStatus: 'succeeded', resultStatus: 'partial', expectedPhase: 'completed' },
      { taskStatus: 'failed', resultStatus: 'error', expectedPhase: 'failed' }
    ]) {
      const root = await createSubmittedWorkspace();
      let inspectCalls = 0;
      await writeState(root, {
        phase: outcome.taskStatus === 'succeeded' ? 'finalizing' : 'failed',
        task_status: outcome.taskStatus,
        result_status: null,
        last_error: outcome.taskStatus === 'succeeded'
          ? { code: 'COLLECT_FAILED', message: 'stale retry error' }
          : null
      });
      const persistedResult = await writeResult(root, {
        region: 'global',
        workspace_dir: root,
        task_code: 'task-1',
        task_status: outcome.taskStatus,
        result_status: outcome.resultStatus,
        missing_ids: outcome.resultStatus === 'partial' ? ['000001'] : [],
        warnings: [],
        error: outcome.resultStatus === 'error'
          ? { code: 'ALGORITHM_FAILED', message: 'failed' }
          : null
      });
      const lifecycle = new ArgusTaskLifecycle({
        taskPort: {
          async inspect() {
            inspectCalls += 1;
            throw new Error('existing result must bypass remote inspection');
          }
        },
        transferPort: {},
        now: fixedNow
      });
      try {
        const response = await lifecycle[entrypoint]({ workspaceDir: root });
        assert.equal(response.task_status, outcome.taskStatus);
        assert.equal(response.result_status, outcome.resultStatus);
        if (entrypoint === 'collect') assert.deepEqual(response, persistedResult);
        assert.equal(inspectCalls, 0);
        const state = await readState(root);
        assert.equal(state.phase, outcome.expectedPhase);
        assert.equal(state.task_status, outcome.taskStatus);
        assert.equal(state.result_status, outcome.resultStatus);
        if (outcome.taskStatus === 'succeeded') {
          assert.equal(state.completed_at, fixedNow().toISOString());
          assert.equal(state.last_error, null);
          assert.equal(state.remote_error, null);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  }
});

test('collect never consumes a conflicting terminal snapshot rejected by persisted state', async () => {
  for (const scenario of [
    { current: 'succeeded', delayed: 3 },
    { current: 'failed', delayed: 2 }
  ]) {
    const root = await createSubmittedWorkspace();
    let downloads = 0;
    await writeState(root, {
      phase: scenario.current,
      task_status: scenario.current,
      result_metadata: scenario.current === 'succeeded' ? { path: 'output.zip', size: 123 } : undefined,
      remote_error: scenario.current === 'failed' ? 'algorithm failed' : null
    });
    const lifecycle = new ArgusTaskLifecycle({
      taskPort: {
        async inspect() {
          return scenario.delayed === 2
            ? {
                status: 2,
                output_url: 'https://signed.invalid/output.zip',
                expiration_timestamp: 4_102_444_800
              }
            : { status: 3, error_message: 'delayed conflicting failure' };
        }
      },
      transferPort: {
        async download() { downloads += 1; }
      },
      now: fixedNow
    });
    try {
      const result = await lifecycle.collect({ workspaceDir: root });
      assert.equal(result.task_status, scenario.current);
      assert.equal(downloads, 0);
      await assert.rejects(() => stat(join(root, 'result.json')), /ENOENT/);
      const state = await readState(root);
      assert.equal(state.phase, scenario.current);
      assert.equal(state.task_status, scenario.current);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

for (const scenario of [
  { status: 'success', missingIds: [] },
  { status: 'partial', missingIds: ['000001'] },
  { status: 'error', missingIds: [] }
]) {
  test(`collect validates and indexes a ${scenario.status} output`, async () => {
    const root = await createSubmittedWorkspace({ imageCount: scenario.status === 'partial' ? 2 : 1 });
    const sourceZip = join(root, 'remote.zip');
    await writeOutputZip(sourceZip, {
      manifest: validManifest({ status: scenario.status, missingIds: scenario.missingIds })
    });
    const calls = { inspect: 0, download: 0 };
    const lifecycle = lifecycleForOutput(sourceZip, calls);
    try {
      const result = await lifecycle.collect({ workspaceDir: root });
      assert.equal(result.task_status, 'succeeded');
      assert.equal(result.result_status, scenario.status);
      assert.deepEqual(result.missing_ids, scenario.missingIds);
      assert.equal(calls.inspect, 1);
      assert.equal(calls.download, 1);
      if (scenario.status !== 'error') {
        assert.match(result.point_cloud_path, /pointcloud\/merged\.glb$/);
        assert.equal(result.depth_maps.length, 1);
        assert.equal(result.poses.length, 1);
      }

      const again = await lifecycle.collect({ workspaceDir: root });
      assert.deepEqual(again, result);
      assert.equal(calls.inspect, 1);
      assert.equal(calls.download, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('concurrent collect calls share the workspace lock and download exactly once', async () => {
  const root = await createSubmittedWorkspace();
  const sourceZip = join(root, 'remote.zip');
  await writeOutputZip(sourceZip);
  const calls = { inspect: 0, download: 0 };
  const lifecycle = lifecycleForOutput(sourceZip, calls, { delayDownload: true });
  try {
    const [one, two] = await Promise.all([
      lifecycle.collect({ workspaceDir: root }),
      lifecycle.collect({ workspaceDir: root })
    ]);
    assert.deepEqual(one, two);
    assert.equal(calls.inspect, 1);
    assert.equal(calls.download, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('collect lock heartbeats during long work and cannot be stolen after staleMs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-lock-heartbeat-'));
  let active = 0;
  let maximumActive = 0;
  let releaseFirst;
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstRelease = new Promise((resolve) => { releaseFirst = resolve; });
  const options = { waitMs: 500, staleMs: 40, heartbeatMs: 10 };

  const operation = async (wait) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    try {
      await wait;
    } finally {
      active -= 1;
    }
  };

  try {
    const first = withWorkspaceLock(root, async () => {
      markFirstStarted();
      await operation(firstRelease);
    }, options);
    await firstStarted;
    const initialMtime = (await stat(getWorkspacePaths(root).collectLockPath)).mtimeMs;
    await delay(75);
    const heartbeatMtime = (await stat(getWorkspacePaths(root).collectLockPath)).mtimeMs;
    assert.ok(heartbeatMtime > initialMtime);

    const second = withWorkspaceLock(root, () => operation(Promise.resolve()), options);
    await delay(50);
    assert.equal(maximumActive, 1);
    releaseFirst();
    await Promise.all([first, second]);
    assert.equal(maximumActive, 1);
  } finally {
    releaseFirst?.();
    await rm(root, { recursive: true, force: true });
  }
});

test('collect lock does not steal an old-mtime lock from a live local owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-lock-live-'));
  const lockPath = getWorkspacePaths(root).collectLockPath;
  const old = new Date(Date.now() - 60_000);
  await writeFile(lockPath, `${JSON.stringify({
    pid: process.pid,
    created_at: old.toISOString()
  })}\n`);
  await utimes(lockPath, old, old);
  try {
    await assert.rejects(
      () => withWorkspaceLock(root, () => Promise.resolve(), { waitMs: 40, staleMs: 5 }),
      /Another collect operation still owns this workspace/
    );
    assert.equal(JSON.parse(await readFile(lockPath, 'utf8')).pid, process.pid);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('collect lock recovers an expired lock whose local owner has exited', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-lock-crashed-'));
  const lockPath = getWorkspacePaths(root).collectLockPath;
  const old = new Date(Date.now() - 60_000);
  await writeFile(lockPath, `${JSON.stringify({
    owner_token: 'crashed-owner',
    pid: 99_999_999,
    hostname: hostname(),
    created_at: old.toISOString()
  })}\n`);
  await utimes(lockPath, old, old);
  try {
    const value = await withWorkspaceLock(root, () => Promise.resolve('recovered'), {
      waitMs: 100,
      staleMs: 5,
      heartbeatMs: 2
    });
    assert.equal(value, 'recovered');
    await assert.rejects(() => stat(lockPath), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an uninitialized lock gets a creation grace period before stale recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-lock-uninitialized-'));
  const lockPath = getWorkspacePaths(root).collectLockPath;
  await writeFile(lockPath, '');
  const recent = new Date(Date.now() - 100);
  await utimes(lockPath, recent, recent);
  try {
    await assert.rejects(
      () => withWorkspaceLock(root, () => Promise.resolve(), { waitMs: 30, staleMs: 1 }),
      /Another collect operation still owns this workspace/
    );
    const old = new Date(Date.now() - 2_000);
    await utimes(lockPath, old, old);
    assert.equal(
      await withWorkspaceLock(root, () => Promise.resolve('recovered'), {
        waitMs: 2_000,
        staleMs: 1,
        heartbeatMs: 1,
        pollMs: 1
      }),
      'recovered'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stale lock recovery serializes many contenders without deleting a new owner', async () => {
  const runTrial = async (trial) => {
    const root = await mkdtemp(join(tmpdir(), 'argus-lock-stress-'));
    const lockPath = getWorkspacePaths(root).collectLockPath;
    const old = new Date(Date.now() - 60_000);
    await writeFile(lockPath, `${JSON.stringify({
      owner_token: `crashed-owner-${trial}`,
      pid: 99_999_999,
      hostname: hostname(),
      created_at: old.toISOString()
    })}\n`);
    await utimes(lockPath, old, old);
    let active = 0;
    let maximumActive = 0;
    try {
      await Promise.all(Array.from({ length: 20 }, () => withWorkspaceLock(root, async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        try {
          await delay(2);
        } finally {
          active -= 1;
        }
      }, {
        waitMs: 5_000,
        staleMs: 1,
        heartbeatMs: 1,
        pollMs: 1
      })));
      assert.equal(maximumActive, 1, `trial ${trial} admitted concurrent lock owners`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  };

  for (let batch = 0; batch < 5; batch += 1) {
    await Promise.all(Array.from(
      { length: 5 },
      (_, index) => runTrial(batch * 5 + index)
    ));
  }
});

test('collect lock release never removes a replacement owned by another token', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-lock-owner-token-'));
  const lockPath = getWorkspacePaths(root).collectLockPath;
  const replacement = {
    owner_token: 'replacement-owner',
    pid: process.pid,
    hostname: hostname(),
    created_at: new Date().toISOString()
  };
  try {
    await withWorkspaceLock(root, async () => {
      await rm(lockPath, { force: true });
      await writeFile(lockPath, `${JSON.stringify(replacement)}\n`);
    }, { heartbeatMs: 10_000 });
    assert.deepEqual(JSON.parse(await readFile(lockPath, 'utf8')), replacement);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('collect reports processing without downloading and records remote failure as result error', async () => {
  const processingRoot = await createSubmittedWorkspace();
  const failedRoot = await createSubmittedWorkspace();
  let downloads = 0;
  try {
    const processing = new ArgusTaskLifecycle({
      taskPort: { async inspect() { return { status: 1 }; } },
      transferPort: { async download() { downloads += 1; } },
      now: fixedNow
    });
    assert.equal((await processing.collect({ workspaceDir: processingRoot })).task_status, 'processing');
    assert.equal(downloads, 0);

    const failed = new ArgusTaskLifecycle({
      taskPort: { async inspect() { return { status: 3, error_message: 'invalid panorama' }; } },
      transferPort: { async download() { downloads += 1; } },
      now: fixedNow
    });
    const result = await failed.collect({ workspaceDir: failedRoot });
    assert.equal(result.task_status, 'failed');
    assert.equal(result.result_status, 'error');
    assert.equal(result.error.code, 'ALGORITHM_FAILED');
    assert.equal(downloads, 0);
  } finally {
    await rm(processingRoot, { recursive: true, force: true });
    await rm(failedRoot, { recursive: true, force: true });
  }
});

test('expired result URL and interrupted download leave no final result', async () => {
  const expiredRoot = await createSubmittedWorkspace();
  const interruptedRoot = await createSubmittedWorkspace();
  try {
    const expired = new ArgusTaskLifecycle({
      taskPort: { async inspect() { return { status: 2, output_url: 'https://signed.invalid/x', expiration_timestamp: 1 }; } },
      transferPort: { async download() { throw new Error('must not download'); } },
      now: fixedNow
    });
    await assert.rejects(
      () => expired.collect({ workspaceDir: expiredRoot }),
      (error) => error.code === 'RESULT_EXPIRED'
    );

    const interrupted = new ArgusTaskLifecycle({
      taskPort: { async inspect() { return { status: 2, output_url: 'https://signed.invalid/x', expiration_timestamp: 4_102_444_800 }; } },
      transferPort: { async download() { throw new Error('connection reset'); } },
      now: fixedNow
    });
    await assert.rejects(() => interrupted.collect({ workspaceDir: interruptedRoot }), /connection reset/);
    await assert.rejects(() => stat(join(interruptedRoot, 'result.json')), /ENOENT/);
  } finally {
    await rm(expiredRoot, { recursive: true, force: true });
    await rm(interruptedRoot, { recursive: true, force: true });
  }
});

function lifecycleForOutput(sourceZip, calls, { delayDownload = false } = {}) {
  return new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        calls.inspect += 1;
        const file = await stat(sourceZip);
        return {
          status: 2,
          output_url: 'https://signed.invalid/output.zip?q=temporary',
          expiration_timestamp: 4_102_444_800,
          size: file.size,
          md5: await md5(sourceZip)
        };
      }
    },
    transferPort: {
      async download({ outputPath }) {
        calls.download += 1;
        if (delayDownload) await new Promise((resolve) => setTimeout(resolve, 75));
        await copyFile(sourceZip, outputPath);
        const file = await stat(outputPath);
        return { bytes: file.size, md5: await md5(outputPath), content_length: file.size };
      }
    },
    now: fixedNow
  });
}

async function createSubmittedWorkspace({ imageCount = 1 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'argus-run-'));
  await writeState(root, {
    region: 'global',
    phase: 'submitted',
    task_code: 'task-1',
    task_status: 'queued',
    result_status: null,
    workspace_dir: root,
    input: { image_count: imageCount }
  });
  return root;
}

function fakeLease() {
  return {
    tmpSecretId: 'a',
    tmpSecretKey: 'b',
    sessionToken: 'c',
    bucket: 'bucket',
    region: 'region',
    prefix: 'prefix/'
  };
}

async function md5(path) {
  return createHash('md5').update(await readFile(path)).digest('hex');
}

function fixedNow() {
  return new Date('2026-07-10T00:00:00Z');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
