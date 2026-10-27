import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseConfig, REGION_GATEWAY_BASE_URLS } from './config.mjs';

const installedSkillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencies = ['@aws-sdk/client-s3', '@realsee/universal-uploader', 'ajv', 'yauzl'];

// Only local metadata and environment presence are inspected. In particular,
// this module never reads or executes the user's credentials file.
export async function checkArgusLocal({ skillDir = installedSkillDir, env = process.env } = {}) {
  const checks = [];
  const add = (id, status, message, next_step) => checks.push({
    id, status, message, ...(next_step ? { next_step } : {})
  });
  let skillVersion;

  try {
    const present = await isFile(join(skillDir, 'SKILL.md'));
    add('skill', present ? 'pass' : 'fail', present ? 'SKILL.md exists.' : 'SKILL.md is missing.',
      present ? undefined : 'Reinstall the complete Argus skill package.');
    try {
      const pkg = JSON.parse(await readFile(join(skillDir, 'package.json'), 'utf8'));
      if (pkg.name !== '@realsee/argus-skill' || typeof pkg.version !== 'string' ||
          !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pkg.version)) {
        throw new Error('Invalid skill metadata');
      }
      skillVersion = pkg.version;
      add('skill_version', 'pass', `Argus ${skillVersion} is installed.`);
    } catch {
      add('skill_version', 'fail', 'Argus package metadata is missing or invalid.',
        'Reinstall the complete Argus skill package.');
    }

    const nodeReady = Number(process.versions.node.split('.')[0]) >= 22;
    add('node', nodeReady ? 'pass' : 'fail', nodeReady ? 'Node satisfies >=22.' : 'Node does not satisfy >=22.',
      nodeReady ? undefined : 'Install Node >=22 locally.');
    try {
      const version = execFileSync('npm', ['--version'], {
        env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000
      }).trim();
      const match = version.match(/^(\d+)\.\d+\.\d+$/);
      if (!match || Number(match[1]) < 10) throw new Error('Unsupported npm');
      add('npm', 'pass', 'npm satisfies >=10.');
    } catch {
      add('npm', 'fail', 'npm is unavailable or does not satisfy >=10.', 'Install npm >=10 locally.');
    }

    const require = createRequire(join(resolve(skillDir), 'package.json'));
    for (const dependency of dependencies) {
      try {
        require.resolve(dependency);
        add(`dependency:${dependency}`, 'pass', `${dependency} resolves from the Argus skill.`);
      } catch {
        add(`dependency:${dependency}`, 'fail', `${dependency} cannot be resolved from the Argus skill.`,
          'Run npm ci --omit=dev --ignore-scripts --no-audit --no-fund in the installed Argus skill directory.');
      }
    }

    const regions = Object.keys(REGION_GATEWAY_BASE_URLS);
    const credentialKeys = ['REALSEE_APP_KEY', 'REALSEE_APP_SECRET', 'REALSEE_REGION'];
    for (const key of credentialKeys) {
      const value = env[key];
      if (!value?.trim()) {
        add(key, 'warn', `${key} is not configured.`,
          'Configure the Argus environment locally using SKILL.md; do not paste credentials into chat.');
      } else if (key === 'REALSEE_REGION' && !regions.includes(value)) {
        add(key, 'fail', `REALSEE_REGION must be ${regions.join(' or ')}.`,
          `Set REALSEE_REGION locally to ${regions.join(' or ')}.`);
      } else {
        add(key, 'pass', `${key} is configured.`);
      }
    }
    if (credentialKeys.every((key) => checks.find((check) => check.id === key)?.status === 'pass')) {
      try {
        parseConfig({ env });
      } catch {
        add('configuration', 'fail', 'The runtime rejects the environment configuration.',
          'Remove deprecated ARGUS_* configuration and follow the REALSEE_* configuration in SKILL.md.');
      }
    }
    if (checks.some(({ status }) => status === 'warn') && await isFile(join(homedir(), '.realsee', 'credentials'))) {
      add('credentials_file', 'warn', 'An existing local credentials file was found; its contents were not read.',
        'Load the intended credentials locally into the environment using SKILL.md, then run this check again.');
    }
  } catch {
    add('local_check', 'fail', 'A local diagnostic could not be completed.',
      'Check local file permissions and rerun the diagnostic.');
  }

  const status = checks.some((check) => check.status === 'fail') ? 'blocked'
    : checks.some((check) => check.status === 'warn') ? 'needs_configuration' : 'ready';
  return { schema_version: 1, skill: 'argus', ...(skillVersion ? { skill_version: skillVersion } : {}), status, checks };
}

async function isFile(path) {
  try { return (await stat(path)).isFile(); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
