import { open, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './output.mjs';

export const STATE_SCHEMA_VERSION = 2;
const DEFAULT_LOCK_WAIT_MS = 30_000;
const DEFAULT_STALE_LOCK_MS = 15 * 60_000;

export function getWorkspacePaths(workspaceDir) {
  return {
    statePath: join(workspaceDir, 'state.json'),
    resultPath: join(workspaceDir, 'result.json'),
    inputZipPath: join(workspaceDir, 'input.zip'),
    inputStagingDir: join(workspaceDir, '.input-staging'),
    outputZipPath: join(workspaceDir, 'output.zip'),
    outputDir: join(workspaceDir, 'output'),
    collectLockPath: join(workspaceDir, '.collect.lock')
  };
}

export async function readState(workspaceDir) {
  const state = await readJsonIfExists(getWorkspacePaths(workspaceDir).statePath);
  if (!state) return null;
  if (state.schema_version !== STATE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Argus state schema ${String(state.schema_version)}; v2 does not migrate v1 workspaces`
    );
  }
  return state;
}

export async function writeState(workspaceDir, partial) {
  const current = (await readJsonIfExists(getWorkspacePaths(workspaceDir).statePath)) ?? {};
  if (current.schema_version !== undefined && current.schema_version !== STATE_SCHEMA_VERSION) {
    throw new Error(`Cannot overwrite state schema ${String(current.schema_version)}`);
  }
  const next = {
    ...current,
    ...partial,
    schema_version: STATE_SCHEMA_VERSION,
    skill: 'argus',
    updated_at: new Date().toISOString()
  };
  assertPersistable(next, 'state.json');
  await writeJsonAtomic(getWorkspacePaths(workspaceDir).statePath, next);
  return next;
}

export async function readResult(workspaceDir) {
  return readJsonIfExists(getWorkspacePaths(workspaceDir).resultPath);
}

export async function writeResult(workspaceDir, result) {
  const next = {
    ...result,
    schema_version: STATE_SCHEMA_VERSION,
    skill: 'argus'
  };
  assertPersistable(next, 'result.json');
  await writeJsonAtomic(getWorkspacePaths(workspaceDir).resultPath, next);
  return next;
}

export async function withWorkspaceLock(workspaceDir, operation, options = {}) {
  const lockPath = getWorkspacePaths(workspaceDir).collectLockPath;
  const waitMs = options.waitMs ?? DEFAULT_LOCK_WAIT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_LOCK_MS;
  const startedAt = Date.now();
  let handle;

  while (!handle) {
    try {
      handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() })}\n`);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (await isStale(lockPath, staleMs)) {
        await rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() - startedAt >= waitMs) {
        throw new Error('Another collect operation still owns this workspace');
      }
      await sleep(25);
    }
  }

  try {
    return await operation();
  } finally {
    await handle.close().catch(() => {});
    await rm(lockPath, { force: true });
  }
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function isStale(path, staleMs) {
  try {
    return Date.now() - (await stat(path)).mtimeMs > staleMs;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function assertPersistable(value, filename) {
  const forbidden = /(?:access[_-]?token|session[_-]?token|secret|authorization|presigned[_-]?url|output[_-]?url|result[_-]?url)/i;
  const visit = (item, path = '') => {
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      const childPath = path ? `${path}.${key}` : key;
      if (forbidden.test(key)) {
        throw new Error(`${filename} may not persist sensitive field ${childPath}`);
      }
      visit(child, childPath);
    }
  };
  visit(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
