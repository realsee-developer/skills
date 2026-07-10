import { lstat, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const requiredFiles = [
  'README.md',
  'README.zh-CN.md',
  'AGENTS.md',
  'AGENTS.zh-CN.md',
  'ARCHITECTURE.md',
  'ARCHITECTURE.zh-CN.md',
  'SUPPORT.md',
  'SUPPORT.zh-CN.md',
  'llms.txt',
  'LICENSE',
  'CODEOWNERS',
  'docs/usage.md',
  'docs/zh-CN/usage.md',
  'docs/install-guides.md',
  'docs/zh-CN/install-guides.md',
  'docs/claude-plugin.md',
  'docs/zh-CN/claude-plugin.md',
  'docs/codex.md',
  'docs/zh-CN/codex.md',
  'docs/public-distribution.md',
  'docs/zh-CN/public-distribution.md',
  'CONTRIBUTING.md',
  'CONTRIBUTING.zh-CN.md',
  'CODE_OF_CONDUCT.md',
  'CODE_OF_CONDUCT.zh-CN.md',
  'SECURITY.md',
  'SECURITY.zh-CN.md',
  'docs/development.md',
  'docs/release.md',
  'docs/community.md',
  'docs/zh-CN/development.md',
  'docs/zh-CN/release.md',
  'docs/zh-CN/community.md',
  '.agents/skills/argus/README.md',
  '.agents/skills/argus/README.zh-CN.md',
  '.agents/skills/argus/references/algorithm-io.md',
  '.agents/skills/argus/references/algorithm-io.zh-CN.md',
  '.agents/skills/argus/references/api-workflow.md',
  '.agents/skills/argus/references/api-workflow.zh-CN.md',
  '.agents/skills/argus/references/migration-v2.md',
  '.agents/skills/argus/references/migration-v2.zh-CN.md',
  '.agents/skills/argus/references/troubleshooting.md',
  '.agents/skills/argus/references/troubleshooting.zh-CN.md',
  '.agents/skills/argus/references/argus-output.schema.json',
  '.github/dependabot.yml',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/pull_request_template.md',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  '.github/workflows/release-gate.yml',
  '.github/workflows/codeql.yml'
];

const failures = [];

const languageSwitches = [
  ['README.md', 'README.zh-CN.md'],
  ['README.zh-CN.md', 'README.md'],
  ['AGENTS.md', 'AGENTS.zh-CN.md'],
  ['AGENTS.zh-CN.md', 'AGENTS.md'],
  ['ARCHITECTURE.md', 'ARCHITECTURE.zh-CN.md'],
  ['ARCHITECTURE.zh-CN.md', 'ARCHITECTURE.md'],
  ['SUPPORT.md', 'SUPPORT.zh-CN.md'],
  ['SUPPORT.zh-CN.md', 'SUPPORT.md'],
  ['CONTRIBUTING.md', 'CONTRIBUTING.zh-CN.md'],
  ['CONTRIBUTING.zh-CN.md', 'CONTRIBUTING.md'],
  ['CODE_OF_CONDUCT.md', 'CODE_OF_CONDUCT.zh-CN.md'],
  ['CODE_OF_CONDUCT.zh-CN.md', 'CODE_OF_CONDUCT.md'],
  ['SECURITY.md', 'SECURITY.zh-CN.md'],
  ['SECURITY.zh-CN.md', 'SECURITY.md'],
  ['docs/usage.md', 'zh-CN/usage.md'],
  ['docs/zh-CN/usage.md', '../usage.md'],
  ['docs/install-guides.md', 'zh-CN/install-guides.md'],
  ['docs/zh-CN/install-guides.md', '../install-guides.md'],
  ['docs/claude-plugin.md', 'zh-CN/claude-plugin.md'],
  ['docs/zh-CN/claude-plugin.md', '../claude-plugin.md'],
  ['docs/codex.md', 'zh-CN/codex.md'],
  ['docs/zh-CN/codex.md', '../codex.md'],
  ['docs/public-distribution.md', 'zh-CN/public-distribution.md'],
  ['docs/zh-CN/public-distribution.md', '../public-distribution.md'],
  ['docs/development.md', 'zh-CN/development.md'],
  ['docs/zh-CN/development.md', '../development.md'],
  ['docs/release.md', 'zh-CN/release.md'],
  ['docs/zh-CN/release.md', '../release.md'],
  ['docs/community.md', 'zh-CN/community.md'],
  ['docs/zh-CN/community.md', '../community.md'],
  ['.agents/skills/argus/README.md', 'README.zh-CN.md'],
  ['.agents/skills/argus/README.zh-CN.md', 'README.md'],
  ['.agents/skills/argus/references/algorithm-io.md', 'algorithm-io.zh-CN.md'],
  ['.agents/skills/argus/references/algorithm-io.zh-CN.md', 'algorithm-io.md'],
  ['.agents/skills/argus/references/api-workflow.md', 'api-workflow.zh-CN.md'],
  ['.agents/skills/argus/references/api-workflow.zh-CN.md', 'api-workflow.md'],
  ['.agents/skills/argus/references/migration-v2.md', 'migration-v2.zh-CN.md'],
  ['.agents/skills/argus/references/migration-v2.zh-CN.md', 'migration-v2.md'],
  ['.agents/skills/argus/references/troubleshooting.md', 'troubleshooting.zh-CN.md'],
  ['.agents/skills/argus/references/troubleshooting.zh-CN.md', 'troubleshooting.md']
];

for (const file of requiredFiles) {
  const path = resolve(root, file);
  try {
    const stat = await lstat(path);
    if (!stat.isFile()) {
      failures.push(`${relative(root, path)} must be a file`);
      continue;
    }

    const text = await readFile(path, 'utf8');
    if (!text.trim()) {
      failures.push(`${relative(root, path)} must not be empty`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      failures.push(`${relative(root, path)} is missing`);
      continue;
    }
    throw error;
  }
}

for (const [file, expectedLink] of languageSwitches) {
  const path = resolve(root, file);
  try {
    const text = await readFile(path, 'utf8');
    if (!text.includes(expectedLink)) {
      failures.push(`${file} must link to ${expectedLink}`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
}

if (failures.length) {
  throw new Error(`docs validation failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
}

console.log('docs validation ok');
