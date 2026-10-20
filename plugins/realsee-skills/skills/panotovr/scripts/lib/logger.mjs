const MASK_KEYS = new Set([
  'access_token',
  'app_key',
  'app_secret',
  'REALSEE_APP_SECRET',
  'tmpSecretId',
  'tmpSecretKey',
  'sessionToken',
  'Authorization',
])

function now() {
  return new Date().toISOString()
}

export function log(step, message) {
  process.stderr.write(`[${now()}] [${step}] ${message}\n`)
}

export function logDetail(step, label, payload) {
  process.stderr.write(`[${now()}] [${step}] ${label}\n`)
  process.stderr.write(`${JSON.stringify(maskSensitive(payload), null, 2)}\n`)
}

export function maskSensitive(value) {
  return JSON.parse(JSON.stringify(value, (key, current) => {
    if (MASK_KEYS.has(key) && typeof current === 'string') {
      return `${current.slice(0, 6)}***`
    }
    return current
  }))
}
