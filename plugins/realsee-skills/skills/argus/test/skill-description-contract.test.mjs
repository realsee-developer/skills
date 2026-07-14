import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

const skillRoot = resolve(import.meta.dirname, '..');

test('Skill frontmatter exposes the official top-level compatibility field and bounded description', async () => {
  const text = await readFile(join(skillRoot, 'SKILL.md'), 'utf8');
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/u)?.[1];
  assert.ok(frontmatter, 'SKILL.md must have YAML frontmatter');

  const description = frontmatter.match(/^description:\s*(.+)$/mu)?.[1];
  const compatibility = frontmatter.match(/^compatibility:\s*(.+)$/mu)?.[1];
  const metadata = frontmatter.match(/^metadata:\n((?: {2}.+(?:\n|$))*)/mu)?.[1] ?? '';
  assert.ok(description?.startsWith('Use this skill to '));
  assert.match(description, /Do not trigger for/u);
  assert.ok(description.length <= 1024);
  assert.ok(compatibility && compatibility.length <= 500);
  assert.match(compatibility, /POSIX shell/u);
  assert.match(compatibility, /Node\.js 22\+/u);
  assert.match(compatibility, /npm 10\+/u);
  assert.match(compatibility, /network access/u);
  assert.doesNotMatch(metadata, /compatibility:/u);
});

test('trigger eval queries follow the official balanced should-trigger contract', async () => {
  const queries = JSON.parse(await readFile(join(skillRoot, 'evals', 'eval_queries.json'), 'utf8'));
  assert.equal(queries.length, 20);
  assert.equal(queries.filter(({ should_trigger: shouldTrigger }) => shouldTrigger === true).length, 10);
  assert.equal(queries.filter(({ should_trigger: shouldTrigger }) => shouldTrigger === false).length, 10);
  assert.equal(new Set(queries.map(({ query }) => query)).size, queries.length);

  for (const entry of queries) {
    assert.deepEqual(Object.keys(entry).sort(), ['query', 'should_trigger']);
    assert.equal(typeof entry.query, 'string');
    assert.ok(entry.query.trim().length >= 20, 'eval queries should resemble realistic user prompts');
    assert.equal(typeof entry.should_trigger, 'boolean');
  }

  const positiveQueries = queries.filter(({ should_trigger: shouldTrigger }) => shouldTrigger);
  const negativeQueries = queries.filter(({ should_trigger: shouldTrigger }) => !shouldTrigger);
  assert.ok(positiveQueries.some(({ query }) => !/argus/iu.test(query)));
  assert.ok(positiveQueries.some(({ query }) => /(?:~\/|\/data\/)/u.test(query)));
  assert.ok(negativeQueries.every(({ query }) =>
    /(?:panorama|全景|depth|GLB|point cloud|3D|Argus|pose)/iu.test(query)
  ));
});
