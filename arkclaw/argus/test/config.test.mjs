import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, REGION_GATEWAY_BASE_URLS } from '../src/config.mjs';

test('maps the unchanged global and cn gateway base URLs', () => {
  assert.deepEqual(REGION_GATEWAY_BASE_URLS, {
    global: 'https://app-gateway.realsee.ai',
    cn: 'https://app-gateway.realsee.cn'
  });
  assert.equal(
    parseConfig({ env: credentials('global') }).gatewayBaseUrl,
    'https://app-gateway.realsee.ai'
  );
  assert.equal(
    parseConfig({ env: credentials('cn') }).gatewayBaseUrl,
    'https://app-gateway.realsee.cn'
  );
});

test('requires credentials and explicit region for live operations', () => {
  assert.throws(() => parseConfig({ env: {} }), /REALSEE_REGION/);
  assert.throws(() => parseConfig({ env: { REALSEE_REGION: 'global' } }), /APP_KEY.*APP_SECRET/);
  assert.throws(() => parseConfig({ env: credentials('mars') }), /global, cn/);
});

test('offline reads may omit credentials but preserve region mapping', () => {
  const config = parseConfig({ env: { REALSEE_REGION: 'cn' }, live: false });
  assert.equal(config.region, 'cn');
  assert.equal(config.appKey, undefined);
  assert.equal(config.appSecret, undefined);
});

test('rejects legacy ARGUS environment names', () => {
  assert.throws(
    () => parseConfig({ env: { ...credentials('cn'), ARGUS_REGION: 'cn' } }),
    /ARGUS_REGION/
  );
});

function credentials(region) {
  return {
    REALSEE_REGION: region,
    REALSEE_APP_KEY: 'key',
    REALSEE_APP_SECRET: 'secret'
  };
}
