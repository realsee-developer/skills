import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { Jimp } from 'jimp'
import { formatDateStamp, SUPPORTED_IMAGE_EXTENSIONS } from './constants.mjs'
import { log } from './logger.mjs'
import { getWorkspacePaths, writeState } from './state.mjs'

function isSupportedImage(filename) {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(extname(filename).toLowerCase())
}

async function listSupportedImages(imagesDir) {
  const entries = await readdir(imagesDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && isSupportedImage(entry.name))
    .map((entry) => resolve(imagesDir, entry.name))
    .sort()
}

async function normalizeImageToJpeg(sourcePath, targetPath) {
  const extension = extname(sourcePath).toLowerCase()
  if (extension === '.jpg') {
    await copyFile(sourcePath, targetPath)
    return
  }
  if (extension === '.jpeg') {
    await copyFile(sourcePath, targetPath)
    return
  }

  const image = await Jimp.read(sourcePath)
  await image.write(targetPath)
}

function resolveProjectName(manifestProjectName, override) {
  const timestamp = Date.now()
  const candidate = override || manifestProjectName || `panotovr-${timestamp}`
  return candidate.replace('{{timestamp}}', String(timestamp))
}

async function findImageById(imagesDir, id) {
  for (const extension of SUPPORTED_IMAGE_EXTENSIONS) {
    const candidate = join(imagesDir, `${id}${extension}`)
    try {
      await readFile(candidate)
      return candidate
    } catch {
      // Continue.
    }
  }
  throw new Error(`Image file not found for manifest id "${id}" in ${imagesDir}`)
}

function validateManifestShape(manifest) {
  for (const field of ['version', 'project_name', 'floor_map', 'scan_list']) {
    if (manifest[field] == null) {
      throw new Error(`manifest.json is missing required field "${field}"`)
    }
  }

  if (!Array.isArray(manifest.scan_list) || manifest.scan_list.length === 0) {
    throw new Error('manifest.json scan_list must not be empty')
  }
}

export async function prepareInput({ imagesDir, manifestPath, workspaceDir, projectNameOverride }) {
  const resolvedImagesDir = resolve(imagesDir)
  const { imagesDir: workspaceImagesDir, manifestPath: workspaceManifestPath } = getWorkspacePaths(workspaceDir)
  await mkdir(workspaceImagesDir, { recursive: true })

  if (manifestPath) {
    log('INPUT', `Preparing manifest mode from ${manifestPath}`)
    const resolvedManifestPath = resolve(manifestPath)
    const manifestText = await readFile(resolvedManifestPath, 'utf-8')
    let manifest
    try {
      manifest = JSON.parse(manifestText)
    } catch (error) {
      throw new Error(`Failed to parse manifest.json at ${resolvedManifestPath}: ${error.message}`)
    }
    validateManifestShape(manifest)

    for (const item of manifest.scan_list) {
      if (!item.id || item.floor == null) {
        throw new Error(`Invalid scan_list entry: ${JSON.stringify(item)}`)
      }
      const sourcePath = await findImageById(resolvedImagesDir, item.id)
      await normalizeImageToJpeg(sourcePath, join(workspaceImagesDir, `${item.id}.jpg`))
    }

    const projectName = resolveProjectName(manifest.project_name, projectNameOverride)
    const preparedManifest = { ...manifest, project_name: projectName }
    await writeFile(workspaceManifestPath, `${JSON.stringify(preparedManifest, null, 2)}\n`, 'utf-8')
    await writeState(workspaceDir, {
      input_mode: 'manifest',
      manifest_source: resolvedManifestPath,
      images_source_dir: resolvedImagesDir,
      project_name: projectName,
      scan_count: manifest.scan_list.length,
    })

    return { inputMode: 'manifest', projectName, manifest: preparedManifest }
  }

  log('INPUT', `Preparing image-only mode from ${resolvedImagesDir}`)
  const sourceImages = await listSupportedImages(resolvedImagesDir)
  if (sourceImages.length === 0) {
    throw new Error(`No supported panorama images found in ${resolvedImagesDir}`)
  }

  const dateStamp = formatDateStamp()
  const scanList = []
  for (const [index, sourcePath] of sourceImages.entries()) {
    const id = `IMG_${dateStamp}_${String(index).padStart(3, '0')}`
    await normalizeImageToJpeg(sourcePath, join(workspaceImagesDir, `${id}.jpg`))
    scanList.push({ id, floor: 0 })
  }

  const projectName = resolveProjectName(null, projectNameOverride)
  const manifest = {
    version: '1.0',
    project_name: projectName,
    floor_map: { '0': 0 },
    scan_list: scanList,
  }

  await writeFile(workspaceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
  await writeState(workspaceDir, {
    input_mode: 'images',
    images_source_dir: resolvedImagesDir,
    project_name: projectName,
    scan_count: scanList.length,
  })

  return { inputMode: 'images', projectName, manifest }
}
