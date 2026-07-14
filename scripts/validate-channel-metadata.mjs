import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const metadataPath = join(root, 'release-channel.json');
const rootPackagePath = join(root, 'package.json');
const skillPackagePath = join(root, '.agents', 'skills', 'argus', 'package.json');
const allowedChannels = new Set(['development', 'preview', 'stable']);
const requiredRegions = ['global', 'cn'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const rootPackage = JSON.parse(await readFile(rootPackagePath, 'utf8'));
const skillPackage = JSON.parse(await readFile(skillPackagePath, 'utf8'));
assert(metadata && typeof metadata === 'object' && !Array.isArray(metadata), 'release-channel.json must be an object');
assert(metadata.repo === 'realsee-skills', 'repo must be realsee-skills');
assert(typeof metadata.version === 'string' && metadata.version.length > 0, 'version must be a non-empty string');
assert(rootPackage.version === metadata.version, 'root package version must match release-channel.json');
assert(skillPackage.version === metadata.version, 'argus package version must match release-channel.json');
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
assert(skill.legacy_release === 'v1.0.2', 'skills.argus.legacy_release must remain v1.0.2');
const isStable = metadata.channel === 'stable' || skill.state === 'stable';
if (isStable) {
  assert(metadata.channel === 'stable', 'stable metadata requires channel=stable');
  assert(skill.state === 'stable', 'stable metadata requires state=stable');
  assert(skill.stable_gate === 'passed', 'stable metadata requires stable_gate=passed');
  assert(
    skill.next_release_candidate === undefined,
    'stable metadata must not declare skills.argus.next_release_candidate'
  );
} else {
  assert(
    new RegExp(`^v${metadata.version.replaceAll('.', '\\.')}-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*$`, 'u')
      .test(skill.next_release_candidate),
    'skills.argus.next_release_candidate must be a prerelease tag for metadata.version'
  );
}

console.log('channel metadata validation ok');
