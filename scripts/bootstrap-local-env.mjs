// Maintainer setup: install locked Argus dependencies, rebuild distributions,
// and check local Argus prerequisites.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const steps = [
  { name: 'install locked Argus deps', cmd: 'npm', args: ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], cwd: resolve(root, '.agents/skills/argus') },
  { name: 'rebuild distributions', cmd: 'npm', args: ['run', 'rebuild'], cwd: root },
  { name: 'doctor', cmd: 'npm', args: ['run', 'doctor:local'], cwd: root }
];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const child = spawnSync(step.cmd, step.args, { cwd: step.cwd, stdio: 'inherit' });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    console.error(`\nbootstrap failed at: ${step.name}`);
    process.exit(child.status ?? 1);
  }
}

console.log('\nbootstrap ok. Next:');
console.log('  - Configure credentials locally only when running Argus; see docs/usage.md.');
console.log('  - npm run ci   (full repository validation)');
console.log('  - See docs/install-guides.md for host-specific install paths.');
