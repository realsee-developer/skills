import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getReleaseGateCommands,
  parseReleaseGateArgs,
  validatePublicGatewayOpenApi
} from '../../../../scripts/release-gate.mjs';

test('stable release gate runs the same CI command set as preview before public contract checks', () => {
  const previewCommands = getReleaseGateCommands('preview');
  const stableCommands = getReleaseGateCommands('stable');

  assert.deepEqual(stableCommands, previewCommands);
  assert.ok(stableCommands.some(([command, args]) => command === 'npm' && args.join(' ') === 'run validate:ai'));
  assert.ok(stableCommands.some(([command, args]) => command === 'npm' && args.join(' ') === 'run rebuild'));
  assert.ok(stableCommands.some(([command, args]) => command === 'npm' && args.join(' ') === 'run test:skill'));
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
      title: 'Realsee Argus/VGGT Gateway API',
      description: 'Public Realsee Argus/VGGT Gateway API contract.'
    },
    paths: {
      '/auth/access_token': {},
      '/open/saas/v1/vggt/upload/token': {},
      '/open/saas/v1/vggt/trigger': {},
      '/open/saas/v1/vggt/poll': {}
    },
    components: {
      schemas: {
        AccessTokenRequest: {},
        AccessTokenData: {},
        UploadTokenRequest: {},
        UploadTokenData: {},
        TriggerVggtRequest: {},
        PollVggtData: {}
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
  openapi.info.description = 'Public Realsee Argus/VGGT Gateway API contract.';
  delete openapi.paths['/open/saas/v1/vggt/poll'];
  assert.equal(validatePublicGatewayOpenApi(openapi), false);
});
