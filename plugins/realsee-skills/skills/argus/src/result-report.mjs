import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { writeJsonAtomic } from './output.mjs';
import { validateArgusResult } from './result-validator.mjs';
import { safeReportText } from './sanitizer.mjs';
import { getWorkspacePaths, readResult, readState } from './state.mjs';

/** Inspect only the collected local files. No credentials or remote ports are used. */
export async function inspectArgusResult(workspaceDir, { writeReport = false } = {}) {
  const workspace = resolve(workspaceDir);
  const paths = getWorkspacePaths(workspace);
  const state = await readState(workspace);
  if (!state) throw new Error('No Argus state.json found in this workspace.');
  const result = await readResult(workspace);
  if (!result) throw new Error('No collected result.json found. Collect the terminal task before inspecting it.');
  if (!['succeeded', 'failed'].includes(result.task_status) ||
      !['success', 'partial', 'error'].includes(result.result_status)) {
    throw new Error('result.json must describe a terminal Argus result.');
  }
  if (state.task_status && state.task_status !== result.task_status) {
    throw new Error('state.json and result.json disagree on task_status.');
  }
  if (state.result_status && state.result_status !== result.result_status) {
    throw new Error('state.json and result.json disagree on result_status.');
  }
  const warnings = [...new Map([
    ...warningList(state.input?.warnings), ...warningList(result.warnings)
  ].map((warning) => {
    const value = normalizeWarning(warning);
    return [JSON.stringify(value), value];
  })).values()];
  const inputCount = state.input?.image_count ?? null;
  const report = {
    schema_version: 1,
    skill: 'argus',
    workspace_dir: workspace,
    phase: typeof state.phase === 'string' ? safeReportText(state.phase) : null,
    task_status: result.task_status,
    result_status: result.result_status,
    validation: { scope: 'artifact_contract', status: 'not_applicable', binary_payloads: 'not_decoded' },
    visual_quality: 'not_assessed',
    input: { image_count: inputCount },
    missing_ids: [],
    warnings,
    artifacts: {
      output_zip: null, output_json: null, result_json: await fileInfo(paths.resultPath),
      point_cloud: null, depth_maps: { count: 0, files: [] },
      poses: { count: 0, files: [] }, intrinsics: { provided: false, count: 0, files: [] }
    },
    error: null
  };

  if (result.task_status === 'failed') {
    if (result.result_status !== 'error') throw new Error('A failed task must have result_status=error.');
    report.error = algorithmError(result.error);
  } else {
    assertPath(result.output_zip_path, paths.outputZipPath, 'output_zip_path');
    assertPath(result.output_dir, paths.outputDir, 'output_dir');
    assertPath(result.manifest_path, join(paths.outputDir, 'output.json'), 'manifest_path');
    const validated = await validateArgusResult(paths.outputDir, {
      expectedImageCount: inputCount ?? undefined,
      expectedInputNames: state.input?.images?.map((image) => image.name)
    });
    if (validated.status !== result.result_status) {
      throw new Error('output.json and result.json disagree on result_status.');
    }
    const missingIds = validated.missingIds ?? [];
    assertSameList(result.missing_ids ?? [], missingIds, 'missing_ids');
    report.missing_ids = missingIds;
    report.artifacts.output_json = await fileInfo(validated.manifestPath);
    report.artifacts.output_zip = await inspectArchive(paths.outputZipPath, state.download, result.download);
    if (!report.artifacts.output_zip.present) {
      report.warnings.push('Original output.zip is missing; archive integrity was not checked.');
    }
    if (validated.status === 'error') {
      report.error = algorithmError(validated.error);
      assertPath(result.point_cloud_path, null, 'point_cloud_path');
      for (const field of ['depth_maps', 'poses', 'intrinsics']) assertSameList(result[field] ?? [], [], field);
    } else {
      const images = validated.images;
      const cloud = validated.pointCloud;
      assertPath(result.point_cloud_path, cloud.absolutePath, 'point_cloud_path');
      assertSameList(result.depth_maps, images.map((image) => image.depth.absolutePath), 'depth_maps');
      assertSameList(result.poses, images.map((image) => image.pose.absolutePath), 'poses');
      const intrinsics = images.filter((image) => image.intrinsics);
      assertSameList(result.intrinsics ?? [], intrinsics.map((image) => image.intrinsics.absolutePath), 'intrinsics');
      report.artifacts.point_cloud = {
        ...await fileInfo(cloud.absolutePath), vertex_count: cloud.vertexCount,
        has_color: cloud.hasColor, has_normals: cloud.hasNormals,
        coordinate_system: cloud.coordinateSystem
      };
      report.artifacts.depth_maps = {
        count: images.length,
        files: await Promise.all(images.map(async (image) => ({
          image_id: image.imageId, source_filename: image.sourceFilename,
          ...await fileInfo(image.depth.absolutePath), resolution: image.depth.resolution,
          format: image.depth.format, unit: image.depth.unit
        })))
      };
      report.artifacts.poses = {
        count: images.length,
        files: await Promise.all(images.map(async (image) => ({
          image_id: image.imageId, ...await fileInfo(image.pose.absolutePath)
        })))
      };
      report.artifacts.intrinsics = {
        provided: intrinsics.length > 0, count: intrinsics.length,
        files: await Promise.all(intrinsics.map(async (image) => ({
          image_id: image.imageId, ...await fileInfo(image.intrinsics.absolutePath)
        })))
      };
      if (validated.status === 'partial') {
        const warning = `Argus returned a partial result; missing IDs: ${missingIds.join(', ')}`;
        if (!report.warnings.some((entry) => typeof entry === 'string' && entry.includes(warning))) {
          report.warnings.push(warning);
        }
      }
    }
    report.validation.status = 'passed';
  }

  if (writeReport) {
    report.report_path = join(workspace, 'verification.json');
    await writeJsonAtomic(report.report_path, report);
  }
  return report;
}

