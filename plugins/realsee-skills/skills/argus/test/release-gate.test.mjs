import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { classifyReleaseTag } from '../../../../scripts/classify-release-tag.mjs';
import {
  getReleaseGateCommands,
  parseReleaseGateArgs,
  validatePreviewReleaseMetadata,
  validatePublicGatewayOpenApi,
  validateStableReleaseMetadata
} from '../../../../scripts/release-gate.mjs';

const repoRoot = resolve(import.meta.dirname, '../../../..');

test('stable release gate runs the same CI command set as preview before public contract checks', () => {
  const previewCommands = getReleaseGateCommands('preview');
  const stableCommands = getReleaseGateCommands('stable');

  assert.deepEqual(stableCommands, previewCommands);
  assert.ok(stableCommands.some(([command, args]) => command === 'npm' && args.join(' ') === 'run validate:ai'));
  assert.ok(stableCommands.some(([command, args]) => command === 'npm' && args.join(' ') === 'run rebuild'));
  const rebuildIndex = stableCommands.findIndex(
    ([command, args]) => command === 'npm' && args.join(' ') === 'run rebuild'
  );
  const cleanIndex = stableCommands.findIndex(
    ([command, args]) => command === 'node' && args.join(' ') === 'scripts/check-generated-clean.mjs'
  );
  const smokeIndex = stableCommands.findIndex(
    ([command, args]) => command === 'npm' && args.join(' ') === 'run smoke'
  );
  const worktreeCleanIndex = stableCommands.findIndex(
    ([command, args]) => command === 'node' && args.join(' ') === 'scripts/check-worktree-clean.mjs'
  );
  assert.ok(cleanIndex > rebuildIndex, 'generated drift check must run after rebuild');
  assert.ok(smokeIndex > cleanIndex, 'fresh-install smoke must run after generated drift check');
  assert.ok(worktreeCleanIndex > smokeIndex, 'the entire worktree must be clean after external smoke tools run');
  assert.ok(stableCommands.some(([command, args]) => command === 'npm' && args.join(' ') === 'run test:repo'));
  assert.ok(stableCommands.some(([command, args]) => command === 'npm' && args.join(' ') === 'run test:skill'));
  assert.ok(stableCommands.some(([command, args]) =>
    command === 'npm' && args.join(' ') === '--prefix .agents/skills/argus run audit:prod'
  ));
});

test('release tags classify prereleases separately from stable releases', () => {
  assert.deepEqual(classifyReleaseTag('v2.0.0-rc.1'), {
    channel: 'preview',
    prerelease: true,
    releaseFlag: '--prerelease'
  });
  assert.deepEqual(classifyReleaseTag('v2.0.0'), {
    channel: 'stable',
    prerelease: false,
    releaseFlag: '--latest'
  });
  assert.throws(() => classifyReleaseTag('release-2.0.0'), /release tag must be/);
});

test('release workflow isolates the read-only gate from fresh privileged publication', async () => {
  const workflow = await readFile(join(repoRoot, '.github', 'workflows', 'release.yml'), 'utf8');
  const gateStart = workflow.indexOf('  gate:\n');
  const releaseStart = workflow.indexOf('  release:\n');
  assert.ok(gateStart >= 0 && releaseStart > gateStart);

  const gate = workflow.slice(gateStart, releaseStart);
  const release = workflow.slice(releaseStart);
  assert.match(gate, /permissions:\n\s+contents: read/);
  assert.match(gate, /persist-credentials: false/);
  assert.match(gate, /classify-release-tag\.mjs/);
  assert.doesNotMatch(gate, /build:arkclaw/);

  assert.match(release, /permissions:\n\s+contents: write/);
  assert.match(release, /Build from fresh checkout and publish/);
  assert.match(release, /actions\/checkout@v6/);
  assert.match(release, /persist-credentials: false/);
  assert.match(release, /npm run build:arkclaw/);
  assert.match(release, /needs\.gate\.outputs\.release_flag/);
  assert.doesNotMatch(release, /npm run release:gate/);
});

test('branch and pull-request release checks derive channel and tag from release metadata', async () => {
  const workflow = await readFile(join(repoRoot, '.github', 'workflows', 'release-gate.yml'), 'utf8');
  assert.match(workflow, /RELEASE_METADATA_CHANNEL/u);
  assert.match(workflow, /stable\) RELEASE_CHANNEL=stable/u);
  assert.match(workflow, /development\) RELEASE_CHANNEL=preview/u);
  assert.match(workflow, /next_release_candidate/);
  assert.doesNotMatch(workflow, /RELEASE_TAG:.*github\.ref_name/);
  assert.doesNotMatch(workflow, /startsWith\(github\.ref_name/u);
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

test('preview metadata accepts only the declared next release candidate', () => {
  const metadata = {
    version: '2.0.0',
    channel: 'development',
    skills: {
      argus: {
        state: 'preview',
        stable_gate: 'pending',
        next_release_candidate: 'v2.0.0-rc.3'
      }
    }
  };

  assert.equal(validatePreviewReleaseMetadata(metadata, 'v2.0.0-rc.3'), true);
  assert.equal(validatePreviewReleaseMetadata(metadata, 'v2.0.0-rc.1'), false);
  assert.equal(validatePreviewReleaseMetadata(metadata, 'v2.0.1-rc.3'), false);

  metadata.skills.argus.next_release_candidate = 'v2.0.1-rc.3';
  assert.equal(validatePreviewReleaseMetadata(metadata, 'v2.0.1-rc.3'), false);

  metadata.skills.argus.next_release_candidate = 'v2.0.0-rc.3';
  metadata.skills.argus.stable_gate = 'passed';
  assert.equal(validatePreviewReleaseMetadata(metadata, 'v2.0.0-rc.3'), false);
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
