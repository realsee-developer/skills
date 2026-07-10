#!/usr/bin/env node
import { main } from '../src/cli.mjs';
import { redactText, redactUrlForLog } from '../src/sanitizer.mjs';

try {
  const result = await main(process.argv.slice(2), {
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    now: () => new Date()
  });
  if (result?.result_status === 'error') process.exitCode = 2;
} catch (error) {
  const code = error?.code ? `[${error.code}] ` : '';
  const workspace = error?.workspaceDir ? `\nWorkspace: ${error.workspaceDir}` : '';
  const message = redactText(error?.message ?? String(error))
    .replace(/https?:\/\/[^\s]+/gu, (url) => redactUrlForLog(url));
  process.stderr.write(`${code}${message}${workspace}\n`);
  process.exitCode = 1;
}
