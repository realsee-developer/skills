import { resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import {
  BASE_URLS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_MAX_ATTEMPTS,
  DEFAULT_WORKSPACE_ROOT,
  PROXY_ENV_KEYS,
} from './constants.mjs'

loadDotenv({ quiet: true })

export function disableProxyEnvironment() {
  for (const key of PROXY_ENV_KEYS) {
    delete process.env[key]
  }
}

function pickEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]
    if (value) {
      return value
    }
  }
  return undefined
}

function parsePositiveInteger(value, name) {
  if (typeof value === 'boolean') {
    throw new Error(`Invalid ${name}: missing numeric value`)
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: "${value}" must be a positive integer`)
  }
  return parsed
}

function getMissingCredentialsMessage(regionHint) {
  const normalizedRegion = String(regionHint ?? '').trim().toLowerCase()
  let registrationHint = 'Register a Realsee account at my.realsee.cn for cn or at my.realsee.ai for global. If you do not know the account region yet, confirm it with the account owner or Realsee support before proceeding.'

  if (normalizedRegion === 'cn') {
    registrationHint = 'Register a Realsee cn account at my.realsee.cn.'
  } else if (normalizedRegion === 'global') {
    registrationHint = 'Register a Realsee global account at my.realsee.ai.'
  }

  return [
    'Missing REALSEE_APP_KEY or REALSEE_APP_SECRET.',
    registrationHint,
    'Then email developer@realsee.com to request access to the panorama-to-VR API capability.',
    'Include your account region, UserID, and IdentityID in that request.',
  ].join(' ')
}

export function getRuntimeConfig(args) {
  disableProxyEnvironment()

  const appKey = pickEnv('REALSEE_APP_KEY', 'CLAUDE_PLUGIN_OPTION_REALSEE_APP_KEY')
  const appSecret = pickEnv('REALSEE_APP_SECRET', 'CLAUDE_PLUGIN_OPTION_REALSEE_APP_SECRET')
  const regionInput = pickEnv('REALSEE_REGION', 'CLAUDE_PLUGIN_OPTION_REALSEE_REGION')
  const region = String(regionInput ?? 'global').trim().toLowerCase()

  if (!appKey || !appSecret) {
    throw new Error(getMissingCredentialsMessage(regionInput))
  }

  if (!BASE_URLS[region]) {
    throw new Error(`Invalid REALSEE_REGION "${region}". Use global or cn.`)
  }

  return {
    appKey,
    appSecret,
    region,
    baseUrl: BASE_URLS[region],
    workspaceRoot: resolve(args.workspace ?? DEFAULT_WORKSPACE_ROOT),
    pollIntervalMs: parsePositiveInteger(
      args['poll-interval-ms'] ?? DEFAULT_POLL_INTERVAL_MS,
      'poll-interval-ms',
    ),
    pollMaxAttempts: parsePositiveInteger(
      args['poll-max-attempts'] ?? DEFAULT_POLL_MAX_ATTEMPTS,
      'poll-max-attempts',
    ),
  }
}
