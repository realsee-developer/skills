import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const metadataPath = join(root, 'release-channel.json');
const allowedChannels = new Set(['development', 'preview', 'stable']);
const requiredRegions = ['global', 'cn'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
assert(metadata && typeof metadata === 'object' && !Array.isArray(metadata), 'release-channel.json must be an object');
assert(metadata.repo === 'realsee-skills', 'repo must be realsee-skills');
assert(typeof metadata.version === 'string' && metadata.version.length > 0, 'version must be a non-empty string');
assert(allowedChannels.has(metadata.channel), 'channel must be one of: development, preview, stable');
assert(metadata.skills && typeof metadata.skills === 'object', 'skills must be an object');

const skill = metadata.skills['argus'];
assert(skill && typeof skill === 'object' && !Array.isArray(skill), 'skills.argus must exist');
assert(typeof skill.state === 'string' && skill.state.length > 0, 'skills.argus.state must exist');
assert(skill.codex_skill_id === 'argus', 'codex skill id must be argus');
assert(skill.claude_skill_id === 'argus', 'claude skill id must be argus');
assert(skill.claude_plugin === 'realsee-skills', 'claude plugin id must be realsee-skills');
assert(Array.isArray(skill.regions), 'skills.argus.regions must be an array');
for (const region of requiredRegions) {
  assert(skill.regions.includes(region), `skills.argus.regions must include ${region}`);
}

console.log('channel metadata validation ok');
