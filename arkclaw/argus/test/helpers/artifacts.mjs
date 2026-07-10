import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeStoredZip } from './zip.mjs';

export function validManifest({ status = 'success', missingIds = [], includeIntrinsics = false } = {}) {
  if (status === 'error') {
    return {
      version: '1.0',
      status: 'error',
      error: { code: 'RECONSTRUCTION_FAILED', message: 'No frame could be reconstructed.' }
    };
  }
  const all = ['000000', ...(status === 'partial' ? missingIds : [])];
  const manifest = {
    version: '1.0',
    status,
    name_mapping: Object.fromEntries(all.map((id, index) => [id, `${index + 1}.jpg`])),
    depth_maps: [{
      image_id: '000000',
      path: 'depth/000000_depth.exr',
      format: 'exr',
      resolution: [840, 420],
      unit: 'meter'
    }],
    point_cloud: {
      path: 'pointcloud/merged.glb',
      format: 'glb',
      vertex_count: 1,
      has_color: true,
      has_normals: false,
      coordinate_system: 'right-handed, Y-up'
    },
    poses: [{ image_id: '000000', path: 'pose/000000_pose.json', format: 'json' }]
  };
  if (status === 'partial') manifest.missing_ids = missingIds;
  if (includeIntrinsics) {
    manifest.intrinsics = [{ image_id: '000000', path: 'intrinsics/000000_intrinsics.json' }];
  }
  return manifest;
}

export function outputEntries({ manifest = validManifest(), overrides = {} } = {}) {
  const entries = [{ name: 'output.json', data: JSON.stringify(manifest) }];
  if (manifest.status === 'error') return entries;
  entries.push(
    { name: 'depth/000000_depth.exr', data: overrides.exr ?? Buffer.from([0x76, 0x2f, 0x31, 0x01, 0x02, 0, 0, 0]) },
    { name: 'pointcloud/merged.glb', data: overrides.glb ?? glbHeader() },
    { name: 'pose/000000_pose.json', data: JSON.stringify(overrides.pose ?? validPose()) }
  );
  if (manifest.intrinsics) {
    entries.push({
      name: 'intrinsics/000000_intrinsics.json',
      data: JSON.stringify(overrides.intrinsics ?? {
        image_id: '000000', model: 'equirectangular', width: 840, height: 420
      })
    });
  }
  return entries;
}

export async function writeOutputZip(path, options = {}) {
  await writeStoredZip(path, outputEntries(options));
}

export async function writeOutputDirectory(root, options = {}) {
  const entries = outputEntries(options);
  for (const entry of entries) {
    const path = join(root, entry.name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, entry.data);
  }
}

function validPose() {
  return {
    image_id: '000000',
    rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    translation: [0, 0, 0],
    coordinate_system: 'right-handed, Y-up'
  };
}

function glbHeader() {
  const buffer = Buffer.alloc(12);
  buffer.write('glTF', 0, 'ascii');
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  return buffer;
}
