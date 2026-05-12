import { spawn } from 'node:child_process';
import { openAsBlob, openSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { parseConfig } from './config.mjs';
import { assertUploadConsent } from './consent.mjs';
import { downloadArgusGlb } from './downloader.mjs';
import { GatewayClient, GatewayError } from './gateway.mjs';
import {
  assertInputTypeMatchesDimensions,
  assertJpeg,
  detectInputTypeFromDimensions,
  mapInputType,
  readJpegDimensions
} from './input.mjs';
import { writeJsonAtomic } from './output.mjs';
import { buildPreviewUrl } from './preview-url.mjs';
import { getWorkspacePaths, readState, writeResult, writeState } from './state.mjs';
import { createRunWorkspace } from './workspace.mjs';

const DEFAULT_WORKSPACE = 'argus-runs';

const PROXY_ENV_KEYS = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
  'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy'
];

export async function main(argv = [], io = {}) {
  const startedAt = Date.now();
  const options = parseArgs(argv);
  const env = io.env ?? process.env;
  const stdout = io.stdout ?? process.stdout;
  const now = io.now ?? (() => new Date());

  if (options.resume) {
    return runLiveResume({ options, env, stdout, io });
  }

  if (!options.image) {
    throw new Error('--image is required');
  }

  return runLive({ options, env, stdout, now, startedAt, io });
}

async function runLive({ options, env, stdout, now, startedAt, io }) {
  // Realsee gateway requires direct egress; corporate proxies have produced
  // intermittent multipart upload failures historically (see realsee-panorama-to-vr-skill).
  for (const key of PROXY_ENV_KEYS) {
    delete process.env[key];
  }

  const config = parseConfig({
    env,
    args: {
      pollIntervalMs: options.pollIntervalMs,
      pollMaxAttempts: options.pollMaxAttempts
    },
    live: true
  });

  await assertJpeg(options.image);

  // Argus enforces strict aspect ratios: 2:1 for panoramas, 1:1 for pinhole
  // images. Read the dimensions and either auto-detect the type or validate
  // the explicit --type against the file. This fails fast on unsupported
  // ratios before any remote upload.
  const detectedDimensions = await readJpegDimensions(options.image);
  let resolvedType;
  if (options.type) {
    assertInputTypeMatchesDimensions(options.type, detectedDimensions);
    resolvedType = options.type;
  } else {
    resolvedType = detectInputTypeFromDimensions(detectedDimensions);
  }
  const typeInfo = mapInputType(resolvedType);

  const uploadConsent = assertUploadConsent({
    yes: options.yes,
    files: [options.image],
    region: config.region
  });
  const workspaceDir = await createRunWorkspace(options.workspace ?? DEFAULT_WORKSPACE, now());

  const gateway = io.createGateway
    ? io.createGateway(config)
    : new GatewayClient({
        baseUrl: config.gatewayBaseUrl,
        appKey: config.appKey,
        appSecret: config.appSecret
      });
  const log = makeLogger(env, io);

  log(
    'INPUT',
    `width=${detectedDimensions.width} height=${detectedDimensions.height} ratio=${(detectedDimensions.width / detectedDimensions.height).toFixed(3)} type=${resolvedType} source=${options.type ? 'explicit' : 'auto'}`
  );
  log('AUTH', `region=${config.region} baseUrl=${config.gatewayBaseUrl}`);
  const tokenResult = await gateway.getUploadToken({ inputImageId: '' });
  log('UPLOAD_TOKEN', `input_image_id=${tokenResult?.input_image_id} bucket=${tokenResult?.upload_token?.bucket}`);
  const inputImageId = tokenResult?.input_image_id;
  const uploadToken = tokenResult?.upload_token;
  if (!inputImageId || !uploadToken) {
    throw new GatewayError('upload token response missing input_image_id or upload_token', {
      stage: 'upload-token'
    });
  }

  const upload = io.upload ?? defaultUpload;
  const uploadResult = await upload({
    imagePath: options.image,
    uploadToken,
    region: config.region,
    uploadKey: typeInfo.vggtType === 'pano' ? 'panoImage.jpg' : 'pinholeImage.jpg'
  });
  log('UPLOAD', `provider=${uploadResult?.providerName} key=${uploadResult?.key} etag=${uploadResult?.etag ?? 'n/a'}`);

  await gateway.triggerVGGT({
    type: typeInfo.vggtType,
    inputImageId
  });
  log('TRIGGER', `type=${typeInfo.vggtType} input_image_id=${inputImageId}`);

  const stateAfterTrigger = {
    status: 'in_progress',
    skill: 'argus',
    region: config.region,
    workspace_dir: workspaceDir,
    input_image_id: inputImageId,
    vggt_type: typeInfo.vggtType,
    preview_type: typeInfo.previewType,
    input_type: typeInfo.inputType,
    input_type_source: options.type ? 'explicit' : 'auto',
    input_dimensions: detectedDimensions,
    started_at: new Date(startedAt).toISOString(),
    upload_consent: uploadConsent,
    upload: {
      provider: uploadResult?.providerName ?? null,
      key: uploadResult?.key ?? null,
      etag: uploadResult?.etag ?? null
    },
    poll_interval_ms: config.poll.intervalMs,
    poll_max_attempts: config.poll.maxAttempts
  };
  await writeState(workspaceDir, stateAfterTrigger);

  if (options.async) {
    const pid = (io.spawnDetached ?? spawnDetachedPoll)(workspaceDir, env);
    const inProgress = {
      ...stateAfterTrigger,
      background_poll_pid: pid
    };
    await writeState(workspaceDir, { background_poll_pid: pid });
    if (options.json) {
      stdout.write(`${JSON.stringify(inProgress)}\n`);
    }
    return inProgress;
  }

  return finishLive({
    workspaceDir,
    state: stateAfterTrigger,
    config,
    gateway,
    io,
    log,
    stdout,
    options
  });
}

