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
  const envelope = openapi.components.schemas.GatewayEnvelopeBase;
  assert.deepEqual(envelope.required, [
    'request_id',
    'trace_id',
    'business_code',
    'osi_request_id',
    'code',
    'status',
    'data',
    'cost'
  ]);
  assert.deepEqual(envelope.properties.data.type, ['object', 'null']);
  for (const envelopeName of [
    'AccessTokenEnvelope',
    'FileTokenEnvelope',
    'SubmitTaskEnvelope',
    'TaskInfoEnvelope'
  ]) {
    const typedData = openapi.components.schemas[envelopeName].allOf[1].properties.data;
    assert.ok(typedData.oneOf.some((schema) => schema.type === 'null'));
  }

  const accessSchema = openapi.components.schemas.AccessTokenData;
  assert.ok(accessSchema.required.includes('expire_at'));
  assert.equal(accessSchema.properties.expire_at.type, 'integer');

  const uploadSchema = openapi.components.schemas.UploadTokenData;
  assert.ok(uploadSchema.required.includes('ttl'));
  assert.equal(uploadSchema.properties.ttl.type, 'number');
  assert.ok(uploadSchema.properties.is_accelerate.oneOf.some((schema) => schema.type === 'string'));
  assert.ok(
    uploadSchema.properties.backup.oneOf.some(
      (schema) => schema.$ref === '#/components/schemas/UploadTokenData'
    )
  );
  assert.deepEqual(openapi.components.schemas.ArgusTaskStatus.enum, [0, 1, 2, 3]);
  assert.equal(openapi.components.schemas.SubmitTaskRequest.properties.private_cos_keys.type, 'array');
  assert.equal(openapi.components.schemas.SubmitTaskRequest.properties.private_cos_keys.minItems, 1);

  const taskInfo = openapi.components.schemas.TaskInfoData;
  assert.deepEqual(taskInfo.required, [
    'create_timestamp',
    'error_message',
    'expiration_timestamp',
    'modify_timestamp',
    'output_url',
    'status'
  ]);
  assert.equal(taskInfo.properties.output_url.format, undefined);
  assert.match(taskInfo.properties.output_url.description, /Non-terminal states return an empty string/);
  assert.match(
    openapi.paths['/open/v1/argus/task/info'].get.responses['200'].description,
    /present but empty in non-terminal states/
  );
  for (const unconfirmed of ['path', 'md5', 'size']) {
    assert.equal(taskInfo.properties[unconfirmed], undefined);
  }
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

  for (const field of [
    'request_id: string',
    'trace_id: string',
    'business_code: string',
    'osi_request_id: string',
    'data: T | null',
    'cost: number',
    'expire_at: number',
    'ttl: number',
    'output_url: string',
    'expiration_timestamp: number',
    'error_message: string',
    'create_timestamp: number',
    'modify_timestamp: number'
  ]) {
    assert.ok(declarations.includes(field), `type declarations must include ${field}`);
  }

  for (const unconfirmed of ['path', 'md5', 'size']) {
    assert.doesNotMatch(declarations, new RegExp(`${unconfirmed}\\?:`));
  }
});
