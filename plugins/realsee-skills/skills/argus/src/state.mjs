import { randomUUID } from 'node:crypto';
import { open, readFile, readdir, rm, stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { writeJsonAtomic } from './output.mjs';

export const STATE_SCHEMA_VERSION = 2;
const DEFAULT_LOCK_WAIT_MS = 30_000;
const DEFAULT_STALE_LOCK_MS = 15 * 60_000;
const UNINITIALIZED_LOCK_GRACE_MS = 1_000;

export function getWorkspacePaths(workspaceDir) {
  return {
    statePath: join(workspaceDir, 'state.json'),
    resultPath: join(workspaceDir, 'result.json'),
    inputZipPath: join(workspaceDir, 'input.zip'),
    inputStagingDir: join(workspaceDir, '.input-staging'),
    outputZipPath: join(workspaceDir, 'output.zip'),
    outputDir: join(workspaceDir, 'output'),
    stateLockPath: join(workspaceDir, '.state.lock'),
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
  return updateState(workspaceDir, (current) => ({ ...current, ...partial }));
}

export async function updateState(workspaceDir, updater) {
  if (typeof updater !== 'function') throw new TypeError('state updater must be a function');
  const paths = getWorkspacePaths(workspaceDir);
  return withLeaseLock(
    paths.stateLockPath,
    async () => {
      const current = (await readJsonIfExists(paths.statePath)) ?? {};
      if (current.schema_version !== undefined && current.schema_version !== STATE_SCHEMA_VERSION) {
        throw new Error(`Cannot overwrite state schema ${String(current.schema_version)}`);
      }
      const updated = await updater(current);
      if (!updated || typeof updated !== 'object' || Array.isArray(updated)) {
        throw new TypeError('state updater must return an object');
      }
      const next = {
        ...updated,
        schema_version: STATE_SCHEMA_VERSION,
        skill: 'argus',
        updated_at: new Date().toISOString()
      };
      assertPersistable(next, 'state.json');
      await writeJsonAtomic(paths.statePath, next);
      return next;
    },
    { contentionMessage: 'Another state update still owns this workspace' }
  );
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
  return withLeaseLock(lockPath, operation, {
    ...options,
    contentionMessage: 'Another collect operation still owns this workspace'
  });
}

async function withLeaseLock(lockPath, operation, options = {}) {
  const waitMs = options.waitMs ?? DEFAULT_LOCK_WAIT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_LOCK_MS;
  const heartbeatMs = options.heartbeatMs ?? Math.max(10, Math.min(5_000, Math.floor(staleMs / 3)));
  const pollMs = options.pollMs ?? 25;
  const startedAt = Date.now();
  const owner = {
    owner_token: randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    created_at: new Date().toISOString()
  };
  let handle;

  while (!handle) {
    try {
      handle = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const observation = await observeLock(lockPath);
      if (observation && isStale(observation, staleMs) && await recoverStaleLock(lockPath, observation, staleMs)) {
        continue;
      }
      if (Date.now() - startedAt >= waitMs) {
        throw new Error(options.contentionMessage ?? 'Another operation still owns this workspace');
      }
      await sleep(pollMs);
    }
  }

  try {
    await handle.writeFile(`${JSON.stringify(owner)}\n`);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await removeLockIfOwned(lockPath, owner.owner_token).catch(() => {});
    throw error;
  }

  const stopHeartbeat = startHeartbeat(lockPath, handle, owner.owner_token, heartbeatMs);
  try {
    return await operation();
  } finally {
    await stopHeartbeat();
    await handle.close().catch(() => {});
    await removeLockIfOwned(lockPath, owner.owner_token).catch(() => {});
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

async function observeLock(path) {
  try {
    const raw = await readFile(path, 'utf8');
    const metadata = await stat(path);
    let owner = null;
    try {
      owner = JSON.parse(raw);
    } catch {
      // A process can observe the lock between open('wx') and the owner write.
    }
    return { raw, owner, mtimeMs: metadata.mtimeMs };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function isStale(observation, staleMs) {
  const threshold = observation.owner
    ? staleMs
    : Math.max(staleMs, UNINITIALIZED_LOCK_GRACE_MS);
  if (Date.now() - observation.mtimeMs <= threshold) return false;
  return !isLocalOwnerAlive(observation.owner);
}

function isLocalOwnerAlive(owner) {
  if (
    (owner?.hostname && owner.hostname !== hostname()) ||
    !Number.isSafeInteger(owner?.pid) ||
    owner.pid <= 0
  ) {
    return false;
  }
  try {
    process.kill(owner.pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

async function recoverStaleLock(lockPath, observation, staleMs) {
  const claim = await acquireRecoveryClaim(lockPath, observation, staleMs);
  if (!claim) return false;
  try {
    const current = await observeLock(lockPath);
    if (
      current &&
      current.raw === observation.raw &&
      current.mtimeMs === observation.mtimeMs &&
      isStale(current, staleMs)
    ) {
      await rm(lockPath, { force: true });
    }
    return true;
  } finally {
    await completeRecoveryClaim(claim);
  }
}

async function acquireRecoveryClaim(lockPath, observation, staleMs) {
  const current = await observeLock(lockPath);
  if (
    !current ||
    current.raw !== observation.raw ||
    current.mtimeMs !== observation.mtimeMs ||
    !isStale(current, staleMs)
  ) {
    return null;
  }

  for (;;) {
    const latest = await latestRecoveryClaim(lockPath);
    if (latest && !latest.completed && !isStale(latest.observation, staleMs)) return null;
    const epoch = (latest?.epoch ?? 0) + 1;
    const claimPath = recoveryClaimPath(lockPath, epoch);
    let handle;
    try {
      handle = await open(claimPath, 'wx', 0o600);
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      throw error;
    }

    const owner = {
      owner_token: randomUUID(),
      pid: process.pid,
      hostname: hostname(),
      created_at: new Date().toISOString(),
      epoch
    };
    try {
      await handle.writeFile(`${JSON.stringify(owner)}\n`);
      await handle.sync();
      return { path: claimPath, handle, owner };
    } catch (error) {
      await handle.close().catch(() => {});
      await markRecoveryClaimCompleted(claimPath, owner.owner_token).catch(() => {});
      throw error;
    }
  }
}

async function latestRecoveryClaim(lockPath) {
  const directory = dirname(lockPath);
  const prefix = `${basename(lockPath)}.recovery-`;
  const entries = await readdir(directory, { withFileTypes: true });
  const epochs = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && !entry.name.endsWith('.done'))
    .map((entry) => Number(entry.name.slice(prefix.length)))
    .filter((epoch) => Number.isSafeInteger(epoch) && epoch > 0)
    .sort((left, right) => right - left);

  for (const epoch of epochs) {
    const path = recoveryClaimPath(lockPath, epoch);
    const observation = await observeLock(path);
    if (!observation) continue;
    return {
      epoch,
      path,
      observation,
      completed: await fileExists(`${path}.done`)
    };
  }
  return null;
}

function recoveryClaimPath(lockPath, epoch) {
  return `${lockPath}.recovery-${String(epoch).padStart(12, '0')}`;
}

async function completeRecoveryClaim(claim) {
  try {
    await markRecoveryClaimCompleted(claim.path, claim.owner.owner_token);
  } finally {
    await claim.handle.close().catch(() => {});
  }
}

async function markRecoveryClaimCompleted(claimPath, ownerToken) {
  const donePath = `${claimPath}.done`;
  let handle;
  try {
    handle = await open(donePath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') return;
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify({ owner_token: ownerToken, completed_at: new Date().toISOString() })}\n`);
    await handle.sync();
  } finally {
    await handle.close().catch(() => {});
  }
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function removeLockIfOwned(path, ownerToken) {
  const current = await observeLock(path);
  if (!current || current.owner?.owner_token !== ownerToken) return false;
  await rm(path, { force: true });
  return true;
}

function startHeartbeat(lockPath, handle, ownerToken, heartbeatMs) {
  let stopped = false;
  let timer = null;
  let inFlight = Promise.resolve();

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      inFlight = (async () => {
        const current = await observeLock(lockPath);
        if (!current || current.owner?.owner_token !== ownerToken) {
          stopped = true;
          return;
        }
        const now = new Date();
        await handle.utimes(now, now);
      })()
        .catch(() => {
          stopped = true;
        })
        .finally(schedule);
    }, heartbeatMs);
    timer.unref?.();
  };

  schedule();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await inFlight.catch(() => {});
  };
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
