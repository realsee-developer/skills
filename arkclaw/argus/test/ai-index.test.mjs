import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { validateAiIndex } from '../../../../scripts/validate-ai-index.mjs';

const requiredFiles = [
  'AGENTS.md', 'docs/install-guides.md', 'docs/usage.md',
  '.agents/skills/argus/SKILL.md',
  '.agents/skills/realsee-blender-reconstruction/SKILL.md'
];

async function fixture(t, links = requiredFiles) {
  const root = await mkdtemp(join(tmpdir(), 'ai-index-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of requiredFiles) {
    await mkdir(join(root, file, '..'), { recursive: true });
    await writeFile(join(root, file), '# Documentation\n');
  }
  await writeFile(join(root, 'llms.txt'), links.map((path) => `- [Read](${path})`).join('\n'));
  return root;
}

test('AI index routes to every canonical skill with existing local references', async () => {
  const root = fileURLToPath(new URL('../../../..', import.meta.url));
  assert.deepEqual(await validateAiIndex(root), []);
});

test('a newly added skill must be discoverable from the index', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, '.agents/skills/new-skill'));
  await writeFile(join(root, '.agents/skills/new-skill/SKILL.md'), '# New skill\n');
  assert.deepEqual(await validateAiIndex(root), ['llms.txt must link to .agents/skills/new-skill/SKILL.md']);
});

test('mentioning a skill path without a usable link does not make it discoverable', async (t) => {
  const missing = '.agents/skills/realsee-blender-reconstruction/SKILL.md';
  const root = await fixture(t, requiredFiles.filter((path) => path !== missing));
  await writeFile(join(root, 'llms.txt'), requiredFiles.filter((path) => path !== missing)
    .map((path) => `- [Read](${path})`).join('\n') + `\n${missing}\n`);
  assert.ok((await validateAiIndex(root)).includes(`llms.txt must link to ${missing}`));
});

test('broken local links fail while external links need no network request', async (t) => {
  const root = await fixture(t, [...requiredFiles, 'docs/missing.md', 'https://example.invalid/guide']);
  assert.deepEqual(await validateAiIndex(root), ['llms.txt link does not exist: docs/missing.md']);
});
