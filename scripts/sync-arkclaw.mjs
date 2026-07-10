import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { applyArkclawOverlay, ARKCLAW_ENTRYPOINT } from './arkclaw-overlay.mjs';
import { copyDistributionFiles } from './distribution-files.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const sourceRoot = join(repoRoot, '.agents', 'skills', 'argus');
const targetRoot = join(repoRoot, 'arkclaw', 'argus');
const expectedTarget = join(repoRoot, 'arkclaw', 'argus');

export async function syncArkclaw(options = {}) {
  const activeRepoRoot = options.repoRoot ?? repoRoot;
  const activeSourceRoot = options.sourceRoot ?? sourceRoot;
  const activeTargetRoot = options.targetRoot ?? targetRoot;
  const activeExpectedTarget = options.expectedTarget ?? expectedTarget;

  if (activeTargetRoot !== activeExpectedTarget) {
    throw new Error(`refusing to replace unexpected Arkclaw target: ${activeTargetRoot}`);
  }

  await rm(activeTargetRoot, { recursive: true, force: true });
  await copyDistributionFiles({
    repoRoot: activeRepoRoot,
    sourceRoot: activeSourceRoot,
    targetRoot: activeTargetRoot
  });

  const entrypoint = join(activeTargetRoot, ARKCLAW_ENTRYPOINT);
  const original = await readFile(entrypoint, 'utf8');
  await writeFile(entrypoint, applyArkclawOverlay(original, ARKCLAW_ENTRYPOINT));

  console.log(
    `synced canonical argus skill to ${relative(activeRepoRoot, activeTargetRoot)} with CN-only entrypoint overlay`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncArkclaw();
}
