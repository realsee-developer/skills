const ACCESS_TOKEN_PATH = '/auth/access_token';
const FILE_TOKEN_PATH = '/open/v1/argus/file/token';
const SUBMIT_TASK_PATH = '/open/v1/argus/task/submit';
const TASK_INFO_PATH = '/open/v1/argus/task/info';
const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRY_SKEW_MS = 30 * 1000;
const DEFAULT_USER_AGENT = 'realsee-skill/argus-2.0.0';
const GATEWAY_RESPONSE_METADATA = Symbol('argus.gatewayResponseMetadata');

export const TASK_STATUS = Object.freeze({
  0: 'queued',
  1: 'processing',
  2: 'succeeded',
  3: 'failed'
});

export class GatewayError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'GatewayError';
    this.code = options.code ?? 'GATEWAY_ERROR';
    this.stage = options.stage ?? null;
    this.remoteCode = options.remoteCode ?? null;
    this.httpStatus = options.httpStatus ?? null;
    this.retryable = options.retryable ?? false;
    this.submissionUnknown = options.submissionUnknown ?? false;
    this.traceId = safeDiagnosticId(options.traceId);
    this.requestId = safeDiagnosticId(options.requestId);
  }
}

export function getGatewayResponseMetadata(value) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;
  return value[GATEWAY_RESPONSE_METADATA] ?? null;
}

export class GatewayClient {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.appKey = options.appKey ?? '';
    this.appSecret = options.appSecret ?? '';
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
    this.now = options.now ?? Date.now;
    this.cachedToken = null;
    this.cachedTokenExpiresAt = 0;

    if (typeof this.fetchImpl !== 'function') {
      throw new Error('fetchImpl is required');
    }
  }

  async getAccessToken() {
    const now = currentTimeMs(this.now);
    if (this.cachedToken && now < this.cachedTokenExpiresAt) {
      return this.cachedToken;
    }
    if (!this.appKey || !this.appSecret) {
      throw new GatewayError('REALSEE_APP_KEY and REALSEE_APP_SECRET are required', {
        code: 'CREDENTIALS_MISSING',
        stage: 'access-token'
      });
    }

    const data = await this.request({
      stage: 'access-token',
      method: 'POST',
      path: ACCESS_TOKEN_PATH,
      contentType: 'application/x-www-form-urlencoded',
      body: new URLSearchParams({ app_key: this.appKey, app_secret: this.appSecret }),
      authenticated: false,
      allowAuthRefresh: false
    });
    const metadata = getGatewayResponseMetadata(data);
    const token = typeof data?.access_token === 'string' ? data.access_token : '';
    if (!token) {
      throw new GatewayError('Gateway access token response did not include access_token', {
        code: 'GATEWAY_PROTOCOL_ERROR',
        stage: 'access-token',
        ...errorMetadata(metadata)
      });
    }
    if (!Number.isSafeInteger(data.expire_at) || data.expire_at <= 0) {
      throw new GatewayError('Gateway access token response did not include a valid expire_at', {
        code: 'GATEWAY_PROTOCOL_ERROR',
        stage: 'access-token',
        ...errorMetadata(metadata)
      });
    }
    this.cachedToken = token;
    this.cachedTokenExpiresAt = accessTokenCacheExpiry({
      now,
      tokenTtlMs: this.tokenTtlMs,
      remoteExpireAt: data?.expire_at
    });
    return token;
  }

  async getFileToken() {
    return this.request({
      stage: 'file-token',
      method: 'GET',
      path: FILE_TOKEN_PATH,
      authenticated: true,
      allowAuthRefresh: true
    });
  }

  async submitTask({ privateCosKey, title }) {
    if (!privateCosKey || !title) {
      throw new TypeError('privateCosKey and title are required');
    }
    // Deliberately no automatic retry. If the response is lost after the
    // server accepts the task, retrying here can create a duplicate task.
    return this.request({
      stage: 'submit',
      method: 'POST',
      path: SUBMIT_TASK_PATH,
      body: JSON.stringify({ private_cos_keys: [privateCosKey], title }),
      authenticated: true,
      allowAuthRefresh: false
    });
  }

  async getTaskInfo({ taskCode }) {
    if (!taskCode) throw new TypeError('taskCode is required');
    const query = new URLSearchParams({ task_code: taskCode });
    return this.request({
      stage: 'task-info',
      method: 'GET',
      path: `${TASK_INFO_PATH}?${query.toString()}`,
      authenticated: true,
      allowAuthRefresh: true
    });
  }

  invalidateToken() {
    this.cachedToken = null;
    this.cachedTokenExpiresAt = 0;
  }

  async request({
    stage,
    method,
    path,
    body,
    contentType = 'application/json',
    authenticated,
    allowAuthRefresh,
    _retriedOnExpiry = false
  }) {
    const headers = { 'User-Agent': this.userAgent };
    if (body !== undefined) headers['Content-Type'] = contentType;
    if (authenticated) headers.Authorization = await this.getAccessToken();

    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, { method, headers, body });
    } catch (cause) {
      throw new GatewayError(`Gateway ${stage} request did not return a response`, {
        cause,
        code: 'GATEWAY_TRANSPORT_ERROR',
        stage,
        retryable: method === 'GET',
        submissionUnknown: stage === 'submit'
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new GatewayError('Gateway response was not JSON', {
        cause,
        code: 'GATEWAY_PROTOCOL_ERROR',
        stage,
        httpStatus: response.status,
        submissionUnknown: stage === 'submit'
      });
    }

    const metadata = responseMetadata(payload);

    if (!payload || !Object.hasOwn(payload, 'code')) {
      throw new GatewayError('Unexpected Gateway response envelope', {
        code: 'GATEWAY_PROTOCOL_ERROR',
        stage,
        httpStatus: response.status,
        submissionUnknown: stage === 'submit',
        ...errorMetadata(metadata)
      });
    }

    if (Number(payload.code) !== 0) {
      const looksLikeExpired =
        Number(payload.code) === -3 ||
        String(payload.status ?? '').toLowerCase().includes('expired') ||
        String(payload.message ?? '').toLowerCase().includes('expired');
      if (authenticated && allowAuthRefresh && looksLikeExpired && !_retriedOnExpiry) {
        this.invalidateToken();
        return this.request({
          stage,
          method,
          path,
          body,
          contentType,
          authenticated,
          allowAuthRefresh,
          _retriedOnExpiry: true
        });
      }
      throw new GatewayError(payload.status || payload.message || 'Gateway request failed', {
        code: 'GATEWAY_REJECTED',
        stage,
        remoteCode: payload.code,
        httpStatus: response.status,
        retryable: method === 'GET' && response.status >= 500,
        ...errorMetadata(metadata)
      });
    }

    if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
      throw new GatewayError('Gateway response data was not an object', {
        code: 'GATEWAY_PROTOCOL_ERROR',
        stage,
        httpStatus: response.status,
        submissionUnknown: stage === 'submit',
        ...errorMetadata(metadata)
      });
    }

    return attachResponseMetadata(payload.data, metadata);
  }
}

