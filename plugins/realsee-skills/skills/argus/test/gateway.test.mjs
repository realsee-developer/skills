import test from 'node:test';
import assert from 'node:assert/strict';
import { GatewayError, GatewayClient } from '../src/gateway.mjs';

test('gateway client requests access token with public gateway openapi form contract', async () => {
  const calls = [];
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example',
    appKey: 'ak',
    appSecret: 'sk',
    userAgent: 'realsee-skill-test/0.0.0',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ code: 0, data: { access_token: 'tok' }, status: 'ok' });
    }
  });

  const token = await gateway.getAccessToken();

  assert.equal(token, 'tok');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://gateway.example/auth/access_token');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(calls[0].init.headers['User-Agent'], 'realsee-skill-test/0.0.0');
  assert.equal(calls[0].init.body.toString(), 'app_key=ak&app_secret=sk');
});

test('gateway client calls upload-token, trigger, and poll paths with public contract shapes', async () => {
  const calls = [];
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example/',
    appKey: 'ak',
    appSecret: 'sk',
    userAgent: 'realsee-skill-test/0.0.0',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/auth/access_token')) {
        return jsonResponse({ code: 0, data: { access_token: 'tok' }, status: 'ok' });
      }
      if (url.endsWith('/open/saas/v1/vggt/upload/token')) {
        return jsonResponse({ code: 0, data: { input_image_id: 'img-1', upload_token: { bucket: 'b' } }, status: 'ok' });
      }
      if (url.endsWith('/open/saas/v1/vggt/trigger')) {
        return jsonResponse({ code: 0, data: {}, status: 'ok' });
      }
      return jsonResponse({
        code: 0,
        data: { status: 'success', alg_task_id: 'task-1', result_url: 'https://download.example/task-1.glb' },
        status: 'ok'
      });
    }
  });

  const upload = await gateway.getUploadToken({ inputImageId: 'img-1' });
  const trigger = await gateway.triggerVGGT({ type: 'pinhole', inputImageId: 'img-1' });
  const poll = await gateway.pollVGGT({ type: 'pinhole', inputImageId: 'img-1' });

  assert.equal(upload.input_image_id, 'img-1');
  assert.deepEqual(trigger, {});
  assert.equal(poll.alg_task_id, 'task-1');

  const uploadCall = calls.find((call) => call.url.endsWith('/open/saas/v1/vggt/upload/token'));
  assert.equal(uploadCall.init.method, 'POST');
  assert.equal(uploadCall.init.headers.Authorization, 'tok');
  assert.equal(uploadCall.init.headers['User-Agent'], 'realsee-skill-test/0.0.0');
  assert.equal(uploadCall.init.headers['Content-Type'], 'application/json');
  assert.equal(uploadCall.init.headers['X-FE-Real-IP'], undefined);
  assert.equal(uploadCall.init.headers['X-Frontend-Ip-Address'], undefined);
  assert.equal(uploadCall.init.headers.Cookie, undefined);
  assert.equal(uploadCall.init.body, JSON.stringify({ input_image_id: 'img-1' }));

  const triggerCall = calls.find((call) => call.url.endsWith('/open/saas/v1/vggt/trigger'));
  assert.equal(triggerCall.init.method, 'POST');
  assert.equal(triggerCall.init.headers['Content-Type'], 'application/json');
  assert.equal(triggerCall.init.body, JSON.stringify({ type: 'pinhole', input_image_id: 'img-1' }));

  const pollCall = calls.find((call) => call.url.includes('/open/saas/v1/vggt/poll'));
  assert.equal(pollCall.init.method, 'GET');
  assert.equal(pollCall.url, 'https://gateway.example/open/saas/v1/vggt/poll?type=pinhole&input_image_id=img-1');
  assert.equal(pollCall.init.body, undefined);
});

test('gateway client does not retry ordinary 401 or unknown envelopes', async () => {
  const calls = [];
  const gateway = new GatewayClient({
    baseUrl: 'https://gateway.example',
    appKey: 'ak',
    appSecret: 'sk',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/auth/access_token')) {
        return jsonResponse({ code: 0, data: { access_token: 'tok' }, status: 'ok' });
      }
      return jsonResponse({ code: 401, status: 'denied' }, { status: 401 });
    }
  });

  await assert.rejects(
    () => gateway.getUploadToken({ inputImageId: 'img-1' }),
    (error) => error instanceof GatewayError && error.remoteCode === 401
  );

  assert.equal(calls.length, 2);

  const unknownCalls = [];
  const unknownEnvelopeGateway = new GatewayClient({
    baseUrl: 'https://gateway.example',
    appKey: 'ak',
    appSecret: 'sk',
    fetchImpl: async (url) => {
      unknownCalls.push(url);
      if (url.endsWith('/auth/access_token')) {
        return jsonResponse({ code: 0, data: { access_token: 'tok' }, status: 'ok' });
      }
      return jsonResponse({ unexpected: true });
    }
  });

  await assert.rejects(
    () => unknownEnvelopeGateway.pollVGGT({ type: 'pinhole', inputImageId: 'img-1' }),
    /Unexpected Gateway response envelope/
  );

  assert.equal(unknownCalls.length, 2);
});

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
