const ACCESS_TOKEN_PATH = '/auth/access_token';
const UPLOAD_TOKEN_PATH = '/open/saas/v1/vggt/upload/token';
const TRIGGER_VGGT_PATH = '/open/saas/v1/vggt/trigger';
const POLL_VGGT_PATH = '/open/saas/v1/vggt/poll';
const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000;
const DEFAULT_USER_AGENT = 'realsee-skill/argus';

export class GatewayError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'GatewayError';
    this.stage = options.stage ?? null;
    this.remoteCode = options.remoteCode ?? null;
    this.httpStatus = options.httpStatus ?? null;
  }
}

export class GatewayClient {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.appKey = options.appKey ?? '';
    this.appSecret = options.appSecret ?? '';
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
    this.cachedToken = null;
    this.cachedTokenExpiresAt = 0;

    if (typeof this.fetchImpl !== 'function') {
      throw new Error('fetchImpl is required');
    }
  }

  async getAccessToken() {
    if (this.cachedToken && Date.now() < this.cachedTokenExpiresAt) {
      return this.cachedToken;
    }

    if (!this.appKey || !this.appSecret) {
      throw new GatewayError('REALSEE_APP_KEY and REALSEE_APP_SECRET are required', {
        stage: 'access-token'
      });
    }

    const body = new URLSearchParams({
      app_key: this.appKey,
      app_secret: this.appSecret
    });

    const data = await this.request({
      stage: 'access-token',
      method: 'POST',
      path: ACCESS_TOKEN_PATH,
      contentType: 'application/x-www-form-urlencoded',
      body,
      authenticated: false
    });

    const token = data && typeof data.access_token === 'string' ? data.access_token : '';
    if (!token) {
      throw new GatewayError('Gateway access token response did not include access_token', {
        stage: 'access-token'
      });
    }

    this.cachedToken = token;
    this.cachedTokenExpiresAt = Date.now() + this.tokenTtlMs;
    return token;
  }

  async getUploadToken({ inputImageId }) {
    // Retry policy: the public Gateway contract does not define idempotency or token-expired envelope for upload-token.
    return this.request({
      stage: 'upload-token',
      method: 'POST',
      path: UPLOAD_TOKEN_PATH,
      body: JSON.stringify({ input_image_id: inputImageId }),
      authenticated: true
    });
  }

  async triggerVGGT({ type, inputImageId }) {
    // Retry policy: trigger may create server-side work; no automatic retry without explicit idempotency evidence.
    return this.request({
      stage: 'trigger',
      method: 'POST',
      path: TRIGGER_VGGT_PATH,
      body: JSON.stringify({ type, input_image_id: inputImageId }),
      authenticated: true
    });
  }

  async pollVGGT({ type, inputImageId }) {
    // Retry policy: poll is not retried until the Gateway contract confirms read-only semantics and token-expired envelope.
    const query = new URLSearchParams({
      type,
      input_image_id: inputImageId
    });

    return this.request({
      stage: 'poll',
      method: 'GET',
      path: `${POLL_VGGT_PATH}?${query.toString()}`,
      authenticated: true
    });
  }

  invalidateToken() {
    this.cachedToken = null;
    this.cachedTokenExpiresAt = 0;
  }

  async request({ stage, method, path, body, contentType = 'application/json', authenticated, _retriedOnExpiry = false }) {
    const headers = {
      'User-Agent': this.userAgent
    };

    if (body !== undefined) {
      headers['Content-Type'] = contentType;
    }

    if (authenticated) {
      headers.Authorization = await this.getAccessToken();
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body
    });
    const payload = await readJson(response, stage);

    if (!payload || !Object.hasOwn(payload, 'code')) {
      throw new GatewayError('Unexpected Gateway response envelope', {
        stage,
        httpStatus: response.status
      });
    }

    if (payload.code !== 0) {
      const looksLikeExpired =
        payload.code === -3 ||
        String(payload.status ?? '').toLowerCase().includes('expired') ||
        String(payload.message ?? '').toLowerCase().includes('expired');
      if (authenticated && looksLikeExpired && !_retriedOnExpiry) {
        this.invalidateToken();
        return this.request({ stage, method, path, body, contentType, authenticated, _retriedOnExpiry: true });
      }
      throw new GatewayError(payload.status || payload.message || 'Gateway request failed', {
        stage,
        remoteCode: payload.code,
        httpStatus: response.status
      });
    }

    return payload.data;
  }
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) {
    throw new Error('baseUrl is required');
  }

  return String(baseUrl).replace(/\/+$/, '');
}

async function readJson(response, stage) {
  try {
    return await response.json();
  } catch (error) {
    throw new GatewayError('Gateway response was not JSON', {
      stage,
      httpStatus: response.status
    });
  }
}
