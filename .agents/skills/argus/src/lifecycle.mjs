import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import {
  createCanonicalInputZip,
  extractZipSafely,
  normalizeInputZip
} from './archive.mjs';
import { assertUploadConsent } from './consent.mjs';
import { getGatewayResponseMetadata, mapTaskStatus } from './gateway.mjs';
import { validateImageFiles } from './input.mjs';
import { buildPrivateCosKey } from './ports.mjs';
import { validateArgusOutput } from './result-validator.mjs';
import { redactText, redactUrlForLog } from './sanitizer.mjs';
import {
  getWorkspacePaths,
  getStateRevision,
  readResult,
  readState,
  updateState,
  withWorkspaceLock,
  writeResult,
  writeState
} from './state.mjs';
import { createRunWorkspace } from './workspace.mjs';

const INPUT_OBJECT_NAME = 'input.zip';

export class ArgusLifecycleError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ArgusLifecycleError';
    this.code = options.code ?? 'ARGUS_ERROR';
    this.stage = options.stage ?? null;
    this.retryable = options.retryable ?? false;
    this.workspaceDir = options.workspaceDir ?? null;
    const diagnostics = diagnosticIdentifiers(options);
    this.traceId = diagnostics.trace_id ?? null;
    this.requestId = diagnostics.request_id ?? null;
  }
}

export class ArgusTaskLifecycle {
  constructor({ taskPort, transferPort, now = () => new Date() }) {
    if (!taskPort || !transferPort) throw new TypeError('taskPort and transferPort are required');
    this.taskPort = taskPort;
    this.transferPort = transferPort;
    this.now = now;
  }

