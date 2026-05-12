import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.mjs';

test('requires explicit region for live mode', () => {
  assert.throws(() => parseConfig({ env: {}, args: {}, live: true }), /REALSEE_REGION/);
});

test('accepts cn and global region', () => {
  assert.equal(parseConfig({ env: { REALSEE_REGION: 'cn' }, args: {}, live: true }).region, 'cn');
  assert.equal(parseConfig({ env: { REALSEE_REGION: 'global' }, args: {}, live: true }).region, 'global');
});

test('maps gateway base url from region', () => {
  assert.equal(
    parseConfig({ env: { REALSEE_REGION: 'cn' }, args: {}, live: true }).gatewayBaseUrl,
    'https://app-gateway.realsee.cn'
  );
  assert.equal(
    parseConfig({ env: { REALSEE_REGION: 'global' }, args: {}, live: true }).gatewayBaseUrl,
    'https://app-gateway.realsee.ai'
  );
});

test('rejects ARGUS legacy variables', () => {
  assert.throws(() => parseConfig({ env: { ARGUS_REGION: 'cn', REALSEE_REGION: 'cn' }, args: {}, live: true }), /ARGUS_REGION/);
});

test('rejects invalid region', () => {
  assert.throws(() => parseConfig({ env: { REALSEE_REGION: 'us' }, args: {}, live: true }), /REALSEE_REGION/);
});

test('poll override priority is cli then env then default', () => {
  assert.equal(parseConfig({ env: {}, args: {}, live: false }).poll.intervalMs, 5000);
  assert.equal(parseConfig({ env: { REALSEE_POLL_INTERVAL_MS: '7000' }, args: {}, live: false }).poll.intervalMs, 7000);
  assert.equal(parseConfig({ env: { REALSEE_POLL_INTERVAL_MS: '7000' }, args: { pollIntervalMs: '9000' }, live: false }).poll.intervalMs, 9000);
});

test('poll max attempts override priority is cli then env then default', () => {
  assert.equal(parseConfig({ env: {}, args: {}, live: false }).poll.maxAttempts, 120);
  assert.equal(parseConfig({ env: { REALSEE_POLL_MAX_ATTEMPTS: '33' }, args: {}, live: false }).poll.maxAttempts, 33);
  assert.equal(parseConfig({ env: { REALSEE_POLL_MAX_ATTEMPTS: '33' }, args: { pollMaxAttempts: 44 }, live: false }).poll.maxAttempts, 44);
});

test('rejects invalid poll values', () => {
  assert.throws(() => parseConfig({ env: { REALSEE_POLL_INTERVAL_MS: '0' }, args: {}, live: false }), /REALSEE_POLL_INTERVAL_MS/);
  assert.throws(() => parseConfig({ env: { REALSEE_POLL_MAX_ATTEMPTS: '-1' }, args: {}, live: false }), /REALSEE_POLL_MAX_ATTEMPTS/);
  assert.throws(() => parseConfig({ env: {}, args: { pollIntervalMs: '1.5' }, live: false }), /pollIntervalMs/);
  assert.throws(() => parseConfig({ env: {}, args: { pollMaxAttempts: 'abc' }, live: false }), /pollMaxAttempts/);
});

test('returns credentials from env', () => {
  const config = parseConfig({
    env: { REALSEE_APP_KEY: 'key', REALSEE_APP_SECRET: 'secret' },
    args: {},
    live: false
  });

  assert.equal(config.appKey, 'key');
  assert.equal(config.appSecret, 'secret');
});

test('ignores empty-string REALSEE_* env values', () => {
  const config = parseConfig({
    env: { REALSEE_APP_KEY: '', REALSEE_APP_SECRET: '' },
    args: {},
    live: false
  });
  assert.equal(config.appKey, undefined);
  assert.equal(config.appSecret, undefined);
});
