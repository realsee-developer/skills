const args = parseArgs(process.argv.slice(2));
const channel = args.channel ?? 'preview';

if (args.skill !== 'argus') {
  console.error('FAIL: --skill argus is required');
  process.exit(1);
}

if (!['preview', 'stable'].includes(channel)) {
  console.error('FAIL: --channel must be preview or stable');
  process.exit(1);
}

if (!process.env.REALSEE_REGION) {
  console.error('FAIL: REALSEE_REGION is required before any live capability check');
  process.exit(1);
}
if (!['global', 'cn'].includes(process.env.REALSEE_REGION)) {
  console.error('FAIL: REALSEE_REGION must be one of: global, cn');
  process.exit(1);
}
if (!process.env.REALSEE_APP_KEY) {
  console.error('FAIL: REALSEE_APP_KEY is required before any live capability check');
  process.exit(1);
}
if (!process.env.REALSEE_APP_SECRET) {
  console.error('FAIL: REALSEE_APP_SECRET is required before any live capability check');
  process.exit(1);
}

console.log('unable to verify capability: no-side-effect Realsee Argus probe is not implemented');
if (channel === 'stable') {
  console.error('FAIL: stable channel requires a successful no-side-effect live capability probe or owner-confirmed equivalent');
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--skill' || arg === '--channel') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      parsed[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}