  async start({ images, zip, workspaceRoot, yes, title, region, signal }) {
    assertStartRequest({ images, zip, workspaceRoot, region });
    const workspaceDir = await createRunWorkspace(workspaceRoot, this.now());
    const paths = getWorkspacePaths(workspaceDir);
    await writeState(workspaceDir, {
      region,
      phase: 'preparing',
      task_status: null,
      result_status: null,
      workspace_dir: workspaceDir,
      created_at: this.now().toISOString()
    });

    let latestDiagnostics = {};
    try {
      const prepared = images?.length
        ? await prepareImages(images, paths.inputZipPath)
        : await normalizeInputZip(resolve(zip), paths.inputStagingDir, paths.inputZipPath);
      const imageRecords = prepared.images ?? prepared.entries ?? [];
      const warnings = prepared.warnings ?? [];
      const archiveSha256 = prepared.sha256 ?? await hashFile(paths.inputZipPath, 'sha256');
      const archiveBytes = prepared.bytes ?? (await stat(paths.inputZipPath)).size;
      const consent = {
        ...assertUploadConsent({
          yes,
          files: images?.length ? images : [zip],
          region,
          service: 'Realsee Argus 2.0'
        }),
        archive_sha256: archiveSha256,
        archive_bytes: archiveBytes
      };
      if (await hashFile(paths.inputZipPath, 'sha256') !== archiveSha256) {
        throw new Error('Canonical input ZIP changed after validation');
      }
      const inputSummary = {
        mode: images?.length ? 'images' : 'zip',
        image_count: imageRecords.length,
        archive_sha256: archiveSha256,
        archive_bytes: archiveBytes,
        images: imageRecords.map(toImageSummary),
        warnings
      };
      await writeState(workspaceDir, {
        phase: 'validated',
        input: inputSummary,
        upload_consent: consent
      });

      const initialLease = await this.taskPort.allocateUpload();
      latestDiagnostics = diagnosticIdentifiers(initialLease);
      const uploadReceipt = await this.transferPort.upload({
        filePath: paths.inputZipPath,
        objectName: INPUT_OBJECT_NAME,
        lease: initialLease,
        refreshLease: async () => {
          const lease = await this.taskPort.allocateUpload();
          latestDiagnostics = diagnosticIdentifiers(lease);
          return lease;
        },
        signal
      });
      const privateCosKey = buildPrivateCosKey(uploadReceipt, initialLease, INPUT_OBJECT_NAME);
      await writeState(workspaceDir, {
        phase: 'uploaded',
        ...diagnosticStateFields(latestDiagnostics),
        upload: {
          provider: uploadReceipt.provider ?? uploadReceipt.providerName ?? null,
          object_path: privateCosKey,
          key: uploadReceipt.key ?? INPUT_OBJECT_NAME,
          etag: uploadReceipt.etag ?? null,
          bytes: uploadReceipt.bytes ?? null,
          bucket: uploadReceipt.bucket ?? null,
          region: uploadReceipt.region ?? null
        }
      });

      let submitted;
      try {
        submitted = await this.taskPort.submit({
          privateCosKey,
          title: normalizeTitle(title ?? defaultTitle({ images, zip }))
        });
        latestDiagnostics = diagnosticIdentifiers(submitted);
      } catch (error) {
        if (error?.submissionUnknown) {
          const diagnostics = diagnosticIdentifiers(error);
          const safe = {
            code: 'SUBMISSION_UNKNOWN',
            stage: 'submit',
            retryable: false,
            message: 'Submission response was lost; do not submit this workspace again',
            ...diagnostics
          };
          await writeState(workspaceDir, {
            phase: 'submission_unknown',
            ...diagnosticStateFields(diagnostics),
            last_error: safe
          });
          throw new ArgusLifecycleError(safe.message, {
            cause: error,
            code: 'SUBMISSION_UNKNOWN',
            stage: 'submit',
            retryable: false,
            workspaceDir,
            ...lifecycleDiagnosticOptions(diagnostics)
          });
        }
        throw error;
      }
      const taskCode = submitted?.task_code ?? submitted?.taskCode;
      if (typeof taskCode !== 'string' || !taskCode) {
        throw new ArgusLifecycleError('Gateway submit response did not include task_code', {
          code: 'GATEWAY_PROTOCOL_ERROR',
          stage: 'submit',
          workspaceDir,
          ...lifecycleDiagnosticOptions(latestDiagnostics)
        });
      }
      return writeState(workspaceDir, {
        phase: 'submitted',
        task_code: taskCode,
        task_status: 'queued',
        submitted_at: this.now().toISOString(),
        ...diagnosticStateFields(latestDiagnostics)
      });
    } catch (error) {
      if (error instanceof ArgusLifecycleError && error.code === 'SUBMISSION_UNKNOWN') throw error;
      const safe = safeError(error);
      await writeState(workspaceDir, {
        phase: 'failed',
        ...diagnosticStateFields(safe),
        last_error: safe
      }).catch(() => {});
      if (error instanceof ArgusLifecycleError) throw error;
      throw new ArgusLifecycleError(safe.message, {
        cause: error,
        code: error?.code ?? 'START_FAILED',
        stage: error?.stage ?? 'start',
        retryable: Boolean(error?.retryable),
        workspaceDir,
        ...lifecycleDiagnosticOptions(safe)
      });
    } finally {
      await rm(paths.inputStagingDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async status({ workspaceDir }) {
    const absoluteWorkspace = resolve(workspaceDir);
    const state = await requireState(absoluteWorkspace);
    if (state.phase === 'submission_unknown') return publicStatus(state);
    if (!state.task_code) throw new Error('state.json does not contain task_code');
    const existing = await readResult(absoluteWorkspace);
    if (existing) {
      return publicStatus(await reconcileResultState(absoluteWorkspace, existing, this.now()));
    }

    const observedStateRevision = getStateRevision(state);
    const snapshot = await inspectRemote(
      this.taskPort,
      absoluteWorkspace,
      state.task_code,
      observedStateRevision
    );
    const { state: next } = await persistSnapshot(
      absoluteWorkspace,
      snapshot,
      this.now(),
      observedStateRevision
    );
    return publicStatus(next);
  }

  async collect({ workspaceDir, signal }) {
    const absoluteWorkspace = resolve(workspaceDir);
    await requireState(absoluteWorkspace);
    return withWorkspaceLock(absoluteWorkspace, async () => {
      const existing = await readResult(absoluteWorkspace);
      if (existing) {
        await reconcileResultState(absoluteWorkspace, existing, this.now());
        return existing;
      }

      let state = await requireState(absoluteWorkspace);
      if (state.phase === 'submission_unknown') {
        throw new ArgusLifecycleError(
          'Submission outcome is unknown and no task_code is available; do not resubmit automatically',
          { code: 'SUBMISSION_UNKNOWN', stage: 'collect', workspaceDir: absoluteWorkspace }
        );
      }
      if (!state.task_code) throw new Error('state.json does not contain task_code');

      const observedStateRevision = getStateRevision(state);
      const snapshot = await inspectRemote(
        this.taskPort,
        absoluteWorkspace,
        state.task_code,
        observedStateRevision
      );
      const persisted = await persistSnapshot(
        absoluteWorkspace,
        snapshot,
        this.now(),
        observedStateRevision
      );
      state = persisted.state;
      if (!persisted.applied || state.task_status !== snapshot.taskStatus) {
        return publicStatus(state);
      }
      if (snapshot.taskStatus === 'queued' || snapshot.taskStatus === 'processing') {
        return publicStatus(state);
      }
      if (snapshot.taskStatus === 'failed') {
        const result = await writeResult(absoluteWorkspace, {
          region: state.region,
          workspace_dir: absoluteWorkspace,
          task_code: state.task_code,
          task_status: 'failed',
          result_status: 'error',
          trace_id: state.trace_id ?? null,
          request_id: state.request_id ?? null,
          error: {
            code: 'ALGORITHM_FAILED',
            message: snapshot.errorMessage || 'Argus processing failed'
          },
          missing_ids: [],
          warnings: []
        });
        await writeState(absoluteWorkspace, { phase: 'failed', result_status: 'error' });
        return result;
      }

      const paths = getWorkspacePaths(absoluteWorkspace);
      await writeState(absoluteWorkspace, { phase: 'finalizing' });
      try {
        assertResultLease(snapshot, this.now());
        const reusable = await canReuseDownload(paths.outputZipPath, state.download, snapshot);
        let download = state.download;
        if (!reusable) {
          download = await this.transferPort.download({
            url: snapshot.outputUrl,
            outputPath: paths.outputZipPath,
            expectedBytes: snapshot.size,
            expectedMd5: snapshot.md5,
            signal
          });
          await writeState(absoluteWorkspace, {
            download: {
              bytes: download.bytes,
              md5: download.md5,
              content_length: download.content_length ?? null
            }
          });
        }

        const inputCount = state.input?.image_count ?? 99;
        // A prior collect may have completed extraction but failed semantic
        // validation before result.json was committed. The ZIP is already
        // integrity-checked and retained, so rebuild the derived directory.
        await rm(paths.outputDir, { recursive: true, force: true });
        await extractZipSafely(paths.outputZipPath, paths.outputDir, {
          maxEntries: 5 + inputCount * 4
        });
        const validated = await validateArgusOutput(paths.outputDir, {
          expectedInputNames: state.input?.images?.map((image) => image.name) ?? undefined
        });
        const result = await writeResult(
          absoluteWorkspace,
          buildLocalResult({ state, paths, validated, download })
        );
        await writeState(absoluteWorkspace, {
          phase: 'completed',
          task_status: 'succeeded',
          result_status: result.result_status,
          completed_at: this.now().toISOString(),
          last_error: null
        });
        return result;
      } catch (error) {
        const safe = safeError(error, undefined, diagnosticIdentifiers(state));
        await writeState(absoluteWorkspace, {
          phase: 'finalizing',
          last_error: safe
        }).catch(() => {});
        throw new ArgusLifecycleError(safe.message, {
          cause: error,
          code: error?.code ?? 'COLLECT_FAILED',
          stage: error?.stage ?? 'collect',
          retryable: true,
          workspaceDir: absoluteWorkspace,
          ...lifecycleDiagnosticOptions(safe)
        });
      }
    });
  }
}

async function prepareImages(images, outputPath) {
  const validation = await validateImageFiles(images.map((path) => resolve(path)));
  const entries = Array.isArray(validation) ? validation : validation.images;
  const warnings = validation.warnings ?? [];
  const archive = await createCanonicalInputZip(entries, outputPath);
  return { ...archive, images: entries, warnings };
}

function normalizeRemoteSnapshot(info) {
  if (!info || typeof info !== 'object') throw new Error('task/info returned no data');
  const result = info.result && typeof info.result === 'object' ? info.result : {};
  const diagnostics = diagnosticIdentifiers(info);
  return {
    taskStatus: mapTaskStatus(info.status),
    outputUrl: info.output_url ?? info.presigned_url ?? result.output_url ?? result.presigned_url ?? null,
    expirationTimestamp: optionalInteger(
      info.expiration_timestamp ?? result.expiration_timestamp,
      'expiration_timestamp'
    ),
    md5: optionalString(info.md5 ?? result.md5),
    size: optionalInteger(info.size ?? result.size, 'size'),
    path: optionalString(info.path ?? result.path),
    errorMessage: optionalString(info.error_message) ? safeMessage(info.error_message) : null,
    ...diagnostics
  };
}

async function persistSnapshot(workspaceDir, snapshot, now, observedStateRevision) {
  const phase = {
    queued: 'submitted',
    processing: 'processing',
    succeeded: 'succeeded',
    failed: 'failed'
  }[snapshot.taskStatus];
  let applied = false;
  const state = await updateState(workspaceDir, (current) => {
    const revisionMatches = getStateRevision(current) === observedStateRevision;
    const advancesToTerminal =
      ['succeeded', 'failed'].includes(snapshot.taskStatus) &&
      !['succeeded', 'failed'].includes(current.task_status) &&
      (PHASE_RANK[current.phase] ?? -1) < (PHASE_RANK[phase] ?? -1);
    if (!revisionMatches && !advancesToTerminal) return current;
    applied = true;
    const diagnostics = diagnosticStateFields(snapshot);
    if (
      ['succeeded', 'failed'].includes(current.task_status) &&
      current.task_status !== snapshot.taskStatus
    ) {
      return {
        ...current,
        ...diagnostics,
        last_error: clearTransientStatusError(current),
        checked_at: now.toISOString()
      };
    }
    if ((PHASE_RANK[current.phase] ?? -1) > (PHASE_RANK[phase] ?? -1)) {
      return {
        ...current,
        ...diagnostics,
        last_error: clearTransientStatusError(current),
        checked_at: now.toISOString()
      };
    }
    const resultMetadata = snapshot.taskStatus === 'succeeded'
      ? {
          path: snapshot.path,
          md5: snapshot.md5,
          size: snapshot.size,
          expiration_timestamp: snapshot.expirationTimestamp
        }
      : current.result_metadata;
    return {
      ...current,
      phase,
      task_status: snapshot.taskStatus,
      result_metadata: resultMetadata,
      remote_error: snapshot.taskStatus === 'failed' ? snapshot.errorMessage : null,
      last_error: clearTransientStatusError(current),
      checked_at: now.toISOString(),
      ...diagnostics
    };
  });
  return { state, applied };
}

function clearTransientStatusError(state) {
  return state.last_error?.stage === 'task-info' ? null : state.last_error;
}

const PHASE_RANK = Object.freeze({
  submitted: 0,
  processing: 1,
  succeeded: 2,
  finalizing: 3,
  completed: 4,
  failed: 4
});

async function reconcileResultState(workspaceDir, result, now) {
  if (!['succeeded', 'failed'].includes(result?.task_status)) {
    throw new Error(`result.json contains invalid task_status ${String(result?.task_status)}`);
  }
  if (!['success', 'partial', 'error'].includes(result?.result_status)) {
    throw new Error(`result.json contains invalid result_status ${String(result?.result_status)}`);
  }
  return updateState(workspaceDir, (current) => {
    if (current.task_code && result.task_code && current.task_code !== result.task_code) {
      throw new Error('result.json task_code does not match state.json');
    }
    return {
      ...current,
      phase: result.task_status === 'succeeded' ? 'completed' : 'failed',
      task_status: result.task_status,
      result_status: result.result_status,
      completed_at: result.task_status === 'succeeded'
        ? current.completed_at ?? now.toISOString()
        : current.completed_at,
      last_error: result.task_status === 'succeeded' ? null : current.last_error,
      remote_error: result.task_status === 'succeeded' ? null : current.remote_error,
      ...diagnosticIdentifiers(result, current)
    };
  });
}

function publicStatus(state) {
  return {
    schema_version: 2,
    skill: 'argus',
    region: state.region,
    workspace_dir: state.workspace_dir,
    phase: state.phase,
    task_code: state.task_code ?? null,
    task_status: state.task_status ?? null,
    result_status: state.result_status ?? null,
    trace_id: state.trace_id ?? null,
    request_id: state.request_id ?? null,
    input: state.input ?? null,
    warning: state.phase === 'submission_unknown'
      ? 'Submission response was lost. Do not retry start for this workspace.'
      : null,
    error: state.remote_error ?? state.last_error ?? null,
    updated_at: state.updated_at
  };
}

function buildLocalResult({ state, paths, validated, download }) {
  const resultStatus = validated.result_status ?? validated.resultStatus ?? validated.status;
  if (!['success', 'partial', 'error'].includes(resultStatus)) {
    throw new Error(`output validator returned invalid result status ${String(resultStatus)}`);
  }
  const missingIds = validated.missing_ids ?? validated.missingIds ?? [];
  const warnings = [...(validated.warnings ?? [])];
  if (resultStatus === 'partial') {
    warnings.unshift(`WARNING: Argus returned a partial result; missing IDs: ${missingIds.join(', ')}`);
  }
  const images = validated.images ?? [];
  return {
    region: state.region,
    workspace_dir: state.workspace_dir,
    task_code: state.task_code,
    task_status: 'succeeded',
    result_status: resultStatus,
    trace_id: state.trace_id ?? null,
    request_id: state.request_id ?? null,
    output_zip_path: paths.outputZipPath,
    output_dir: paths.outputDir,
    manifest_path: validated.manifest_path ?? validated.manifestPath ?? `${paths.outputDir}/output.json`,
    point_cloud_path:
      validated.point_cloud_path ??
      validated.pointCloudPath ??
      validated.pointCloud?.absolutePath ??
      null,
    depth_maps: localPaths(
      validated.depth_maps ??
      validated.depthMaps ??
      images.map((image) => image.depth)
    ),
    poses: localPaths(
      validated.poses ??
      images.map((image) => image.pose)
    ),
    intrinsics: localPaths(
      validated.intrinsics ??
      images.map((image) => image.intrinsics)
    ),
    missing_ids: missingIds,
    warnings,
    error: validated.error
      ? {
          code: String(validated.error.code ?? 'ALGORITHM_ERROR'),
          message: safeMessage(validated.error.message ?? 'Argus algorithm returned an error')
        }
      : null,
    download: {
      bytes: download?.bytes ?? state.download?.bytes ?? null,
      md5: download?.md5 ?? state.download?.md5 ?? null
    }
  };
}

function localPaths(entries) {
  return (entries ?? [])
    .map((entry) => typeof entry === 'string' ? entry : entry?.absolutePath ?? entry?.path)
    .filter(Boolean);
}

function assertResultLease(snapshot, now) {
  if (!snapshot.outputUrl) {
    throw new ArgusLifecycleError('Succeeded task did not include an output URL', {
      code: 'GATEWAY_PROTOCOL_ERROR',
      stage: 'collect'
    });
  }
  if (snapshot.expirationTimestamp && snapshot.expirationTimestamp * 1000 <= now.getTime()) {
    throw new ArgusLifecycleError('Argus output URL has expired; query status again for a fresh URL', {
      code: 'RESULT_EXPIRED',
      stage: 'collect',
      retryable: true
    });
  }
}

async function canReuseDownload(path, saved, remote) {
  if (!saved?.bytes || !saved?.md5) return false;
  try {
    const file = await stat(path);
    if (!file.isFile() || file.size !== saved.bytes) return false;
    if (remote.size && file.size !== remote.size) return false;
    const md5 = await hashFile(path, 'md5');
    if (md5 !== saved.md5) return false;
    return !remote.md5 || md5 === remote.md5.toLowerCase();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function hashFile(path, algorithm) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function requireState(workspaceDir) {
  const state = await readState(workspaceDir);
  if (!state) throw new Error(`No Argus state.json found in ${workspaceDir}`);
  return state;
}

function assertStartRequest({ images, zip, workspaceRoot, region }) {
  const hasImages = Array.isArray(images) && images.length > 0;
  const hasZip = typeof zip === 'string' && zip.length > 0;
  if (hasImages === hasZip) throw new Error('Exactly one of images or zip is required');
  if (!workspaceRoot) throw new Error('workspaceRoot is required');
  if (!['global', 'cn'].includes(region)) throw new Error('region must be global or cn');
}

function toImageSummary(image) {
  return {
    name: image.filename ?? image.name ?? basename(image.path),
    format: image.format,
    width: image.width,
    height: image.height,
    bytes: image.bytes ?? image.size ?? null
  };
}

function defaultTitle({ images, zip }) {
  const source = zip ?? images[0];
  const name = basename(source, extname(source));
  return images?.length > 1 ? `${name} +${images.length - 1}` : name;
}

function normalizeTitle(value) {
  const title = String(value).normalize('NFC').trim();
  if (!title || /[\u0000-\u001f\u007f]/u.test(title)) throw new Error('title is invalid');
  return title.slice(0, 128);
}

function optionalString(value) {
  return typeof value === 'string' && value ? value : null;
}

function optionalInteger(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${name} must be a non-negative integer`);
  return number;
}

function safeError(error, fallback, diagnosticsFallback) {
  return {
    code: error?.code ?? 'ARGUS_ERROR',
    stage: error?.stage ?? null,
    retryable: Boolean(error?.retryable),
    message: safeMessage(error?.message || fallback || 'Argus operation failed'),
    ...diagnosticIdentifiers(error, diagnosticsFallback)
  };
}

async function inspectRemote(taskPort, workspaceDir, taskCode, observedStateRevision) {
  let info;
  try {
    info = await taskPort.inspect(taskCode);
    return normalizeRemoteSnapshot(info);
  } catch (error) {
    const diagnostics = diagnosticIdentifiers(error, diagnosticIdentifiers(info));
    const safe = {
      ...safeError(error, undefined, diagnostics),
      stage: error?.stage ?? 'task-info'
    };
    await updateState(workspaceDir, (current) => {
      if (getStateRevision(current) !== observedStateRevision) return current;
      return {
        ...current,
        ...diagnosticStateFields(diagnostics),
        last_error: safe
      };
    }).catch(() => {});
    throw new ArgusLifecycleError(safe.message, {
      cause: error,
      code: error?.code ?? 'STATUS_FAILED',
      stage: error?.stage ?? 'task-info',
      retryable: Boolean(error?.retryable),
      workspaceDir,
      ...lifecycleDiagnosticOptions(diagnostics)
    });
  }
}

function diagnosticIdentifiers(value, fallback = {}) {
  const metadata = getGatewayResponseMetadata(value);
  const traceId = safeDiagnosticId(
    value?.traceId ?? value?.trace_id ?? metadata?.trace_id ?? fallback?.trace_id
  );
  const requestId = safeDiagnosticId(
    value?.requestId ?? value?.request_id ?? metadata?.request_id ?? fallback?.request_id
  );
  return {
    ...(traceId ? { trace_id: traceId } : {}),
    ...(requestId ? { request_id: requestId } : {})
  };
}

function lifecycleDiagnosticOptions(value) {
  const diagnostics = diagnosticIdentifiers(value);
  return {
    traceId: diagnostics.trace_id ?? null,
    requestId: diagnostics.request_id ?? null
  };
}

function diagnosticStateFields(value) {
  const diagnostics = diagnosticIdentifiers(value);
  return {
    trace_id: diagnostics.trace_id ?? null,
    request_id: diagnostics.request_id ?? null
  };
}

function safeDiagnosticId(value) {
  if (typeof value !== 'string') return null;
  const safe = safeMessage(value).trim();
  if (!safe || /[\u0000-\u001f\u007f]/u.test(safe)) return null;
  return safe.slice(0, 256);
}

function safeMessage(value) {
  return redactText(String(value)).replace(/https?:\/\/[^\s]+/gu, (url) => redactUrlForLog(url));
}
