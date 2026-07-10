import test from 'node:test';
import assert from 'node:assert/strict';
import { GatewayClient, GatewayError, mapTaskStatus } from '../src/gateway.mjs';

test('gateway adapter uses the four Argus 2.0 paths and envelopes', async () => {
  const calls = [];
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example/',
    appKey: 'ak',
    appSecret: 'sk',
    userAgent: 'argus-test',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/auth/access_token')) return response({ code: 0, data: { access_token: 'token' } });
      if (url.endsWith('/open/v1/argus/file/token')) return response({ code: 0, data: { bucket: 'b', prefix: 'p/' } });
      if (url.endsWith('/open/v1/argus/task/submit')) return response({ code: 0, data: { task_code: 'task-1' } });
      return response({ code: 0, data: { status: 2, output_url: 'https://cdn.invalid/output.zip' } });
    }
  });

  assert.equal((await gateway.getFileToken()).bucket, 'b');
  assert.equal((await gateway.submitTask({ privateCosKey: 'p/input.zip', title: 'job' })).task_code, 'task-1');
  assert.equal((await gateway.getTaskInfo({ taskCode: 'task-1' })).status, 2);

  assert.equal(calls[0].url, 'https://gateway.example/auth/access_token');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body.toString(), 'app_key=ak&app_secret=sk');

  assert.equal(calls[1].url, 'https://gateway.example/open/v1/argus/file/token');
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].init.body, undefined);
  assert.equal(calls[1].init.headers.Authorization, 'token');

  assert.equal(calls[2].url, 'https://gateway.example/open/v1/argus/task/submit');
  assert.equal(calls[2].init.method, 'POST');
  assert.equal(calls[2].init.body, JSON.stringify({ private_cos_key: 'p/input.zip', title: 'job' }));

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
      if (url.endsWith('/auth/access_token')) return response({ code: 0, data: { access_token: 'token' } });
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
        return response({ code: 0, data: { access_token: `token-${accessTokens}` } });
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
        return response({ code: 0, data: { access_token: `token-${accessTokens}` } });
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

test('maps all public numeric task statuses and rejects unknown values', () => {
  assert.deepEqual([0, 1, 2, 3].map(mapTaskStatus), ['queued', 'processing', 'succeeded', 'failed']);
  assert.equal(mapTaskStatus('2'), 'succeeded');
  assert.throws(() => mapTaskStatus(9), /Unexpected Argus task status/);
});

function response(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
