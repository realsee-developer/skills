#!/usr/bin/env node
import { checkArgusLocal } from '../src/local-check.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
let report;
if (args.some((arg) => !['--help', '--json'].includes(arg)) || new Set(args).size !== args.length) {
  report = {
    schema_version: 1, skill: 'argus', status: 'blocked',
    checks: [{ id: 'arguments', status: 'fail', message: 'Invalid or repeated option.', next_step: 'Use --help for supported options.' }]
  };
} else if (args.includes('--help')) {
  report = {
    schema_version: 1, skill: 'argus', status: 'ready',
    checks: [{ id: 'help', status: 'pass', message: 'node <skillDir>/scripts/check-local.mjs [--json] [--help]',
      next_step: 'Checks local prerequisites only. Does not read credential values from files, install packages, contact services, or upload data.' }]
  };
} else {
  report = await checkArgusLocal({
    env: { ...process.env, REALSEE_REGION: 'cn' },
  });
}

if (json) {
  console.log(JSON.stringify(report));
} else {
  for (const check of report.checks) {
    console.log(`${check.status.toUpperCase()}: ${check.message}${check.next_step ? ` Next: ${check.next_step}` : ''}`);
  }
  console.log(`Status: ${report.status}`);
}
process.exitCode = report.status === 'blocked' ? 1 : 0;
