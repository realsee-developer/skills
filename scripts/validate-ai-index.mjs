import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');

export async function validateAiIndex(repoRoot) {
  const text = await readFile(join(repoRoot, 'llms.txt'), 'utf8');
  const withoutCode = text.replace(/```[\s\S]*?```/gu, '');
  const links = [...withoutCode.matchAll(/\]\(([^\s)]+)\)/gu)].map((match) => match[1]);
  const paths = new Set(links
    .filter((link) => !/^[a-z][a-z\d+.-]*:/iu.test(link))
    .map((link) => decodeURIComponent(link.split('#')[0]))
    .filter(Boolean));
  const required = ['AGENTS.md', 'docs/install-guides.md', 'docs/usage.md'];
  for (const entry of await readdir(join(repoRoot, '.agents', 'skills'), { withFileTypes: true })) {
    if (entry.isDirectory()) required.push(`.agents/skills/${entry.name}/SKILL.md`);
  }

  const failures = required
    .filter((path) => !paths.has(path))
    .map((path) => `llms.txt must link to ${path}`);
  for (const path of paths) {
    try {
      if (!(await stat(resolve(repoRoot, path))).isFile()) {
        failures.push(`llms.txt link is not a file: ${path}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      failures.push(`llms.txt link does not exist: ${path}`);
    }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = await validateAiIndex(root);
  if (failures.length) throw new Error(`AI index validation failed:\n${failures.join('\n')}`);
  console.log('AI index validation ok');
}
