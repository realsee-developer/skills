import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function getWorkspacePaths(workspaceDir) {
  return {
    statePath: join(workspaceDir, 'state.json'),
    resultPath: join(workspaceDir, 'result.json'),
    manifestPath: join(workspaceDir, 'manifest.json'),
    zipPath: join(workspaceDir, 'upload.zip'),
    imagesDir: join(workspaceDir, 'images'),
  }
}

export async function ensureWorkspace(workspaceDir) {
  await mkdir(workspaceDir, { recursive: true })
}

export async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return fallback
  }
}

export async function readState(workspaceDir) {
  const { statePath } = getWorkspacePaths(workspaceDir)
  return readJson(statePath, {})
}

export async function writeState(workspaceDir, patch) {
  const { statePath } = getWorkspacePaths(workspaceDir)
  await ensureWorkspace(workspaceDir)
  const current = await readJson(statePath, {})
  const next = { ...current, ...patch }
  await writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8')
  return next
}

export async function writeResult(workspaceDir, result) {
  const { resultPath } = getWorkspacePaths(workspaceDir)
  await ensureWorkspace(workspaceDir)
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8')
  return resultPath
}
