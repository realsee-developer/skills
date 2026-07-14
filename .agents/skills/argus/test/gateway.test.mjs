import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GatewayClient,
  GatewayError,
  getGatewayResponseMetadata,
  mapTaskStatus
} from '../src/gateway.mjs';

test('gateway adapter uses the four Argus 2.0 paths and envelopes', async () => {
  const calls = [];
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example/',
    appKey: 'ak',
    appSecret: 'sk',
    userAgent: 'argus-test',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/auth/access_token')) {
        return response(
          { code: 0, data: { access_token: 'token', expire_at: 4_102_444_800 } },
          { traceId: 'trace-auth' }
        );
      }
      if (url.endsWith('/open/v1/argus/file/token')) {
        return response({ code: 0, data: { bucket: 'b', prefix: 'p/' } }, { traceId: 'trace-file' });
      }
      if (url.endsWith('/open/v1/argus/task/submit')) {
        return response({ code: 0, data: { task_code: 'task-1' } }, { traceId: 'trace-submit' });
      }
      return response(
        {
          code: 0,
          data: {
            status: 2,
            output_url: 'https://cdn.invalid/output.zip',
            expiration_timestamp: 4_102_444_800,
            error_message: '',
            create_timestamp: 1,
            modify_timestamp: 2
          }
        },
        { traceId: 'trace-info' }
      );
    }
  });

  const fileLease = await gateway.getFileToken();
  const submitted = await gateway.submitTask({ privateCosKey: 'p/input.zip', title: 'job' });
  const info = await gateway.getTaskInfo({ taskCode: 'task-1' });
  assert.equal(fileLease.bucket, 'b');
  assert.equal(submitted.task_code, 'task-1');
  assert.equal(info.status, 2);
  assert.deepEqual(getGatewayResponseMetadata(fileLease), {
    trace_id: 'trace-file',
    request_id: 'request-test'
  });
  assert.deepEqual(getGatewayResponseMetadata(submitted), {
    trace_id: 'trace-submit',
    request_id: 'request-test'
  });
  assert.deepEqual(getGatewayResponseMetadata(info), {
    trace_id: 'trace-info',
    request_id: 'request-test'
  });
  assert.equal(JSON.stringify(info).includes('trace-info'), false);

  assert.equal(calls[0].url, 'https://gateway.example/auth/access_token');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body.toString(), 'app_key=ak&app_secret=sk');

  assert.equal(calls[1].url, 'https://gateway.example/open/v1/argus/file/token');
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].init.body, undefined);
  assert.equal(calls[1].init.headers.Authorization, 'token');

  assert.equal(calls[2].url, 'https://gateway.example/open/v1/argus/task/submit');
  assert.equal(calls[2].init.method, 'POST');
  assert.equal(calls[2].init.body, JSON.stringify({ private_cos_keys: ['p/input.zip'], title: 'job' }));

  assert.equal(calls[3].url, 'https://gateway.example/open/v1/argus/task/info?task_code=task-1');
  assert.equal(calls[3].init.method, 'GET');
  assert.equal(calls[3].init.body, undefined);
});

test('submit is never retried when its response is lost', async () => {
  let submits = 0;
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example',
    appKey: 'ak',
    appSecret: 'sk',
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/access_token')) {
        return response({
          code: 0,
          data: { access_token: 'token', expire_at: 4_102_444_800 }
        });
      }
      submits += 1;
      throw new Error('socket closed');
    }
  });

  await assert.rejects(
    () => gateway.submitTask({ privateCosKey: 'p/input.zip', title: 'job' }),
    (error) => error instanceof GatewayError && error.submissionUnknown === true
  );
  assert.equal(submits, 1);
});

test('submit does not refresh auth and retry on an expired-token envelope', async () => {
  let accessTokens = 0;
  let submits = 0;
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example',
    appKey: 'ak',
    appSecret: 'sk',
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/access_token')) {
        accessTokens += 1;
        return response({
          code: 0,
          data: { access_token: `token-${accessTokens}`, expire_at: 4_102_444_800 }
        });
      }
      submits += 1;
      return response({ code: -3, message: 'token expired', data: null });
    }
  });

  await assert.rejects(
    () => gateway.submitTask({ privateCosKey: 'p/input.zip', title: 'job' }),
    (error) => error instanceof GatewayError && error.remoteCode === -3
  );
  assert.equal(accessTokens, 1);
  assert.equal(submits, 1);
});

test('read-only task info may refresh auth once', async () => {
  let accessTokens = 0;
  let infoCalls = 0;
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example',
    appKey: 'ak',
    appSecret: 'sk',
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/access_token')) {
        accessTokens += 1;
        return response({
          code: 0,
          data: { access_token: `token-${accessTokens}`, expire_at: 4_102_444_800 }
        });
      }
      infoCalls += 1;
      return infoCalls === 1
        ? response({ code: -3, message: 'token expired', data: null })
        : response({ code: 0, data: { status: 1 } });
    }
  });

  assert.equal((await gateway.getTaskInfo({ taskCode: 'task' })).status, 1);
  assert.equal(accessTokens, 2);
  assert.equal(infoCalls, 2);
});

