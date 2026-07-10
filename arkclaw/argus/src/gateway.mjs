const ACCESS_TOKEN_PATH = '/auth/access_token';
const FILE_TOKEN_PATH = '/open/v1/argus/file/token';
const SUBMIT_TASK_PATH = '/open/v1/argus/task/submit';
const TASK_INFO_PATH = '/open/v1/argus/task/info';
const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000;
const DEFAULT_USER_AGENT = 'realsee-skill/argus-2.0.0';

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
    const token = typeof data?.access_token === 'string' ? data.access_token : '';
    if (!token) {
      throw new GatewayError('Gateway access token response did not include access_token', {
        code: 'GATEWAY_PROTOCOL_ERROR',
        stage: 'access-token'
      });
    }
    this.cachedToken = token;
    this.cachedTokenExpiresAt = Date.now() + this.tokenTtlMs;
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

    if (!payload || !Object.hasOwn(payload, 'code')) {
      throw new GatewayError('Unexpected Gateway response envelope', {
        code: 'GATEWAY_PROTOCOL_ERROR',
        stage,
        httpStatus: response.status,
        submissionUnknown: stage === 'submit'
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
        retryable: method === 'GET' && response.status >= 500
      });
    }

    return payload.data;
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