function warningList(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Stored warnings must be an array.');
  return value;
}

function normalizeWarning(value) {
  if (typeof value === 'string') return safeReportText(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored warnings must contain strings or structured warning objects.');
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => {
    const item = value[key];
    if (/token|secret|password|authorization|app.?key/iu.test(key)) return [key, '[REDACTED]'];
    if (typeof item === 'string') return [key, safeReportText(item)];
    if (item === null || typeof item === 'boolean' || Number.isFinite(item)) return [key, item];
    throw new Error('Structured warning fields must contain strings, numbers, booleans, or null.');
  }));
}

function assertPath(actual, expected, field) {
  if (actual === null && expected === null) return;
  if (typeof actual !== 'string' || expected === null || resolve(actual) !== expected) {
    throw new Error(`result.json ${field} does not match the collected workspace.`);
  }
}

function assertSameList(actual, expected, field) {
  if (!Array.isArray(actual) || actual.length !== expected.length ||
      actual.some((value, index) => value !== expected[index])) {
    throw new Error(`result.json ${field} does not match the validated output.`);
  }
}

async function fileInfo(path) {
  return { path, bytes: (await stat(path)).size };
}

async function inspectArchive(path, ...downloads) {
  let info;
  try { info = await lstat(path); } catch (error) {
    if (error.code === 'ENOENT') return { path, present: false, bytes: null, integrity: 'not_checked' };
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('output.zip must be a regular file.');
  const hash = createHash('md5');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const md5 = hash.digest('hex');
  let integrity = 'no_recorded_digest';
  for (const download of downloads) {
    if (download?.bytes != null) {
      if (download.bytes !== info.size) throw new Error('output.zip bytes do not match the recorded download.');
      if (integrity !== 'matched_recorded_md5') integrity = 'matched_recorded_bytes';
    }
    if (download?.md5 != null) {
      if (typeof download.md5 !== 'string' || download.md5.toLowerCase() !== md5) {
        throw new Error('output.zip MD5 does not match the recorded download.');
      }
      integrity = 'matched_recorded_md5';
    }
  }
  return { path, present: true, bytes: info.size, md5, integrity };
}

function algorithmError(error) {
  return {
    code: /^[A-Z][A-Z0-9_]{0,79}$/u.test(error?.code) ? error.code : 'ALGORITHM_ERROR',
    message: 'The Argus algorithm did not produce a successful reconstruction.'
  };
}