test('Gateway errors retain safe trace and request identifiers', async () => {
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example',
    appKey: 'ak',
    appSecret: 'sk',
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/access_token')) {
        return response({ code: 0, data: { access_token: 'token', expire_at: 4_102_444_800 } });
      }
      return response(
        { code: -1, status: 'Failed to get task', data: null },
        { traceId: 'trace-failure', requestId: 'request-failure' }
      );
    }
  });

  await assert.rejects(
    () => gateway.getTaskInfo({ taskCode: 'task' }),
    (error) =>
      error instanceof GatewayError &&
      error.traceId === 'trace-failure' &&
      error.requestId === 'request-failure'
  );
});

test('successful envelopes reject non-object data without losing diagnostics', async () => {
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example',
    appKey: 'ak',
    appSecret: 'sk',
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/access_token')) {
        return response({ code: 0, data: { access_token: 'token', expire_at: 4_102_444_800 } });
      }
      return response(
        { code: 0, data: null },
        { traceId: 'trace-null-data', requestId: 'request-null-data' }
      );
    }
  });

  await assert.rejects(
    () => gateway.getTaskInfo({ taskCode: 'task' }),
    (error) =>
      error instanceof GatewayError &&
      error.code === 'GATEWAY_PROTOCOL_ERROR' &&
      error.traceId === 'trace-null-data' &&
      error.requestId === 'request-null-data'
  );
});

test('access token requires a token and numeric expire_at while retaining diagnostics', async () => {
  for (const data of [
    { expire_at: 4_102_444_800 },
    { access_token: 'token' },
    { access_token: 'token', expire_at: '4102444800' }
  ]) {
    const gateway = new GatewayClient({
      baseUrl: 'https://gateway.example',
      appKey: 'ak',
      appSecret: 'sk',
      fetchImpl: async () => response(
        { code: 0, data },
        { traceId: 'trace-invalid-auth', requestId: 'request-invalid-auth' }
      )
    });

    await assert.rejects(
      () => gateway.getAccessToken(),
      (error) =>
        error instanceof GatewayError &&
        error.code === 'GATEWAY_PROTOCOL_ERROR' &&
        error.traceId === 'trace-invalid-auth' &&
        error.requestId === 'request-invalid-auth'
    );
  }
});

test('access token cache never outlives expire_at minus clock skew', async () => {
  let now = 1_000_000;
  let tokenRequests = 0;
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example',
    appKey: 'ak',
    appSecret: 'sk',
    now: () => now,
    tokenTtlMs: 10 * 60 * 1000,
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/access_token')) {
        tokenRequests += 1;
        return response({
          code: 0,
          data: {
            access_token: `token-${tokenRequests}`,
            expire_at: (now + 60_000) / 1000
          }
        });
      }
      return response({ code: 0, data: { bucket: 'b', prefix: 'p/' } });
    }
  });

  await gateway.getFileToken();
  now += 29_000;
  await gateway.getFileToken();
  assert.equal(tokenRequests, 1);
  now += 2_000;
  await gateway.getFileToken();
  assert.equal(tokenRequests, 2);
});

test('access token cache also honors the configured local TTL ceiling', async () => {
  let now = 1_000_000;
  let tokenRequests = 0;
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example',
    appKey: 'ak',
    appSecret: 'sk',
    now: () => now,
    tokenTtlMs: 10_000,
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/access_token')) {
        tokenRequests += 1;
        return response({
          code: 0,
          data: { access_token: `token-${tokenRequests}`, expire_at: 4_102_444_800 }
        });
      }
      return response({ code: 0, data: { bucket: 'b', prefix: 'p/' } });
    }
  });

  await gateway.getFileToken();
  now += 9_000;
  await gateway.getFileToken();
  assert.equal(tokenRequests, 1);
  now += 2_000;
  await gateway.getFileToken();
  assert.equal(tokenRequests, 2);
});

test('maps all public numeric task statuses and rejects unknown values', () => {
  assert.deepEqual([0, 1, 2, 3].map(mapTaskStatus), ['queued', 'processing', 'succeeded', 'failed']);
  assert.equal(mapTaskStatus('2'), 'succeeded');
  assert.throws(() => mapTaskStatus(9), /Unexpected Argus task status/);
});

function response(payload, init = {}) {
  const envelope = {
    request_id: init.requestId ?? 'request-test',
    trace_id: init.traceId ?? 'trace-test',
    business_code: '',
    osi_request_id: '',
    code: 0,
    status: payload.status ?? (Number(payload.code ?? 0) === 0 ? 'success' : payload.message ?? 'error'),
    data: null,
    cost: 1,
    ...payload
  };
  return new Response(JSON.stringify(envelope), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
