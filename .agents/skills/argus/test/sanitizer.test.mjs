import test from 'node:test';
import assert from 'node:assert/strict';
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
    redactUrlForLog('https://download.example/output.zip?q=abc'),
    'https://download.example/output.zip?[REDACTED_QUERY]'
  );
});

test('leaves url without query unchanged', () => {
  assert.equal(
    redactUrlForLog('https://download.example/output.zip'),
    'https://download.example/output.zip'
  );
});
