import { openAsBlob } from 'node:fs'
import { createRequire } from 'node:module'
import { rename } from 'node:fs/promises'
import { join } from 'node:path'
import { log, logDetail, maskSensitive } from './logger.mjs'
import { getWorkspacePaths, readState, writeState } from './state.mjs'

const require = createRequire(import.meta.url)
const uploaderPkg = require('@realsee/universal-uploader')
const { Uploader } = uploaderPkg
const tokenCache = new Map()

function parseJsonSafely(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function summarizeErrorPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ''
  }

  const masked = maskSensitive(payload)
  const summary = {}

  for (const key of ['code', 'business_code', 'status', 'message', 'error', 'request_id', 'trace_id']) {
    if (masked[key] != null) {
      summary[key] = masked[key]
    }
  }

  return Object.keys(summary).length > 0
    ? `: ${JSON.stringify(summary)}`
    : ''
}

async function apiFetch(step, method, url, { headers = {}, body, bodyType } = {}) {
  const requestLog = { method, url, headers: { ...headers } }
  if (requestLog.headers.Authorization) {
    requestLog.headers.Authorization = `${String(requestLog.headers.Authorization).slice(0, 10)}***`
  }
  if (body) {
    requestLog.body = bodyType === 'form'
      ? Object.fromEntries(new URLSearchParams(body))
      : JSON.parse(body)
  }

  logDetail(step, 'request', requestLog)
  const response = await fetch(url, { method, headers, body })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const errorPayload = parseJsonSafely(text)
    if (errorPayload) {
      logDetail(step, 'error_response', errorPayload)
    }
    const snippet = summarizeErrorPayload(errorPayload)
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${method} ${url}${snippet}`)
  }
  const json = await response.json()
  logDetail(step, 'response', maskSensitive(json))
  return json
}

export async function getAccessToken(runtimeConfig, workspaceDir) {
  const json = await apiFetch('AUTH', 'POST', `${runtimeConfig.baseUrl}/auth/access_token`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      app_key: runtimeConfig.appKey,
      app_secret: runtimeConfig.appSecret,
    }),
    bodyType: 'form',
  })

  if (json.code !== 0) {
    throw new Error(`Failed to obtain access_token: ${json.status}`)
  }

  const token = json.data.access_token
  tokenCache.set(workspaceDir, {
    accessToken: token,
    expireAt: Number(json.data.expire_at),
  })

  return token
}

export async function getValidToken(runtimeConfig, workspaceDir) {
  const cached = tokenCache.get(workspaceDir)
  if (cached && (cached.expireAt * 1000) - Date.now() > 10_000) {
    return cached.accessToken
  }
  return getAccessToken(runtimeConfig, workspaceDir)
}

export async function getUploadToken(runtimeConfig, workspaceDir) {
  const accessToken = await getValidToken(runtimeConfig, workspaceDir)
  const json = await apiFetch('UPLOAD_TOKEN', 'GET', `${runtimeConfig.baseUrl}/open/v1/pano/file/token`, {
    headers: { Authorization: accessToken },
  })

  if (json.code !== 0) {
    throw new Error(`Failed to get upload token: ${json.status}`)
  }

  await writeState(workspaceDir, {
    upload_token_bucket: json.data.bucket,
    upload_token_region: json.data.region,
    upload_token_prefix: json.data.prefix,
  })

  return json.data
}

function resolveAdaptor(moduleName, exportName) {
  const module = require(moduleName)
  return module[exportName] ?? module.default ?? module
}

function getAdaptor(region) {
  if (region === 'cn') {
    return resolveAdaptor('@realsee/universal-uploader/adaptors/cos-node', 'CosNodeAdaptor')
  }
  return resolveAdaptor('@realsee/universal-uploader/adaptors/aws', 'AwsAdaptor')
}

export async function uploadZip(runtimeConfig, workspaceDir, uploadToken) {
  const adaptor = getAdaptor(runtimeConfig.region)
  const { zipPath } = getWorkspacePaths(workspaceDir)
  const uploadKey = `panotovr-${Date.now()}.zip`
  const blob = await openAsBlob(zipPath, { type: 'application/zip' })
  const uploader = new Uploader(adaptor, { getToken: () => uploadToken })

  log('UPLOAD', `Uploading ${zipPath} as ${uploadKey}`)

  const result = await uploader.upload(uploadKey, blob, {
    onProgress: ({ percentage, transferredParts, totalParts }) => {
      log('UPLOAD', `Progress ${(percentage * 100).toFixed(0)}% (${transferredParts}/${totalParts})`)
    },
  })

  await writeState(workspaceDir, {
    upload_path: result.path,
    download_url: result.download_url,
    upload_key: uploadKey,
  })

  return result
}

export async function submitTask(runtimeConfig, workspaceDir, projectName) {
  const accessToken = await getValidToken(runtimeConfig, workspaceDir)
  const state = await readState(workspaceDir)
  const body = { project_name: projectName }

  if (state.download_url) {
    body.zip_cos_url = state.download_url
  } else if (state.upload_path) {
    body.private_cos_key = state.upload_path
  } else {
    throw new Error('Missing upload output before submit')
  }

  const json = await apiFetch('SUBMIT', 'POST', `${runtimeConfig.baseUrl}/open/v1/pano/task/submit`, {
    headers: {
      Authorization: accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (json.code !== 0) {
    throw new Error(`Failed to submit task: ${json.status}`)
  }

  const taskCode = json.data.task_code
  await writeState(workspaceDir, { task_code: taskCode })
  return taskCode
}

export async function finalizeWorkspaceDir(workspaceRoot, workspaceDir, taskCode) {
  const finalWorkspaceDir = join(workspaceRoot, taskCode)
  if (finalWorkspaceDir === workspaceDir) {
    return finalWorkspaceDir
  }

  await rename(workspaceDir, finalWorkspaceDir)
  return finalWorkspaceDir
}

export async function pollTask(runtimeConfig, workspaceDir, taskCode) {
  for (let attempt = 1; attempt <= runtimeConfig.pollMaxAttempts; attempt += 1) {
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, runtimeConfig.pollIntervalMs))
    }

    let accessToken = await getValidToken(runtimeConfig, workspaceDir)
    let json = await apiFetch(
      'POLL',
      'GET',
      `${runtimeConfig.baseUrl}/open/v1/pano/task/status?task_code=${encodeURIComponent(taskCode)}`,
      { headers: { Authorization: accessToken } }
    )

    if (json.code === -3 || String(json.status ?? '').toLowerCase().includes('expired')) {
      accessToken = await getAccessToken(runtimeConfig, workspaceDir)
      json = await apiFetch(
        'POLL',
        'GET',
        `${runtimeConfig.baseUrl}/open/v1/pano/task/status?task_code=${encodeURIComponent(taskCode)}`,
        { headers: { Authorization: accessToken } }
      )
    }

    if (json.code !== 0) {
      throw new Error(`Task status query failed: ${json.status}`)
    }

    const taskStatus = String(json.data?.status ?? '').toLowerCase()
    await writeState(workspaceDir, {
      task_code: taskCode,
      last_poll_status: json.data?.status,
      project_id: json.data?.project_id ?? null,
      vr_url: json.data?.vr_url || json.data?.view_url || json.data?.url || null,
    })

    log('POLL', `Attempt ${attempt}/${runtimeConfig.pollMaxAttempts}: status=${json.data?.status ?? 'unknown'}`)

    if (/success|complete|done/.test(taskStatus)) {
      return {
        status: 'success',
        projectId: json.data?.project_id ?? null,
        vrUrl: json.data?.vr_url || json.data?.view_url || json.data?.url || null,
        rawStatus: json.data?.status ?? null,
      }
    }

    if (/fail|error/.test(taskStatus)) {
      return {
        status: 'error',
        projectId: json.data?.project_id ?? null,
        vrUrl: null,
        rawStatus: json.data?.status ?? null,
        details: json.data,
      }
    }
  }

  throw new Error(`Polling timed out after ${runtimeConfig.pollMaxAttempts} attempts`)
}
