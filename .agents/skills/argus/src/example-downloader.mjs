import { mkdtemp, mkdir, lstat, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { downloadFileAtomic } from './downloader.mjs';

const REGIONS = new Set(['cn', 'global']);

export function parseExampleDownloadArgs(argv, { skillDir, allowedRegions = [...REGIONS] }) {
  let region;
  let output;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--region') {
      if (region !== undefined) throw new Error('--region may only be provided once');
      region = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--output') {
      if (output !== undefined) throw new Error('--output may only be provided once');
      output = readValue(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }

  if (!REGIONS.has(region) || !allowedRegions.includes(region)) {
    throw new Error(`--region must be ${allowedRegions.join(' or ')}`);
  }
  if (!output) throw new Error('--output is required');
  if (!isAbsolute(output)) throw new Error('--output must be an absolute directory');

  const outputDir = resolve(output);
  const activeSkillDir = resolve(skillDir);
  if (isWithin(activeSkillDir, outputDir)) {
    throw new Error('--output must be outside the installed skill directory');
  }

  return { region, outputDir };
}

export async function downloadExampleSet({
  manifestPath,
  region,
  outputDir,
  skillDir,
  signal,
  transport
}) {
  if (!REGIONS.has(region)) throw new Error('example region must be cn or global');
  const absoluteOutput = resolve(outputDir);
  const activeSkillDir = resolve(skillDir);
  if (isWithin(activeSkillDir, absoluteOutput)) {
    throw new Error('example output must be outside the installed skill directory');
  }
  if (await exists(absoluteOutput)) {
    throw new Error(`example output already exists: ${absoluteOutput}`);
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const set = manifest.sets?.[region];
  if (
    !set ||
    set.region !== region ||
    !Array.isArray(set.files) ||
    set.count !== set.files.length ||
    set.files.length === 0
  ) {
    throw new Error(`example manifest does not contain a valid ${region} set`);
  }
  validateFiles(set.files);

  const operationOutput = await prepareExternalOutput(absoluteOutput, activeSkillDir);
  const parent = dirname(operationOutput);
  let staging = await mkdtemp(join(parent, `.${basename(absoluteOutput)}.`));
  try {
    for (const file of set.files) {
      await downloadFileAtomic({
        url: file.source_url,
        outputPath: join(staging, file.name),
        expectedBytes: file.bytes,
        expectedSha256: file.sha256,
        signal,
        ...(transport ? { transport } : {})
      });
    }
    await publishVerifiedSet({
      staging,
      outputDir: operationOutput,
      signal
    });
    staging = null;
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
  }

  return {
    region,
    output_dir: absoluteOutput,
    images: set.files.map((file) => join(absoluteOutput, file.name))
  };
}

async function publishVerifiedSet({ staging, outputDir, signal }) {
  signal?.throwIfAborted();
  if (await exists(outputDir)) {
    throw new Error(`example output already exists: ${outputDir}`);
  }
  signal?.throwIfAborted();
  await rename(staging, outputDir);
}

async function prepareExternalOutput(absoluteOutput, skillDir) {
  const requestedParent = dirname(absoluteOutput);
  const existingAncestor = await nearestExistingAncestor(requestedParent);
  const realSkillDir = await realpath(skillDir);
  const realAncestor = await realpath(existingAncestor);
  const parentSuffix = relative(existingAncestor, requestedParent);
  const candidateParent = resolve(realAncestor, parentSuffix);
  const candidateOutput = join(candidateParent, basename(absoluteOutput));

  if (isWithin(realSkillDir, candidateOutput)) {
    throw new Error('example output must be outside the installed skill directory');
  }

  await mkdir(candidateParent, { recursive: true });
  const realParent = await realpath(candidateParent);
  const operationOutput = join(realParent, basename(absoluteOutput));
  if (isWithin(realSkillDir, operationOutput)) {
    throw new Error('example output must be outside the installed skill directory');
  }
  if (await exists(operationOutput)) {
    throw new Error(`example output already exists: ${absoluteOutput}`);
  }
  return operationOutput;
}

async function nearestExistingAncestor(path) {
  let candidate = path;
  while (!(await exists(candidate))) {
    const parent = dirname(candidate);
    if (parent === candidate) throw new Error(`example output parent does not exist: ${path}`);
    candidate = parent;
  }
  return candidate;
}

function isWithin(parent, path) {
  const fromParent = relative(parent, path);
  return !fromParent || (
    !fromParent.startsWith(`..${sep}`) &&
    fromParent !== '..' &&
    !isAbsolute(fromParent)
  );
}

function validateFiles(files) {
  const names = new Set();
  for (const file of files) {
    if (typeof file.name !== 'string' || basename(file.name) !== file.name || !/^pano\d{2}\.jpg$/u.test(file.name)) {
      throw new Error('example manifest contains an unsafe file name');
    }
    if (names.has(file.name)) throw new Error(`example manifest contains duplicate file name: ${file.name}`);
    names.add(file.name);
    if (typeof file.source_url !== 'string') throw new Error(`example manifest is missing source_url for ${file.name}`);
    if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0) {
      throw new Error(`example manifest contains invalid bytes for ${file.name}`);
    }
    if (!/^[a-f0-9]{64}$/u.test(file.sha256)) {
      throw new Error(`example manifest contains invalid SHA-256 for ${file.name}`);
    }
  }
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
