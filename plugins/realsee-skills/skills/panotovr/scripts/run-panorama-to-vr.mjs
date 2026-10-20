#!/usr/bin/env node
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs, assertValidArgs, usage } from './lib/args.mjs'
import { createUploadZip } from './lib/archive.mjs'
import { getRuntimeConfig } from './lib/config.mjs'
import {
  finalizeWorkspaceDir,
  getAccessToken,
  getUploadToken,
  pollTask,
  submitTask,
  uploadZip,
} from './lib/api.mjs'
import { prepareInput } from './lib/input.mjs'
import { log } from './lib/logger.mjs'
import { ensureWorkspace, readState, writeResult, writeState } from './lib/state.mjs'

let latestWorkspaceDir = null

async function createRunWorkspace(workspaceRoot) {
  const workspaceDir = join(workspaceRoot, `run-${Date.now()}`)
  await mkdir(workspaceRoot, { recursive: true })
  await ensureWorkspace(workspaceDir)
  return workspaceDir
}

async function createFailedRunWorkspace(workspaceRoot) {
  const workspaceDir = join(workspaceRoot, `run-failed-${Date.now()}`)
  await mkdir(workspaceRoot, { recursive: true })
  await ensureWorkspace(workspaceDir)
  return workspaceDir
}

async function resolveFailureWorkspaceDir(args) {
  const workspaceRoot = resolve(args.workspace ?? 'workspace')
  let workspaceDir = latestWorkspaceDir
  if (!workspaceDir && args['task-code']) {
    workspaceDir = join(workspaceRoot, String(args['task-code']))
  }
  if (!workspaceDir) {
    workspaceDir = await createFailedRunWorkspace(workspaceRoot)
  }
  return workspaceDir
}

async function persistFailureArtifacts(args, error) {
  const workspaceDir = await resolveFailureWorkspaceDir(args)
  await ensureWorkspace(workspaceDir)

  // Keep any previously written context and only append the minimum failure snapshot.
  const currentState = await readState(workspaceDir)
  const nextState = await writeState(workspaceDir, {
    workspace_dir: workspaceDir,
    task_code: currentState.task_code ?? args['task-code'] ?? null,
    project_name: currentState.project_name ?? null,
    input_mode: currentState.input_mode ?? null,
    project_id: null,
    vr_url: null,
    last_poll_status: 'error',
    error: error.message,
  })

  const result = {
    status: 'error',
    input_mode: nextState.input_mode ?? null,
    project_name: nextState.project_name ?? null,
    task_code: nextState.task_code ?? null,
    project_id: null,
    vr_url: null,
    workspace_dir: workspaceDir,
    error: error.message,
  }

  await writeResult(workspaceDir, result)
  return result
}

async function runNewWorkflow(runtimeConfig, args) {
  let workspaceDir = await createRunWorkspace(runtimeConfig.workspaceRoot)
  latestWorkspaceDir = workspaceDir
  const prepared = await prepareInput({
    imagesDir: args['images-dir'],
    manifestPath: args.manifest,
    workspaceDir,
    projectNameOverride: args['project-name'],
  })

  await createUploadZip(workspaceDir, prepared.manifest)
  await getAccessToken(runtimeConfig, workspaceDir)
  const uploadToken = await getUploadToken(runtimeConfig, workspaceDir)
  await uploadZip(runtimeConfig, workspaceDir, uploadToken)
  const taskCode = await submitTask(runtimeConfig, workspaceDir, prepared.projectName)
  workspaceDir = await finalizeWorkspaceDir(runtimeConfig.workspaceRoot, workspaceDir, taskCode)
  latestWorkspaceDir = workspaceDir
  await writeState(workspaceDir, {
    workspace_dir: workspaceDir,
    task_code: taskCode,
    project_name: prepared.projectName,
  })

  const polled = await pollTask(runtimeConfig, workspaceDir, taskCode)
  const result = {
    status: polled.status,
    input_mode: prepared.inputMode,
    project_name: prepared.projectName,
    task_code: taskCode,
    project_id: polled.projectId,
    vr_url: polled.vrUrl,
    workspace_dir: workspaceDir,
  }

  await writeResult(workspaceDir, result)
  return result
}

async function resumeWorkflow(runtimeConfig, args) {
  const taskCode = String(args['task-code'])
  const workspaceDir = join(runtimeConfig.workspaceRoot, taskCode)
  await ensureWorkspace(workspaceDir)
  latestWorkspaceDir = workspaceDir

  const state = await readState(workspaceDir)
  await writeState(workspaceDir, {
    workspace_dir: workspaceDir,
    task_code: taskCode,
  })

  await getAccessToken(runtimeConfig, workspaceDir)
  const polled = await pollTask(runtimeConfig, workspaceDir, taskCode)
  const result = {
    status: polled.status,
    input_mode: state.input_mode ?? null,
    project_name: state.project_name ?? null,
    task_code: taskCode,
    project_id: polled.projectId,
    vr_url: polled.vrUrl,
    workspace_dir: workspaceDir,
  }

  await writeResult(workspaceDir, result)
  return result
}

function printSuccess(result, wantsJson) {
  if (wantsJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  process.stdout.write(`Task Code: ${result.task_code}\n`)
  if (result.project_id) {
    process.stdout.write(`Project ID: ${result.project_id}\n`)
  }
  if (result.vr_url) {
    process.stdout.write(`VR URL: ${result.vr_url}\n`)
  }
  process.stdout.write(`Workspace: ${result.workspace_dir}\n`)
}

async function main() {
  process.setMaxListeners(50)
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }

  assertValidArgs(args)
  const runtimeConfig = getRuntimeConfig(args)
  log('START', `Running in region=${runtimeConfig.region} workspace_root=${runtimeConfig.workspaceRoot}`)

  const result = args['task-code']
    ? await resumeWorkflow(runtimeConfig, args)
    : await runNewWorkflow(runtimeConfig, args)

  printSuccess(result, Boolean(args.json))
}

main().catch(async (error) => {
  const args = parseArgs(process.argv.slice(2))
  let result = {
    status: 'error',
    task_code: args['task-code'] ?? null,
    input_mode: null,
    project_name: null,
    project_id: null,
    vr_url: null,
    workspace_dir: latestWorkspaceDir,
    error: error.message,
  }

  try {
    // Failure handling has to mirror the documented output contract for both fresh and resumed runs.
    result = await persistFailureArtifacts(args, error)
  } catch {
    // Ignore secondary write failures.
  }

  process.stderr.write(`${error.message}\n`)
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }
  process.exitCode = 1
})
