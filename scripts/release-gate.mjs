import { spawnSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const CI_COMMANDS = [
  ['npm', ['run', 'scan:secrets']],
  ['npm', ['run', 'validate:docs']],
  ['npm', ['run', 'validate:ai']],
  ['npm', ['run', 'validate:repo-boundary']],
  ['npm', ['run', 'validate:skills']],
  ['npm', ['run', 'rebuild']],
  ['node', ['scripts/check-generated-clean.mjs']],
  ['npm', ['run', 'smoke']],
  ['node', ['scripts/check-worktree-clean.mjs']],
  ['npm', ['run', 'validate:channel-metadata']],
  ['npm', ['run', 'test:skill']],
  ['npm', ['--prefix', '.agents/skills/argus', 'run', 'audit:prod']]
];

if (isCliEntry()) {
  main(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = error?.exitCode ?? 1;
  });
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const args = parseReleaseGateArgs(argv);
  const commandRoot = options.root ?? root;
  const commandEnv = options.env ?? process.env;

  for (const [command, commandArgs] of getReleaseGateCommands(args.channel)) {
    run(command, commandArgs, { root: commandRoot, env: commandEnv });
  }

  if (args.channel === 'preview') {
    console.log(`release gate ok for preview ${args.tag}`);
    return 0;
  }

  const failures = [];
  if (!(await hasPublicGatewayOpenApiContract(commandRoot))) {
    failures.push('missing or unsafe public Gateway OpenAPI contract for Realsee Argus Gateway');
  }
  const releaseMetadata = JSON.parse(await readFile(join(commandRoot, 'release-channel.json'), 'utf8'));
  if (!validateStableReleaseMetadata(releaseMetadata, args.tag)) {
    failures.push(
      'stable promotion is not approved: record verified CN/global E2E and set channel/state/stable_gate to stable/stable/passed'
    );
  }

  if (failures.length) {
    console.error(`stable release gate failed for ${args.tag}:`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    return 1;
  }

  console.log(`release gate ok for stable ${args.tag}`);
  return 0;
}

export function getReleaseGateCommands(channel) {
  if (!['preview', 'stable'].includes(channel)) {
    throw new Error('--channel must be preview or stable');
  }
  return CI_COMMANDS.map(([command, commandArgs]) => [command, [...commandArgs]]);
}

export function parseReleaseGateArgs(argv) {
  const args = parseArgs(argv);
  if (!args.tag) {
    throw new Error('--tag <tag> is required');
  }
  getReleaseGateCommands(args.channel);
  return args;
}

function run(command, commandArgs, options) {
  const child = spawnSync(command, commandArgs, {
    cwd: options.root,
    stdio: 'inherit',
    env: options.env
  });
  if (child.error) {
    throw child.error;
  }
  if (child.status !== 0) {
    const error = new Error(`${command} ${commandArgs.join(' ')} failed`);
    error.exitCode = child.status ?? 1;
    throw error;
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--channel' || arg === '--tag') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      parsed[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

function isCliEntry() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function hasPublicGatewayOpenApiContract(rootDir) {
  const openapiPath = join(rootDir, '.agents', 'skills', 'argus', 'references', 'argus-gateway-openapi.json');
  if (!(await exists(openapiPath))) return false;
  const openapi = JSON.parse(await readFile(openapiPath, 'utf8'));
  return validatePublicGatewayOpenApi(openapi);
}

export function validatePublicGatewayOpenApi(openapi) {
  if (openapi?.openapi !== '3.1.0') return false;

  const serialized = JSON.stringify(openapi);
  const forbiddenText = [
    ['Owner', 'confirmation'].join(' '),
    ['local', 'H5', 'source'].join(' '),
    ['Hard-coded', 'H5', 'credentials'].join(' '),
    ['credential', 'pairs'].join(' '),
    ['live', 'smoked'].join('-'),
    ['live', 'smoke'].join(' '),
    ['i', 'app-gateway', 'realsee', 'com'].join('.'),
    [['ex', 'tracted from'].join(''), 'h5.realsee.ai'].join(' '),
    [['ex', 'tracted from'].join(''), 'h5.realsee.com'].join(' '),
    [['ex', 'tracted from'].join(''), 'h5.realsee.cn'].join(' ')
  ];
  if (forbiddenText.some((needle) => serialized.includes(needle))) return false;

  const requiredOperations = [
    ['/auth/access_token', 'post'],
    ['/open/v1/argus/file/token', 'get'],
    ['/open/v1/argus/task/submit', 'post'],
    ['/open/v1/argus/task/info', 'get']
  ];
  const requiredSchemas = [
    'AccessTokenRequest',
    'AccessTokenData',
    'UploadTokenData',
    'SubmitTaskRequest',
    'SubmitTaskData',
    'TaskInfoData'
  ];

  const serverUrls = new Set((openapi.servers ?? []).map((server) => server?.url));
  return requiredOperations.every(([path, method]) => openapi.paths?.[path]?.[method])
    && requiredSchemas.every((schema) => openapi.components?.schemas?.[schema])
    && serverUrls.has('https://app-gateway.realsee.ai')
    && serverUrls.has('https://app-gateway.realsee.cn');
}

export function validateStableReleaseMetadata(metadata, tag) {
  const normalizedTag = String(tag ?? '').replace(/^v/, '');
  const argus = metadata?.skills?.argus;
  return metadata?.version === normalizedTag
    && metadata?.channel === 'stable'
    && argus?.state === 'stable'
    && argus?.stable_gate === 'passed'
    && Array.isArray(argus?.regions)
    && argus.regions.includes('global')
    && argus.regions.includes('cn');
}