export function mapTaskStatus(value) {
  const numeric = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  const status = TASK_STATUS[numeric];
  if (!status) {
    throw new GatewayError(`Unexpected Argus task status: ${String(value)}`, {
      code: 'GATEWAY_PROTOCOL_ERROR',
      stage: 'task-info'
    });
  }
  return status;
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) throw new Error('baseUrl is required');
  return String(baseUrl).replace(/\/+$/, '');
}

function accessTokenCacheExpiry({ now, tokenTtlMs, remoteExpireAt }) {
  const ttl = Number(tokenTtlMs);
  const localExpiry = now + (Number.isFinite(ttl) && ttl > 0 ? ttl : 0);
  const remoteExpiry = remoteExpireAt * 1000 - TOKEN_EXPIRY_SKEW_MS;
  return Math.max(now, Math.min(localExpiry, remoteExpiry));
}

function currentTimeMs(now) {
  const value = now();
  const milliseconds = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(milliseconds)) throw new TypeError('now must return a Date or milliseconds');
  return milliseconds;
}

function responseMetadata(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const traceId = safeDiagnosticId(payload.trace_id);
  const requestId = safeDiagnosticId(payload.request_id);
  if (!traceId && !requestId) return null;
  return Object.freeze({ trace_id: traceId, request_id: requestId });
}

function attachResponseMetadata(data, metadata) {
  if (!metadata || !data || (typeof data !== 'object' && typeof data !== 'function')) return data;
  Object.defineProperty(data, GATEWAY_RESPONSE_METADATA, {
    value: metadata,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return data;
}

function errorMetadata(metadata) {
  return metadata
    ? { traceId: metadata.trace_id, requestId: metadata.request_id }
    : {};
}

function safeDiagnosticId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || /[\u0000-\u001f\u007f]/u.test(normalized)) return null;
  return normalized.slice(0, 256);
}