async function runLiveResume({ options, env, stdout, io }) {
  for (const key of PROXY_ENV_KEYS) {
    delete process.env[key];
  }

  if (!options.workspace) {
    throw new Error('--workspace is required with --resume');
  }
  const workspaceDir = resolve(options.workspace);
  const state = await readState(workspaceDir);
  if (!state || !state.input_image_id || !state.vggt_type) {
    throw new Error(`No resumable state found at ${getWorkspacePaths(workspaceDir).statePath}`);
  }

  const config = parseConfig({
    env,
    args: {
      pollIntervalMs: options.pollIntervalMs ?? state.poll_interval_ms,
      pollMaxAttempts: options.pollMaxAttempts ?? state.poll_max_attempts
    },
    live: true
  });
  if (config.region !== state.region) {
    throw new Error(`region mismatch: state has ${state.region} but env REALSEE_REGION=${config.region}`);
  }

  const gateway = io.createGateway
    ? io.createGateway(config)
    : new GatewayClient({
        baseUrl: config.gatewayBaseUrl,
        appKey: config.appKey,
        appSecret: config.appSecret
      });
  const log = makeLogger(env, io);

  return finishLive({
    workspaceDir,
    state,
    config,
    gateway,
    io,
    log,
    stdout,
    options
  });
}

async function finishLive({ workspaceDir, state, config, gateway, io, log, stdout, options }) {
  const startedAtMs = state.started_at ? Date.parse(state.started_at) : Date.now();

  try {
    const pollResult = await pollUntilDone({
      gateway,
      type: state.vggt_type,
      inputImageId: state.input_image_id,
      intervalMs: config.poll.intervalMs,
      maxAttempts: config.poll.maxAttempts,
      sleep: io.sleep ?? sleep,
      log
    });

    const algTaskId = pollResult.alg_task_id;
    const resultUrl = pollResult.result_url;
    if (!algTaskId || !resultUrl) {
      throw new GatewayError('poll success payload missing alg_task_id or result_url', {
        stage: 'poll'
      });
    }

    const outputGlbPath = resolve(workspaceDir, `${algTaskId}.glb`);
    const download = io.download ?? downloadArgusGlb;
    const downloadInfo = await download({
      url: resultUrl,
      outputPath: outputGlbPath
    });

    const previewUrl = buildPreviewUrl({
      region: state.region,
      previewType: state.preview_type,
      algTaskId
    });

    const result = {
      status: 'success',
      skill: 'argus',
      region: state.region,
      output_glb_path: outputGlbPath,
      preview_url: previewUrl,
      valid_for_days: 7,
      workspace_dir: workspaceDir,
      task_id: algTaskId,
      input_image_id: state.input_image_id,
      upload_consent: state.upload_consent,
      upload: state.upload,
      download: {
        bytes: downloadInfo?.bytes ?? null,
        host: downloadInfo?.host ?? null,
        redirected: Boolean(downloadInfo?.redirected)
      },
      elapsed_ms: Math.max(0, Date.now() - startedAtMs)
    };

    await writeResult(workspaceDir, result);
    await writeState(workspaceDir, { status: 'success', task_id: algTaskId });
    if (options.json) {
      stdout.write(`${JSON.stringify(result)}\n`);
    }
    return result;
  } catch (error) {
    const failure = {
      status: 'error',
      skill: 'argus',
      region: state.region,
      workspace_dir: workspaceDir,
      input_image_id: state.input_image_id,
      upload_consent: state.upload_consent,
      upload: state.upload,
      error: error?.message ?? String(error),
      elapsed_ms: Math.max(0, Date.now() - startedAtMs)
    };
    await writeResult(workspaceDir, failure);
    await writeState(workspaceDir, { status: 'error', error: failure.error });
    if (options.json) {
      stdout.write(`${JSON.stringify(failure)}\n`);
    }
    throw error;
  }
}

