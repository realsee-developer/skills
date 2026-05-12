import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { validateAiIndexText } from '../../../../scripts/validate-ai-index.mjs';

test('AI index validation accepts the repository llms.txt', async () => {
  const text = await readFile(new URL('../../../../llms.txt', import.meta.url), 'utf8');

  assert.deepEqual(validateAiIndexText(text), []);
});

test('AI index validation reports missing required entries', () => {
  const failures = validateAiIndexText('# Realsee Skills\n');

  assert.ok(failures.includes('llms.txt must reference AGENTS.md'));
  assert.ok(failures.includes('llms.txt must reference docs/usage.md'));
  assert.ok(failures.includes('llms.txt must reference npx skills add realsee-developer/skills --skill argus'));
  assert.ok(failures.includes('llms.txt must reference npm run rebuild'));
});

test('AI index does not promote preview links as user-facing output', async () => {
  const text = await readFile(new URL('../../../../llms.txt', import.meta.url), 'utf8');

  assert.equal(text.includes('7-day H5'), false);
  assert.equal(text.includes('H5 preview'), false);
});
