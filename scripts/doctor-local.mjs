import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const skillRoot = join(root, '.agents', 'skills', 'argus');
const checks = [];

function pass(message) {
  checks.push({ level: 'PASS', message });
}

function warn(message) {
  checks.push({ level: 'WARN', message });
}

function fail(message) {
  checks.push({ level: 'FAIL', message });
}

function major(version) {
  const match = String(version).match(/^v?(\d+)/);
  return match ? Number(match[1]) : NaN;
}

async function exists(path) {
  try {
    const { lstat } = await import('node:fs/promises');
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

const nodeMajor = major(process.versions.node);
if (nodeMajor >= 22) {
  pass(`Node ${process.versions.node} satisfies >=22`);
} else {
  fail(`Node ${process.versions.node} does not satisfy >=22`);
}

try {
  const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (major(npmVersion) >= 10) {
    pass(`npm ${npmVersion} satisfies >=10`);
  } else {
    fail(`npm ${npmVersion} does not satisfy >=10`);
  }
} catch {
  warn('npm is not available; skipping npm version check');
}

for (const [path, label] of [
  [skillRoot, 'canonical Skill directory'],
  [join(root, 'package.json'), 'repo package.json'],
  [join(skillRoot, 'package.json'), 'skill package.json'],
  [join(skillRoot, 'SKILL.md'), 'SKILL.md'],
  [join(skillRoot, 'README.md'), 'README.md']
]) {
  if (await exists(path)) pass(`${label} exists`);
  else fail(`${label} is missing`);
}

if (process.env.REALSEE_REGION === undefined || process.env.REALSEE_REGION === '') {
  warn('REALSEE_REGION is not set; set global or cn before live usage');
} else if (!['global', 'cn'].includes(process.env.REALSEE_REGION)) {
  fail('REALSEE_REGION must be one of: global, cn');
} else {
  pass(`REALSEE_REGION=${process.env.REALSEE_REGION}`);
}

if (!process.env.REALSEE_APP_KEY) {
  warn('REALSEE_APP_KEY is not set; live usage will fail');
}
if (!process.env.REALSEE_APP_SECRET) {
  warn('REALSEE_APP_SECRET is not set; live usage will fail');
}

let tempDir;
try {
  const repoTmp = join(root, 'tmp');
  await mkdir(repoTmp, { recursive: true });
  tempDir = await mkdtemp(join(repoTmp, 'doctor-local-write-check-'));
  await writeFile(join(tempDir, 'write-check.txt'), 'ok\n');
  pass('workspace writability check passed via repo tmp');
} catch (error) {
  fail(`workspace writability check failed: repo tmp is not writable: ${error.message}`);
} finally {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
}

for (const check of checks) {
  console.log(`${check.level}: ${check.message}`);
}

if (checks.some((check) => check.level === 'FAIL')) {
  process.exit(1);
}
