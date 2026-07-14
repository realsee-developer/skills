#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  downloadExampleSet,
  parseExampleDownloadArgs
} from '../src/example-downloader.mjs';
import { redactText, redactUrlForLog } from '../src/sanitizer.mjs';

const skillDir = resolve(import.meta.dirname, '..');
const allowedRegions = ['cn', 'global'];

export async function runExampleDownload(argv, options = {}) {
  const activeSkillDir = options.skillDir ?? skillDir;
  const activeAllowedRegions = options.allowedRegions ?? allowedRegions;
  const { region, outputDir } = parseExampleDownloadArgs(argv, {
    skillDir: activeSkillDir,
    allowedRegions: activeAllowedRegions
  });
  return (options.downloadSet ?? downloadExampleSet)({
    manifestPath: join(activeSkillDir, 'examples', 'manifest.json'),
    region,
    outputDir,
    skillDir: activeSkillDir,
    signal: options.signal
  });
}

async function main() {
  const controller = new AbortController();
  let interruptedSignal;
  const interrupt = (signal) => {
    if (interruptedSignal) return;
    interruptedSignal = signal;
    controller.abort(new Error(`example download interrupted by ${signal}`));
  };
  const onSigint = () => interrupt('SIGINT');
  const onSigterm = () => interrupt('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    const result = await runExampleDownload(process.argv.slice(2), {
      signal: controller.signal
    });
    process.stdout.write(
      `Downloaded ${result.images.length} verified ${result.region} example panoramas to ${result.output_dir}\n`
    );
  } catch (error) {
    const message = redactText(error?.message ?? String(error))
      .replace(/https?:\/\/[^\s]+/gu, (url) => redactUrlForLog(url));
    process.stderr.write(`${message}\n`);
    process.exitCode = interruptedSignal === 'SIGINT'
      ? 130
      : interruptedSignal === 'SIGTERM'
        ? 143
        : 1;
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

if (isCliEntry()) {
  await main();
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
