// argus skill entrypoint.
//
// All orchestration (credential collection, dimension validation, status
// polling, result opening) is described in SKILL.md as agent instructions
// against the Bash tool. This script is the one piece of work the agent
// cannot do via Bash — the Realsee Gateway HMAC auth, signed multipart
// upload, trigger, poll, and download pipeline.
//
// Requires REALSEE_APP_KEY, REALSEE_APP_SECRET, REALSEE_REGION in env.
// Usage:
//   node scripts/run-argus.mjs --image <abs-path> [--type image|panorama] \
//     --workspace <dir> --yes --json [--async]
//   node scripts/run-argus.mjs --resume --workspace <dir> --json
import { main } from '../src/cli.mjs';

main(process.argv.slice(2), {
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  now: () => new Date()
}).catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
