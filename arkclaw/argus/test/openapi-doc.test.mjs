import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const skillRoot = new URL('..', import.meta.url).pathname;

test('argus gateway openapi document includes public gateway paths and schemas', async () => {
  const openapi = JSON.parse(await readFile(join(skillRoot, 'references', 'argus-gateway-openapi.json'), 'utf8'));

  assert.equal(openapi.openapi, '3.1.0');
  assert.deepEqual(
    Object.keys(openapi.paths).sort(),
    [
      '/auth/access_token',
      '/open/v1/argus/file/token',
      '/open/v1/argus/task/info',
      '/open/v1/argus/task/submit'
    ]
  );
  assert.ok(openapi.components.schemas.UploadTokenData.properties.backup);
  assert.deepEqual(openapi.components.schemas.ArgusTaskStatus.enum, [0, 1, 2, 3]);
  assert.ok(openapi.components.schemas.SubmitTaskRequest.properties.private_cos_key);
  assert.ok(openapi.components.schemas.TaskInfoData.properties.output_url);
  assert.deepEqual(
    new Set((openapi.servers ?? []).map((server) => server.url)),
    new Set(['https://app-gateway.realsee.ai', 'https://app-gateway.realsee.cn'])
  );
});

test('gateway openapi document is safe for public source-available release', async () => {
  const text = await readFile(join(skillRoot, 'references', 'argus-gateway-openapi.json'), 'utf8');
  const forbidden = [
    [['ex', 'tracted from'].join(''), 'h5.realsee.ai'].join(' '),
    ['credential', 'pairs'].join(' '),
    ['live', 'smoked'].join('-'),
    ['live', 'smoke'].join(' '),
    ['local', 'H5', 'source'].join(' '),
    ['Owner', 'confirmation'].join(' ')
  ];

  for (const phrase of forbidden) {
    assert.equal(text.includes(phrase), false, `OpenAPI document must not include internal phrase: ${phrase}`);
  }
});

test('gateway openapi type declarations expose public response types', async () => {
  const declarations = await readFile(join(skillRoot, 'src', 'gateway-openapi-types.d.ts'), 'utf8');

  for (const name of [
    'GatewayEnvelope',
    'AccessTokenData',
    'ArgusFileTokenData',
    'ArgusTaskSubmitRequest',
    'ArgusTaskInfoData'
  ]) {
    assert.match(declarations, new RegExp(`interface ${name}|type ${name}`));
  }
});
