import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const json = args.includes('--json');
const checks = [];
let skill = 'argus';
let blender = 'blender';
let help = false;
const add = (id, status, message, next_step) => checks.push({ id, status, message, ...(next_step ? { next_step } : {}) });

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function runVersion(command) {
  return execFileSync(command, ['--version'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000
  }).trim();
}

try {
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--skill', '--blender', '--json', '--help'].includes(flag) || seen.has(flag)) {
      throw new Error('Invalid or repeated option.');
    }
    seen.add(flag);
    if (flag === '--help') help = true;
    if (flag === '--skill' || flag === '--blender') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('An option value is missing.');
      if (flag === '--skill') skill = value;
      else blender = value;
    }
  }
  if (!['argus', 'realsee-blender-reconstruction'].includes(skill)) {
    skill = null;
    throw new Error('Unsupported skill.');
  }
  if (seen.has('--blender') && skill !== 'realsee-blender-reconstruction') {
    throw new Error('--blender requires --skill realsee-blender-reconstruction.');
  }
} catch (error) {
  add('arguments', 'fail', error.message, 'Use --help for supported options.');
}

const usage = 'node scripts/doctor-local.mjs [--skill argus|realsee-blender-reconstruction] [--json] [--blender <executable>] [--help]';
if (checks.length === 0 && help) {
  add('help', 'pass', usage, '--blender applies only to realsee-blender-reconstruction. Checks are local and do not install or upload anything.');
} else if (checks.length === 0) {
  try {
    const skillRoot = join(root, '.agents', 'skills', skill);
    const present = await exists(join(skillRoot, 'SKILL.md'));
    add('skill', present ? 'pass' : 'fail', present ? 'Canonical SKILL.md exists.' : 'Canonical SKILL.md is missing.', present ? undefined : 'Restore the selected skill from the repository.');
    if (skill === 'realsee-blender-reconstruction') {
      try {
        const match = runVersion(blender).match(/^Blender (\d+\.\d+(?:\.\d+)?)(?:\s|$)/m);
        if (!match) throw new Error('Unrecognized version');
        add('blender', 'pass', `Blender ${match[1]} is available.`);
      } catch {
        add('blender', 'fail', 'Blender could not run or did not report a valid Blender version.', 'Install Blender locally, then use --blender <executable> if it is not on PATH.');
      }
    } else {
      const nodeReady = Number(process.versions.node.split('.')[0]) >= 22;
      add('node', nodeReady ? 'pass' : 'fail', nodeReady ? 'Node satisfies >=22.' : 'Node does not satisfy >=22.', nodeReady ? undefined : 'Install Node >=22 locally.');
      try {
        const match = runVersion('npm').match(/^(\d+)\.\d+\.\d+$/);
        if (!match || Number(match[1]) < 10) throw new Error('Unsupported npm');
        add('npm', 'pass', 'npm satisfies >=10.');
      } catch {
        add('npm', 'fail', 'npm is unavailable or does not satisfy >=10.', 'Install npm >=10 locally.');
      }
      const require = createRequire(join(skillRoot, 'package.json'));
      for (const dependency of ['@aws-sdk/client-s3', '@realsee/universal-uploader', 'ajv', 'yauzl']) {
        try {
          require.resolve(dependency);
          add(`dependency:${dependency}`, 'pass', `${dependency} resolves from the Argus skill.`);
        } catch {
          add(`dependency:${dependency}`, 'fail', `${dependency} cannot be resolved from the Argus skill.`, 'Run npm ci --prefix .agents/skills/argus --omit=dev --ignore-scripts --no-audit --no-fund to install locked runtime dependencies.');
        }
      }
      for (const key of ['REALSEE_APP_KEY', 'REALSEE_APP_SECRET', 'REALSEE_REGION']) {
        const value = process.env[key];
        if (!value?.trim()) {
          add(key, 'warn', `${key} is not configured.`, 'Configure the Argus environment locally using docs/usage.md; do not paste credentials into chat.');
        } else if (key === 'REALSEE_REGION' && !['global', 'cn'].includes(value)) {
          add(key, 'fail', 'REALSEE_REGION must be global or cn.', 'Set REALSEE_REGION locally to global or cn.');
        } else {
          add(key, 'pass', `${key} is configured.`);
        }
      }
      if (checks.some(({ status }) => status === 'warn') && await exists(join(homedir(), '.realsee', 'credentials'))) {
        add('credentials_file', 'warn', 'An existing local credentials file was found; its contents were not read.', 'Load the intended credentials locally into the environment before running this check again.');
      }
    }
  } catch {
    add('local_check', 'fail', 'A local diagnostic could not be completed.', 'Check local file permissions and rerun the diagnostic.');
  }
}

const status = checks.some((check) => check.status === 'fail') ? 'blocked'
  : checks.some((check) => check.status === 'warn') ? 'needs_configuration' : 'ready';
if (json) {
  console.log(JSON.stringify({ schema_version: 1, skill, status, checks }));
} else {
  for (const check of checks) {
    console.log(`${check.status.toUpperCase()}: ${check.message}${check.next_step ? ` Next: ${check.next_step}` : ''}`);
  }
  console.log(`Status: ${status}`);
}
process.exitCode = status === 'blocked' ? 1 : 0;
