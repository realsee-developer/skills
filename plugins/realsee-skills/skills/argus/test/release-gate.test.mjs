import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getReleaseGateCommands,
  parseReleaseGateArgs,
  validatePublicGatewayOpenApi,
  validateStableReleaseMetadata
} from '../../../../scripts/release-gate.mjs';

test('stable release gate runs the same CI command set as preview before public contract checks', () => {
  const previewCommands = getReleaseGateCommands('preview');
  const stableCommands = getReleaseGateCommands('stable');

  assert.deepEqual(stableCommands, previewCommands);
  assert.ok(stableCommands.some(([command, args]) => command === 'npm' && args.join(' ') === 'run validate:ai'));
  assert.ok(stableCommands.some(([command, args]) => command === 'npm' && args.join(' ') === 'run rebuild'));
  assert.ok(stableCommands.some(([command, args]) => command === 'npm' && args.join(' ') === 'run test:skill'));
  assert.ok(stableCommands.some(([command, args]) =>
    command === 'npm' && args.join(' ') === '--prefix .agents/skills/argus run audit:prod'
  ));
});

test('stable metadata stays blocked until both-region E2E is explicitly verified', () => {
  const metadata = {
    version: '2.0.0',
    channel: 'development',
    skills: {
      argus: {
        state: 'preview',
        stable_gate: 'pending',
        regions: ['global', 'cn']
      }
    }
  };
  assert.equal(validateStableReleaseMetadata(metadata, 'v2.0.0'), false);
  metadata.channel = 'stable';
  metadata.skills.argus.state = 'stable';
  metadata.skills.argus.stable_gate = 'passed';
  assert.equal(validateStableReleaseMetadata(metadata, 'v2.0.0'), true);
  assert.equal(validateStableReleaseMetadata(metadata, 'v2.0.1'), false);
});

test('release gate requires an explicit tag', () => {
  assert.throws(
    () => parseReleaseGateArgs(['--channel', 'preview']),
    /--tag <tag> is required/
  );
});

test('public Gateway OpenAPI validation requires required paths and rejects internal evidence text', () => {
  const openapi = {
    openapi: '3.1.0',
    info: {
      title: 'Realsee Argus Gateway API',
      description: 'Public Realsee Argus Gateway API contract.'
    },
    servers: [
      { url: 'https://app-gateway.realsee.ai' },
      { url: 'https://app-gateway.realsee.cn' }
    ],
    paths: {
      '/auth/access_token': { post: {} },
      '/open/v1/argus/file/token': { get: {} },
      '/open/v1/argus/task/submit': { post: {} },
      '/open/v1/argus/task/info': { get: {} }
    },
    components: {
      schemas: {
        AccessTokenRequest: {},
        AccessTokenData: {},
        UploadTokenData: {},
        SubmitTaskRequest: {},
        SubmitTaskData: {},
        TaskInfoData: {}
      }
    }
  };

  assert.equal(validatePublicGatewayOpenApi(openapi), true);
  openapi.info.description = [
    'Gateway OpenAPI',
    [['ex', 'tracted from'].join(''), 'h5.realsee.ai'].join(' '),
    'and',
    ['live', 'smoked'].join('-'),
    'with',
    ['credential', 'pairs'].join(' '),
    '.'
  ].join(' ');
  assert.equal(validatePublicGatewayOpenApi(openapi), false);
  openapi.info.description = 'Public Realsee Argus Gateway API contract.';
  delete openapi.paths['/open/v1/argus/task/info'];
  assert.equal(validatePublicGatewayOpenApi(openapi), false);
});
