const LEGACY_ENV_VARS = [
  'ARGUS_GATEWAY_APP_KEY',
  'ARGUS_GATEWAY_APP_SECRET',
  'ARGUS_REGION',
  'ARGUS_PREVIEW_BASE_URL',
  'ARGUS_POLL_INTERVAL_MS',
  'ARGUS_POLL_MAX_ATTEMPTS'
];

// arkclaw distribution: cn-only. The global gateway is intentionally not
// exposed here, and REALSEE_REGION defaults to 'cn' if absent.
const REGION_GATEWAY_BASE_URLS = {
  cn: 'https://app-gateway.realsee.cn'
};
const DEFAULT_REGION = 'cn';

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_MAX_ATTEMPTS = 120;

// All configuration is read from REALSEE_* environment variables. The
// run-argus.mjs entrypoint hydrates these from the on-disk credentials file
// (~/.realsee/credentials) before main() runs, so callers do not need to
// re-supply them every session once saved.
function readEnv(env, key) {
  const value = env[`REALSEE_${key}`];
  if (value !== undefined && value !== '') return value;
  return undefined;
}

export function parseConfig({ env, args = {}, live }) {
  if (!env) {
    throw new Error('env is required');
  }

  rejectLegacyEnv(env);

  const region = parseRegion(readEnv(env, 'REGION'), { live });
  const poll = {
    intervalMs: parsePositiveInteger(
      selectPollValue(args, 'pollIntervalMs', env, 'POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS),
      selectPollName(args, 'pollIntervalMs', env, 'POLL_INTERVAL_MS')
    ),
    maxAttempts: parsePositiveInteger(
      selectPollValue(args, 'pollMaxAttempts', env, 'POLL_MAX_ATTEMPTS', DEFAULT_POLL_MAX_ATTEMPTS),
      selectPollName(args, 'pollMaxAttempts', env, 'POLL_MAX_ATTEMPTS')
    )
  };

  return {
    appKey: readEnv(env, 'APP_KEY'),
    appSecret: readEnv(env, 'APP_SECRET'),
    region,
    gatewayBaseUrl: region ? REGION_GATEWAY_BASE_URLS[region] : undefined,
    poll
  };
}

function selectPollValue(args, argName, env, envSuffix, defaultValue) {
  if (Object.hasOwn(args, argName) && args[argName] !== undefined) {
    return args[argName];
  }
  const fromEnv = readEnv(env, envSuffix);
  if (fromEnv !== undefined) return fromEnv;
  return defaultValue;
}

function selectPollName(args, argName, env, envSuffix) {
  if (Object.hasOwn(args, argName) && args[argName] !== undefined) {
    return argName;
  }
  if (readEnv(env, envSuffix) !== undefined) {
    return `REALSEE_${envSuffix}`;
  }
  return 'default';
}

function rejectLegacyEnv(env) {
  const legacyName = LEGACY_ENV_VARS.find((name) => env[name] !== undefined);
  if (legacyName) {
    throw new Error(`${legacyName} is no longer supported; use REALSEE_* environment variables`);
  }
}

function parseRegion(value, { live }) {
  if (value === undefined || value === '') {
    return live ? DEFAULT_REGION : undefined;
  }

  if (!Object.hasOwn(REGION_GATEWAY_BASE_URLS, value)) {
    throw new Error(`REALSEE_REGION must be 'cn' in the arkclaw build (got '${value}')`);
  }

  return value;
}

function parsePositiveInteger(value, name) {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
    throw new Error(`${name} must be a positive integer`);
  }

  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  throw new Error(`${name} must be a positive integer`);
}
