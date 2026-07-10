import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const requiredEntries = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'SUPPORT.md',
  'README.md',
  'README.zh-CN.md',
  'docs/install-guides.md',
  'docs/zh-CN/install-guides.md',
  'docs/claude-plugin.md',
  'docs/zh-CN/claude-plugin.md',
  'docs/codex.md',
  'docs/zh-CN/codex.md',
  'docs/usage.md',
  'docs/zh-CN/usage.md',
  'docs/public-distribution.md',
  '.agents/skills/argus/SKILL.md',
  '.agents/skills/argus/README.md',
  '.agents/skills/argus/README.zh-CN.md',
  '.agents/skills/argus/references/argus-gateway-openapi.json',
  '.agents/skills/argus/references/algorithm-io.md',
  '.agents/skills/argus/references/algorithm-io.zh-CN.md',
  '.agents/skills/argus/references/argus-output.schema.json',
  '.agents/skills/argus/references/migration-v2.md',
  '.agents/skills/argus/scripts/run-argus.mjs',
  '~/.realsee/credentials',
  '.claude-plugin/marketplace.json',
  'npx skills add realsee-developer/skills --skill argus',
  '--agent claude-code',
  '--agent codex',
  'npm run rebuild',
  'npm run setup:local',
  'npm run smoke',
  'npm run ci',
  'run-argus.mjs start',
  'run-argus.mjs status',
  'run-argus.mjs collect',
  'check:arkclaw-sync',
  'remote upload',
  'user consent'
];

export function validateAiIndexText(text) {
  return requiredEntries
    .filter((entry) => !text.includes(entry))
    .map((entry) => `llms.txt must reference ${entry}`);
}

if (isCliEntry()) {
  const text = await readFile(resolve(root, 'llms.txt'), 'utf8');
  const failures = validateAiIndexText(text);
  if (failures.length) {
    throw new Error(`AI index validation failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
  console.log('AI index validation ok');
}

function isCliEntry() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
