import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GatewayClient } from '../src/gateway.mjs';
import { ArgusTaskLifecycle } from '../src/lifecycle.mjs';
import { GatewayArgusTaskPort } from '../src/ports.mjs';
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
      return { ...fakeLease(), trace_id: 'trace-file', request_id: 'request-file' };
    },
    async submit(request) {
      calls.submit += 1;
      assert.equal(request.privateCosKey, 'vrfile/release/open_task_original/test/input.zip');
      return { task_code: 'task-start', trace_id: 'trace-submit', request_id: 'request-submit' };
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
    assert.equal(state.trace_id, 'trace-submit');
    assert.equal(state.request_id, 'request-submit');
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
    async allocateUpload() {
      return {
        ...fakeLease(),
        trace_id: 'trace-file-token',
        request_id: 'request-file-token'
      };
    },
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
        return error.code === 'SUBMISSION_UNKNOWN' &&
          error.traceId === null &&
          error.requestId === null;
      }
    );
    assert.equal(submits, 1);
    const state = await readState(workspace);
    assert.equal(state.phase, 'submission_unknown');
    assert.equal(state.task_code, undefined);
    assert.equal(state.trace_id, null);
    assert.equal(state.request_id, null);
    assert.equal(state.last_error.trace_id, undefined);
    assert.equal(state.last_error.request_id, undefined);
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
          expiration_timestamp: 4_102_444_800,
          trace_id: 'trace-status',
          request_id: 'request-status'
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
    assert.equal(status.trace_id, 'trace-status');
    assert.equal(status.request_id, 'request-status');
    const persisted = await readFile(join(root, 'state.json'), 'utf8');
    assert.equal(persisted.includes('signed.invalid'), false);
    assert.equal(persisted.includes('do-not-save'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('status errors retain Gateway diagnostics in the exception and workspace', async () => {
  const root = await createSubmittedWorkspace();
  const lifecycle = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        const error = new Error('remote rejected the status request');
        error.code = 'GATEWAY_REJECTED';
        error.stage = 'task-info';
        error.traceId = 'trace-status-error';
        error.requestId = 'request-status-error';
        throw error;
      }
    },
    transferPort: {},
    now: fixedNow
  });

  try {
    await assert.rejects(
      () => lifecycle.status({ workspaceDir: root }),
      (error) =>
        error.traceId === 'trace-status-error' &&
        error.requestId === 'request-status-error'
    );
    const state = await readState(root);
    assert.equal(state.trace_id, 'trace-status-error');
    assert.equal(state.request_id, 'request-status-error');
    assert.equal(state.last_error.trace_id, 'trace-status-error');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a successful status clears a prior task-info error', async () => {
  const root = await createSubmittedWorkspace();
  let attempts = 0;
  const lifecycle = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error('temporary status failure');
          error.code = 'GATEWAY_REJECTED';
          error.stage = 'task-info';
          error.traceId = 'trace-failed-status';
          throw error;
        }
        return { status: 1, trace_id: 'trace-recovered-status' };
      }
    },
    transferPort: {},
    now: fixedNow
  });

  try {
    await assert.rejects(() => lifecycle.status({ workspaceDir: root }), /temporary status failure/);
    const status = await lifecycle.status({ workspaceDir: root });
    assert.equal(status.task_status, 'processing');
    assert.equal(status.trace_id, 'trace-recovered-status');
    assert.equal(status.error, null);
    assert.equal((await readState(root)).last_error, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('status clears diagnostics omitted by the current Gateway response', async () => {
  const root = await createSubmittedWorkspace();
  let attempts = 0;
  const lifecycle = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        attempts += 1;
        return attempts === 1
          ? {
              status: 1,
              trace_id: 'trace-prior-status',
              request_id: 'request-prior-status'
            }
          : { status: 1 };
      }
    },
    transferPort: {},
    now: fixedNow
  });

  try {
    const prior = await lifecycle.status({ workspaceDir: root });
    assert.equal(prior.trace_id, 'trace-prior-status');
    assert.equal(prior.request_id, 'request-prior-status');

    const current = await lifecycle.status({ workspaceDir: root });
    assert.equal(current.trace_id, null);
    assert.equal(current.request_id, null);

    const state = await readState(root);
    assert.equal(state.trace_id, null);
    assert.equal(state.request_id, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an older status failure cannot overwrite a newer successful status', async () => {
  const root = await createSubmittedWorkspace();
  let inspections = 0;
  let rejectOlderInspection;
  let markOlderInspectionStarted;
  const olderInspectionStarted = new Promise((resolve) => {
    markOlderInspectionStarted = resolve;
  });
  const lifecycle = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        inspections += 1;
        if (inspections === 1) {
          markOlderInspectionStarted();
          return new Promise((resolve, reject) => {
            rejectOlderInspection = reject;
          });
        }
        return {
          status: 1,
          trace_id: 'trace-newer-status',
          request_id: 'request-newer-status'
        };
      }
    },
    transferPort: {},
    now: fixedNow
  });

  try {
    const olderStatus = lifecycle.status({ workspaceDir: root });
    const olderFailure = assert.rejects(
      olderStatus,
      (error) =>
        error.traceId === 'trace-older-status' &&
        error.requestId === 'request-older-status'
    );
    await olderInspectionStarted;

    const newerStatus = await lifecycle.status({ workspaceDir: root });
    assert.equal(newerStatus.task_status, 'processing');
    assert.equal(newerStatus.trace_id, 'trace-newer-status');
    assert.equal(newerStatus.request_id, 'request-newer-status');

    const error = new Error('older status request failed');
    error.stage = 'task-info';
    error.traceId = 'trace-older-status';
    error.requestId = 'request-older-status';
    rejectOlderInspection(error);
    await olderFailure;

    const state = await readState(root);
    assert.equal(state.task_status, 'processing');
    assert.equal(state.trace_id, 'trace-newer-status');
    assert.equal(state.request_id, 'request-newer-status');
    assert.equal(state.last_error ?? null, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an older successful status cannot overwrite a newer successful status', async () => {
  const root = await createSubmittedWorkspace();
  let inspections = 0;
  let resolveOlderInspection;
  let markOlderInspectionStarted;
  const olderInspectionStarted = new Promise((resolve) => {
    markOlderInspectionStarted = resolve;
  });
  const lifecycle = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        inspections += 1;
        if (inspections === 1) {
          markOlderInspectionStarted();
          return new Promise((resolve) => {
            resolveOlderInspection = resolve;
          });
        }
        return {
          status: 1,
          trace_id: 'trace-newer-status',
          request_id: 'request-newer-status'
        };
      }
    },
    transferPort: {},
    now: fixedNow
  });

  try {
    const olderStatus = lifecycle.status({ workspaceDir: root });
    await olderInspectionStarted;

    const newerStatus = await lifecycle.status({ workspaceDir: root });
    assert.equal(newerStatus.trace_id, 'trace-newer-status');
    assert.equal(newerStatus.request_id, 'request-newer-status');

    resolveOlderInspection({
      status: 1,
      trace_id: 'trace-older-status',
      request_id: 'request-older-status'
    });
    const delayedStatus = await olderStatus;
    assert.equal(delayedStatus.trace_id, 'trace-newer-status');
    assert.equal(delayedStatus.request_id, 'request-newer-status');

    const state = await readState(root);
    assert.equal(state.task_status, 'processing');
    assert.equal(state.trace_id, 'trace-newer-status');
    assert.equal(state.request_id, 'request-newer-status');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a later terminal status survives a revision conflict with an earlier nonterminal response', async () => {
  const root = await createSubmittedWorkspace();
  let inspections = 0;
  let resolveProcessingInspection;
  let resolveTerminalInspection;
  let markProcessingInspectionStarted;
  let markTerminalInspectionStarted;
  const processingInspectionStarted = new Promise((resolve) => {
    markProcessingInspectionStarted = resolve;
  });
  const terminalInspectionStarted = new Promise((resolve) => {
    markTerminalInspectionStarted = resolve;
  });
  const lifecycle = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        inspections += 1;
        if (inspections === 1) {
          markProcessingInspectionStarted();
          return new Promise((resolve) => {
            resolveProcessingInspection = resolve;
          });
        }
        markTerminalInspectionStarted();
        return new Promise((resolve) => {
          resolveTerminalInspection = resolve;
        });
      }
    },
    transferPort: {},
    now: fixedNow
  });

  try {
    const processingStatus = lifecycle.status({ workspaceDir: root });
    await processingInspectionStarted;
    const terminalStatus = lifecycle.status({ workspaceDir: root });
    await terminalInspectionStarted;

    resolveProcessingInspection({
      status: 1,
      trace_id: 'trace-processing-status',
      request_id: 'request-processing-status'
    });
    assert.equal((await processingStatus).task_status, 'processing');

    resolveTerminalInspection({
      status: 2,
      output_url: 'https://signed.invalid/output.zip',
      expiration_timestamp: 4_102_444_800,
      trace_id: 'trace-terminal-status',
      request_id: 'request-terminal-status'
    });
    const terminal = await terminalStatus;
    assert.equal(terminal.task_status, 'succeeded');
    assert.equal(terminal.trace_id, 'trace-terminal-status');
    assert.equal(terminal.request_id, 'request-terminal-status');

    const state = await readState(root);
    assert.equal(state.task_status, 'succeeded');
    assert.equal(state.trace_id, 'trace-terminal-status');
    assert.equal(state.request_id, 'request-terminal-status');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('status propagates non-enumerable Gateway envelope diagnostics', async () => {
  const root = await createSubmittedWorkspace();
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example',
    appKey: 'ak',
    appSecret: 'sk',
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/access_token')) {
        return gatewayEnvelope({
          data: { access_token: 'token', expire_at: 4_102_444_800 },
          traceId: 'trace-auth'
        });
      }
      return gatewayEnvelope({
        data: {
          status: 1,
          output_url: '',
          expiration_timestamp: 0,
          error_message: '',
          create_timestamp: 1,
          modify_timestamp: 2
        },
        traceId: 'trace-symbol-status',
        requestId: 'request-symbol-status'
      });
    }
  });
  const lifecycle = new ArgusTaskLifecycle({
    taskPort: new GatewayArgusTaskPort(gateway),
    transferPort: {},
    now: fixedNow
  });

  try {
    const status = await lifecycle.status({ workspaceDir: root });
    assert.equal(status.trace_id, 'trace-symbol-status');
    assert.equal(status.request_id, 'request-symbol-status');
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

test('collect never consumes a same-status snapshot rejected by the state revision CAS', async () => {
  const root = await createSubmittedWorkspace();
  let inspections = 0;
  let downloads = 0;
  let resolveOlderInspection;
  let markOlderInspectionStarted;
  const olderInspectionStarted = new Promise((resolve) => {
    markOlderInspectionStarted = resolve;
  });
  const lifecycle = new ArgusTaskLifecycle({
    taskPort: {
      async inspect() {
        inspections += 1;
        if (inspections === 1) {
          markOlderInspectionStarted();
          return new Promise((resolve) => {
            resolveOlderInspection = resolve;
          });
        }
        return {
          status: 2,
          output_url: 'https://download.invalid/newer-output.zip?' +
            ['sign', 'ature'].join('') + '=placeholder',
          expiration_timestamp: 1_900_000_000,
          md5: 'newer-md5',
          size: 42,
          trace_id: 'trace-newer-status',
          request_id: 'request-newer-status'
        };
      }
    },
    transferPort: {
      async download() {
        downloads += 1;
        throw new Error('stale snapshot must not be downloaded');
      }
    },
    now: fixedNow
  });

  try {
    const olderCollect = lifecycle.collect({ workspaceDir: root });
    await olderInspectionStarted;

    const newerStatus = await lifecycle.status({ workspaceDir: root });
    assert.equal(newerStatus.task_status, 'succeeded');
    assert.equal(newerStatus.trace_id, 'trace-newer-status');

    resolveOlderInspection({
      status: 2,
      trace_id: 'trace-older-status',
      request_id: 'request-older-status'
    });
    const delayedCollect = await olderCollect;
    assert.equal(delayedCollect.task_status, 'succeeded');
    assert.equal(delayedCollect.trace_id, 'trace-newer-status');
    assert.equal(delayedCollect.request_id, 'request-newer-status');
    assert.equal(downloads, 0);
    await assert.rejects(() => stat(join(root, 'result.json')), /ENOENT/u);
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
      assert.equal(result.trace_id, 'trace-collect');
      assert.equal(result.request_id, 'request-collect');
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
      taskPort: { async inspect() {
        return {
          status: 2,
          output_url: 'https://signed.invalid/x',
          expiration_timestamp: 1,
          trace_id: 'trace-expired',
          request_id: 'request-expired'
        };
      } },
      transferPort: { async download() { throw new Error('must not download'); } },
      now: fixedNow
    });
    await assert.rejects(
      () => expired.collect({ workspaceDir: expiredRoot }),
      (error) =>
        error.code === 'RESULT_EXPIRED' &&
        error.traceId === 'trace-expired' &&
        error.requestId === 'request-expired'
    );
    const expiredState = await readState(expiredRoot);
    assert.equal(expiredState.last_error.trace_id, 'trace-expired');
    assert.equal(expiredState.last_error.request_id, 'request-expired');

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
          md5: await md5(sourceZip),
          trace_id: 'trace-collect',
          request_id: 'request-collect'
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

function gatewayEnvelope({ data, traceId, requestId = 'request-test' }) {
  return new Response(JSON.stringify({
    request_id: requestId,
    trace_id: traceId,
    business_code: '',
    osi_request_id: '',
    code: 0,
    status: 'success',
    data,
    cost: 1
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
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