function spawnDetachedPoll(workspaceDir, env) {
  const { stdoutLogPath, stderrLogPath, pidPath } = getWorkspacePaths(workspaceDir);
  const runtimeEntry = resolve(import.meta.dirname, '..', 'scripts', 'run-argus.mjs');
  const child = spawn(process.execPath, [runtimeEntry, '--resume', '--workspace', workspaceDir, '--json'], {
    detached: true,
    stdio: ['ignore', openSync(stdoutLogPath, 'a'), openSync(stderrLogPath, 'a')],
    env
  });
  child.unref();
  // Persist the pid so callers can verify the poll process later.
  writeJsonAtomic(pidPath, { pid: child.pid }).catch(() => {});
  return child.pid;
}

async function defaultUpload({ imagePath, uploadToken, region, uploadKey }) {
  // The package's ESM build ships extension-less imports that Node's strict
  // ESM resolver rejects. Load the CJS build via createRequire.
  const require = createRequire(import.meta.url);
  const { Uploader } = require('@realsee/universal-uploader');
  const adaptor = resolveAdaptor(require, region);
  const blob = await openAsBlob(imagePath, { type: 'image/jpeg' });
  const uploader = new Uploader(adaptor, {
    getToken: () => uploadToken
  });
  // Argus VGGT pipeline looks up the uploaded image by a fixed key per type:
  // pinholeImage.jpg / panoImage.jpg. See h5.realsee.ai client/src/pages/Argus/index.tsx.
  return uploader.upload(uploadKey, blob, {});
}

function resolveAdaptor(require, region) {
  if (region === 'cn') {
    const module = require('@realsee/universal-uploader/adaptors/cos-node');
    return module.CosNodeAdaptor ?? module.default ?? module;
  }
  const module = require('@realsee/universal-uploader/adaptors/aws');
  return module.AwsAdaptor ?? module.default ?? module;
}

async function pollUntilDone({ gateway, type, inputImageId, intervalMs, maxAttempts, sleep, log }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const data = await gateway.pollVGGT({ type, inputImageId });
    const status = data?.status;
    log?.('POLL', `attempt=${attempt}/${maxAttempts} status=${status}${data?.failed_reason ? ` failed_reason=${data.failed_reason}` : ''}`);
    if (status === 'success') {
      return data;
    }
    if (status === 'failed') {
      throw new GatewayError(data?.failed_reason || 'Argus VGGT generation failed', {
        stage: 'poll',
        remoteCode: status
      });
    }
    if (status !== 'pending') {
      throw new GatewayError(`Unexpected Argus VGGT poll status: ${status}`, {
        stage: 'poll'
      });
    }
    if (attempt === maxAttempts) break;
    await sleep(intervalMs);
  }
  throw new GatewayError('Argus VGGT generation did not complete within the poll budget', {
    stage: 'poll'
  });
}

function makeLogger(env, io) {
  if (io.log) return io.log;
  const stream = io.stderr ?? process.stderr;
  const enabled = env.ARGUS_VERBOSE === '1' || env.DEBUG === '1';
  if (!enabled) return () => {};
  return (step, message) => {
    stream.write(`[${new Date().toISOString()}] ${step} ${message}\n`);
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const options = {
    json: false,
    yes: false,
    async: false,
    resume: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--yes') {
      options.yes = true;
    } else if (arg === '--async') {
      options.async = true;
    } else if (arg === '--resume') {
      options.resume = true;
    } else if (arg === '--image') {
      options.image = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--type') {
      options.type = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--workspace') {
      options.workspace = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--poll-interval-ms') {
      options.pollIntervalMs = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--poll-max-attempts') {
      options.pollMaxAttempts = readValue(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }

  return options;
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
