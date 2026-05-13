import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './output.mjs';

export function getWorkspacePaths(workspaceDir) {
  return {
    statePath: join(workspaceDir, 'state.json'),
    resultPath: join(workspaceDir, 'result.json'),
    pidPath: join(workspaceDir, 'background-poll.pid'),
    stdoutLogPath: join(workspaceDir, 'background-poll.stdout.log'),
    stderrLogPath: join(workspaceDir, 'background-poll.stderr.log')
  };
}

export async function readState(workspaceDir) {
  const { statePath } = getWorkspacePaths(workspaceDir);
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

export async function writeState(workspaceDir, partial) {
  const current = await readState(workspaceDir);
  const next = { ...current, ...partial };
  const { statePath } = getWorkspacePaths(workspaceDir);
  await writeJsonAtomic(statePath, next);
  return next;
}

export async function writeResult(workspaceDir, result) {
  const { resultPath } = getWorkspacePaths(workspaceDir);
  await writeJsonAtomic(resultPath, result);
}
