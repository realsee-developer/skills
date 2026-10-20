export const BASE_URLS = {
  global: 'https://app-gateway.realsee.ai',
  cn: 'https://app-gateway.realsee.cn',
}

export const DEFAULT_WORKSPACE_ROOT = 'workspace'
export const DEFAULT_POLL_INTERVAL_MS = Number(process.env.REALSEE_POLL_INTERVAL_MS ?? 30_000)
export const DEFAULT_POLL_MAX_ATTEMPTS = Number(process.env.REALSEE_POLL_MAX_ATTEMPTS ?? 60)
export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
export const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'http_proxy',
  'https_proxy',
  'ALL_PROXY',
  'all_proxy',
  'NO_PROXY',
  'no_proxy',
]

export function formatDateStamp(date = new Date()) {
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}
