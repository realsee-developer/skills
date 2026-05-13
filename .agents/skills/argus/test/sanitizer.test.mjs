import test from 'node:test';
import assert from 'node:assert/strict';
import { failure } from '../src/errors.mjs';
import { redactText, redactUrlForLog } from '../src/sanitizer.mjs';

test('redacts authorization and tokens', () => {
  const input = `Authorization: ${'Bearer'} abc.def token=sec`;

  assert.equal(redactText(input).includes('abc.def'), false);
  assert.equal(redactText(input).includes('sec'), false);
});

test('redacts upload and access token key variants', () => {
  const input = 'uploadToken=u1 access_token=x2 accessToken: z3';
  const redacted = redactText(input);

  assert.equal(redacted.includes('u1'), false);
  assert.equal(redacted.includes('x2'), false);
  assert.equal(redacted.includes('z3'), false);
});

test('redacts query outside user result sink', () => {
  assert.equal(
    redactUrlForLog('https://h5.realsee.cn/argus?algTaskId=abc&type=image'),
    'https://h5.realsee.cn/argus?[REDACTED_QUERY]'
  );
});

test('leaves url without query unchanged', () => {
  assert.equal(redactUrlForLog('https://h5.realsee.cn/argus'), 'https://h5.realsee.cn/argus');
});

test('returns deterministic failure payload', () => {
  assert.deepEqual(
    failure({
      stage: 'upload',
      reason: 'network error',
      workspaceDir: '/tmp/work',
      region: 'cn',
      remoteCode: 'E1',
      nextStep: 'retry later',
      elapsedMs: 12
    }),
    {
      status: 'failed',
      skill: 'argus',
      region: 'cn',
      stage: 'upload',
      reason: 'network error',
      workspace_dir: '/tmp/work',
      elapsed_ms: 12,
      error_detail: {
        remote_code: 'E1',
        retryable: false,
        next_step: 'retry later'
      }
    }
  );
});

test('normalizes optional failure payload fields to null/defaults', () => {
  const payload = failure({
    stage: 'config',
    reason: 'missing region',
    nextStep: 'set REALSEE_REGION'
  });

  assert.equal(payload.region, null);
  assert.equal(payload.workspace_dir, null);
  assert.equal(payload.elapsed_ms, 0);
  assert.equal(payload.error_detail.remote_code, null);
});

test('keeps omitted next step stable through json serialization', () => {
  const payload = failure({
    stage: 'config',
    reason: 'missing region'
  });
  const parsed = JSON.parse(JSON.stringify(payload));

  assert.deepEqual(payload.error_detail, {
    remote_code: null,
    retryable: false,
    next_step: null
  });
  assert.equal(Object.hasOwn(parsed.error_detail, 'next_step'), true);
  assert.equal(parsed.error_detail.next_step, null);
});
