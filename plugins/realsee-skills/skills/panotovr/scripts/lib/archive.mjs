import { createReadStream, createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import { getWorkspacePaths, writeState } from './state.mjs'

function addManifestEntry(zip, manifest) {
  const entry = new ZipDeflate('manifest.json')
  zip.add(entry)
  entry.push(new TextEncoder().encode(JSON.stringify(manifest, null, 2)), true)
}

async function addImageEntry(zip, sourcePath, entryName) {
  const entry = new ZipPassThrough(entryName)
  zip.add(entry)

  const input = createReadStream(sourcePath)
  await new Promise((resolve, reject) => {
    input.on('data', (chunk) => {
      try {
        entry.push(new Uint8Array(chunk), false)
      } catch (error) {
        reject(error)
      }
    })
    input.on('end', () => {
      try {
        entry.push(new Uint8Array(), true)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
    input.on('error', reject)
  })
}

export async function createUploadZip(workspaceDir, manifest) {
  const { imagesDir, zipPath } = getWorkspacePaths(workspaceDir)
  const output = createWriteStream(zipPath)

  await new Promise(async (resolve, reject) => {
    let settled = false
    const settleReject = (error) => {
      if (settled) {
        return
      }
      settled = true
      output.destroy()
      reject(error)
    }
    const settleResolve = () => {
      if (settled) {
        return
      }
      settled = true
      resolve()
    }

    output.on('error', settleReject)
    output.on('close', settleResolve)

    const zip = new Zip((error, chunk, final) => {
      if (error) {
        settleReject(error)
        return
      }

      if (chunk?.length) {
        output.write(Buffer.from(chunk))
      }
      if (final) {
        output.end()
      }
    })

    try {
      addManifestEntry(zip, manifest)

      for (const item of manifest.scan_list) {
        await addImageEntry(zip, join(imagesDir, `${item.id}.jpg`), `images/${item.id}.jpg`)
      }

      zip.end()
    } catch (error) {
      settleReject(error)
    }
  })

  const { size } = await stat(zipPath)
  await writeState(workspaceDir, {
    zip_path: zipPath,
    zip_size_bytes: size,
  })

  return zipPath
}
