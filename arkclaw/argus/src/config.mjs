const LEGACY_ENV_VARS = [
  'ARGUS_GATEWAY_APP_KEY',
  'ARGUS_GATEWAY_APP_SECRET',
  'ARGUS_REGION',
  'ARGUS_PREVIEW_BASE_URL',
  'ARGUS_POLL_INTERVAL_MS',
  'ARGUS_POLL_MAX_ATTEMPTS'
];

export const REGION_GATEWAY_BASE_URLS = Object.freeze({
  global: 'https://app-gateway.realsee.ai',
  cn: 'https://app-gateway.realsee.cn'
});

export function parseConfig({ env, live = true }) {
  if (!env) throw new Error('env is required');
  rejectLegacyEnv(env);

  const region = parseRegion(readEnv(env, 'REGION'), { live });
  const appKey = readEnv(env, 'APP_KEY');
  const appSecret = readEnv(env, 'APP_SECRET');
  if (live && (!appKey || !appSecret)) {
    throw new Error('REALSEE_APP_KEY and REALSEE_APP_SECRET are required for live mode');
  }

  return {
    appKey,
    appSecret,
    region,
    gatewayBaseUrl: region ? REGION_GATEWAY_BASE_URLS[region] : undefined
  };
}

function readEnv(env, key) {
  const value = env[`REALSEE_${key}`];
  return value === undefined || value === '' ? undefined : value;
}

function rejectLegacyEnv(env) {
  const legacyName = LEGACY_ENV_VARS.find((name) => env[name] !== undefined);
  if (legacyName) {
    throw new Error(`${legacyName} is no longer supported; use REALSEE_* environment variables`);
  }
}

function parseRegion(value, { live }) {
  if (value === undefined) {
    if (live) throw new Error('REALSEE_REGION is required for live mode');
    return undefined;
  }
  if (!Object.hasOwn(REGION_GATEWAY_BASE_URLS, value)) {
    throw new Error('REALSEE_REGION must be one of: global, cn');
  }
  return value;
}
