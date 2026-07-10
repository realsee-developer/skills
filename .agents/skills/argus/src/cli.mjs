import { resolve } from 'node:path';
import { parseConfig } from './config.mjs';
import { GatewayClient } from './gateway.mjs';
import { ArgusTaskLifecycle } from './lifecycle.mjs';
import { GatewayArgusTaskPort, UniversalObjectTransferPort } from './ports.mjs';
import { readResult, readState } from './state.mjs';

export async function main(argv = [], io = {}) {
  const options = parseArgs(argv);
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;

  let state = null;
  let localResult = null;
  if (options.command !== 'start') {
    state = await readState(options.workspace);
    if (!state) throw new Error(`No Argus state.json found in ${options.workspace}`);
    localResult = await readResult(options.workspace);
  }

  const canRunOffline = Boolean(localResult) || state?.phase === 'submission_unknown';
  const configEnv = state?.region && !env.REALSEE_REGION
    ? { ...env, REALSEE_REGION: state.region }
    : env;
  const config = io.config ?? parseConfig({ env: configEnv, live: !canRunOffline });
  if (state?.region && config.region && state.region !== config.region) {
    throw new Error(`region mismatch: state has ${state.region} but REALSEE_REGION=${config.region}`);
  }
  const lifecycle = io.lifecycle ?? io.createLifecycle?.(config) ?? createDefaultLifecycle(config, io);

  let result;
  if (options.command === 'start') {
    result = await lifecycle.start({
      images: options.images,
      zip: options.zip,
      workspaceRoot: options.workspace,
      yes: options.yes,
      title: options.title,
      region: config.region,
      signal: io.signal
    });
  } else if (options.command === 'status') {
    result = await lifecycle.status({ workspaceDir: options.workspace });
  } else {
    result = await lifecycle.collect({ workspaceDir: options.workspace, signal: io.signal });
  }

  if (result.result_status === 'partial') {
    stderr.write(
      `WARNING: Argus returned a partial result. Missing IDs: ${(result.missing_ids ?? []).join(', ')}\n`
    );
  }
  writeOutput(result, { json: options.json, stdout });
  return result;
}

export function parseArgs(argv) {
  const command = argv[0];
  if (!['start', 'status', 'collect'].includes(command)) {
    throw new Error('First argument must be one of: start, status, collect');
  }
  const options = { command, images: [], json: false, yes: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--yes') {
      options.yes = true;
    } else if (arg === '--image') {
      options.images.push(readValue(argv, index, arg));
      index += 1;
    } else if (arg === '--zip') {
      options.zip = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--workspace') {
      options.workspace = resolve(readValue(argv, index, arg));
      index += 1;
    } else if (arg === '--title') {
      options.title = readValue(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }

  if (!options.workspace) throw new Error('--workspace is required');
  if (command === 'start') {
    const hasImages = options.images.length > 0;
    const hasZip = Boolean(options.zip);
    if (hasImages === hasZip) throw new Error('start requires exactly one of --image or --zip');
  } else {
    if (options.images.length || options.zip || options.yes || options.title) {
      throw new Error(`${command} only accepts --workspace and --json`);
    }
  }
  return options;
}

function createDefaultLifecycle(config, io) {
  const gateway = io.gateway ?? new GatewayClient({
    baseUrl: config.gatewayBaseUrl,
    appKey: config.appKey,
    appSecret: config.appSecret,
    fetchImpl: io.fetchImpl
  });
  return new ArgusTaskLifecycle({
    taskPort: io.taskPort ?? new GatewayArgusTaskPort(gateway),
    transferPort: io.transferPort ?? new UniversalObjectTransferPort({ region: config.region }),
    now: io.now ?? (() => new Date())
  });
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function writeOutput(result, { json, stdout }) {
  if (json) {
    stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const status = result.result_status ?? result.task_status ?? result.phase;
  stdout.write(`Argus ${status}\nWorkspace: ${result.workspace_dir}\n`);
}
