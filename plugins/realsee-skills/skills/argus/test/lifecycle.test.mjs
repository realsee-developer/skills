import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArgusTaskLifecycle } from '../src/lifecycle.mjs';
import { readState, writeState } from '../src/state.mjs';
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
