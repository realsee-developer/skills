// One-shot local setup: install repo + skill deps, sync the Claude plugin,
// and run the local doctor. Designed to be safe to re-run.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const steps = [
  { name: 'install repository deps', cmd: 'npm', args: ['install'], cwd: root },
  { name: 'install skill deps', cmd: 'npm', args: ['install'], cwd: resolve(root, '.agents/skills/argus') },
  { name: 'sync claude plugin', cmd: 'npm', args: ['run', 'sync:claude-plugin'], cwd: root },
  { name: 'check claude sync', cmd: 'npm', args: ['run', 'check:claude-sync'], cwd: root },
  { name: 'doctor', cmd: 'npm', args: ['run', 'doctor:local'], cwd: root }
];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const child = spawnSync(step.cmd, step.args, { cwd: step.cwd, stdio: 'inherit' });
  if (child.status !== 0) {
    console.error(`\nbootstrap failed at: ${step.name}`);
    process.exit(child.status ?? 1);
  }
}

console.log('\nbootstrap ok. Next:');
console.log('  - export REALSEE_APP_KEY, REALSEE_APP_SECRET, REALSEE_REGION');
console.log('  - npm run ci   (full repository validation)');
console.log('  - See docs/install-guides.md for host-specific install paths.');
