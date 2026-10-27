import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inspectArgusResult } from '../src/result-report.mjs';
import { writeResult, writeState } from '../src/state.mjs';
import { validManifest, writeOutputDirectory, writeOutputZip } from './helpers/artifacts.mjs';

const entrypoint = fileURLToPath(new URL('../scripts/inspect-result.mjs', import.meta.url));
const skillRoot = resolve(dirname(entrypoint), '..');
const lowResolution = {
  code: 'LOW_RESOLUTION', filename: '1.jpg', width: 1024, height: 512,
  message: 'Recommended panorama resolution is at least 2048x1024; got 1024x512.'
};

async function fixture(t, { status = 'success', phase = 'completed', includeIntrinsics = false } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'argus-report-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const missingIds = status === 'partial' ? ['000001'] : [];
  const manifest = validManifest({ status, missingIds, includeIntrinsics });
  const outputDir = join(workspace, 'output');
  const zip = join(workspace, 'output.zip');
  await writeOutputDirectory(outputDir, { manifest });
  await writeOutputZip(zip, { manifest });
  const bytes = await readFile(zip);
  const download = { bytes: bytes.length, md5: createHash('md5').update(bytes).digest('hex') };
  const names = status === 'partial' ? ['1.jpg', '2.jpg'] : ['1.jpg'];
  await writeState(workspace, {
    phase, task_status: 'succeeded', result_status: status, region: 'cn',
    input: { image_count: names.length, images: names.map((name) => ({ name })), warnings: [lowResolution] },
    download
  });
  await writeResult(workspace, {
    task_status: 'succeeded', result_status: status, output_zip_path: zip,
    output_dir: outputDir, manifest_path: join(outputDir, 'output.json'),
    point_cloud_path: status === 'error' ? null : join(outputDir, 'pointcloud', 'merged.glb'),
    depth_maps: status === 'error' ? [] : [join(outputDir, 'depth', '000000_depth.exr')],
    poses: status === 'error' ? [] : [join(outputDir, 'pose', '000000_pose.json')],
    intrinsics: includeIntrinsics ? [join(outputDir, 'intrinsics', '000000_intrinsics.json')] : [],
    missing_ids: missingIds, warnings: [], error: manifest.error ?? null, download
  });
  return { workspace, outputDir, zip, download };
}

async function snapshot(root) {
  const result = {};
  async function visit(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) await visit(path);
      else result[path] = createHash('sha256').update(await readFile(path)).digest('hex');
    }
  }
  await visit(root);
  return result;
}

test('offline report verifies artifacts, preserves actual phase and leaves the workspace unchanged', async (t) => {
  const { workspace, download } = await fixture(t, { phase: 'finalizing', includeIntrinsics: true });
  const before = await snapshot(workspace);
  const report = await inspectArgusResult(workspace);
  assert.equal(report.phase, 'finalizing');
  assert.equal(report.task_status, 'succeeded');
  assert.equal(report.result_status, 'success');
  assert.deepEqual(report.validation, { scope: 'artifact_contract', status: 'passed', binary_payloads: 'not_decoded' });
  assert.equal(report.visual_quality, 'not_assessed');
  assert.deepEqual(report.warnings, [lowResolution]);
  assert.equal(report.input.image_count, 1);
  assert.equal(report.artifacts.point_cloud.vertex_count, 1);
  assert.equal(report.artifacts.point_cloud.has_color, true);
  assert.equal(report.artifacts.depth_maps.count, 1);
  assert.deepEqual(report.artifacts.depth_maps.files[0].resolution, [840, 420]);
  assert.equal(report.artifacts.poses.count, 1);
  assert.equal(report.artifacts.intrinsics.provided, true);
  assert.equal(report.artifacts.intrinsics.count, 1);
  assert.equal(report.artifacts.output_zip.md5, download.md5);
  assert.equal(report.artifacts.output_zip.integrity, 'matched_recorded_md5');
  assert.deepEqual(await snapshot(workspace), before);
});

test('structured input warnings are recovered for old results and deduplicated in new results', async (t) => {
  const { workspace } = await fixture(t);
  const result = JSON.parse(await readFile(join(workspace, 'result.json'), 'utf8'));
  result.warnings = [{ message: lowResolution.message, height: 512, width: 1024, filename: '1.jpg', code: 'LOW_RESOLUTION' }];
  await writeResult(workspace, result);
  const report = await inspectArgusResult(workspace);
  assert.deepEqual(report.warnings, [lowResolution]);
});

test('partial remains partial with all missing IDs even when the contract passes', async (t) => {
  const { workspace } = await fixture(t, { status: 'partial' });
  const output = spawnSync(process.execPath, [entrypoint, '--workspace', workspace, '--json'], {
    encoding: 'utf8', env: { PATH: process.env.PATH }, cwd: tmpdir()
  });
  assert.equal(output.status, 0, output.stderr);
  const report = JSON.parse(output.stdout);
  assert.equal(report.result_status, 'partial');
  assert.equal(report.validation.status, 'passed');
  assert.deepEqual(report.missing_ids, ['000001']);
  assert.equal(report.artifacts.depth_maps.count, 1);
  assert.equal(report.input.image_count, 2);
  assert.equal(report.artifacts.intrinsics.provided, false);
  assert.match(output.stderr, /partial.*000001/);
});

test('write-report saves the machine report without changing original artifacts', async (t) => {
  const { workspace } = await fixture(t);
  const before = await snapshot(workspace);
  const output = spawnSync(process.execPath, [entrypoint, '--workspace', workspace, '--json', '--write-report'], {
    encoding: 'utf8', env: { PATH: process.env.PATH }, cwd: tmpdir()
  });
  assert.equal(output.status, 0, output.stderr);
  const report = JSON.parse(output.stdout);
  const reportPath = join(workspace, 'verification.json');
  assert.equal(report.report_path, reportPath);
  assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), report);
  const after = await snapshot(workspace);
  delete after[reportPath];
  assert.deepEqual(after, before);
});

test('algorithm error gets exit 2 and is not labelled a successful reconstruction', async (t) => {
  const { workspace } = await fixture(t, { status: 'error' });
  const output = spawnSync(process.execPath, [entrypoint, '--workspace', workspace, '--json'], {
    encoding: 'utf8', env: { PATH: process.env.PATH }
  });
  assert.equal(output.status, 2, output.stderr);
  const report = JSON.parse(output.stdout);
  assert.equal(report.validation.status, 'passed');
  assert.equal(report.result_status, 'error');
  assert.equal(report.error.code, 'RECONSTRUCTION_FAILED');
  assert.equal(report.artifacts.point_cloud, null);
  assert.equal(report.artifacts.depth_maps.count, 0);
  const text = spawnSync(process.execPath, [entrypoint, '--workspace', workspace], {
    encoding: 'utf8', env: { PATH: process.env.PATH }
  });
  assert.equal(text.status, 2);
  assert.match(text.stdout, /Error: RECONSTRUCTION_FAILED: .+/);
});

test('remote failure has no artifact validation claim or raw provider diagnostic fields', async (t) => {
  const { workspace } = await fixture(t, { status: 'error' });
  await rm(join(workspace, 'output'), { recursive: true });
  await rm(join(workspace, 'output.zip'));
  await writeState(workspace, { phase: 'failed', task_status: 'failed', result_status: 'error' });
  await writeResult(workspace, {
    task_status: 'failed', result_status: 'error', missing_ids: [], warnings: [],
    task_code: 'provider-internal-task', trace_id: 'provider-trace',
    error: { code: 'ALGORITHM_FAILED', message: 'Raw provider diagnostic must stay out of the report.' }
  });
  const report = await inspectArgusResult(workspace);
  assert.equal(report.phase, 'failed');
  assert.equal(report.validation.status, 'not_applicable');
  assert.equal(report.artifacts.output_zip, null);
  assert.doesNotMatch(JSON.stringify(report), /provider-internal|provider-trace|Raw provider/);
});

test('rejects corrupted archives and does not overwrite a prior report', async (t) => {
  const { workspace, zip } = await fixture(t);
  const reportPath = join(workspace, 'verification.json');
  await writeFile(reportPath, 'prior-report');
  const bytes = await readFile(zip);
  bytes[bytes.length - 1] ^= 0xff;
  await writeFile(zip, bytes);
  const output = spawnSync(process.execPath, [entrypoint, '--workspace', workspace, '--json', '--write-report'], {
    encoding: 'utf8', env: { PATH: process.env.PATH }
  });
  assert.equal(output.status, 1);
  assert.equal(JSON.parse(output.stdout).validation.status, 'failed');
  assert.match(JSON.parse(output.stdout).error.message, /MD5/);
  assert.equal(await readFile(reportPath, 'utf8'), 'prior-report');
});

test('rejects missing referenced files, source-name drift and result status drift', async (t) => {
  for (const mutation of ['missing-depth', 'wrong-name', 'wrong-result-status', 'wrong-index-path']) {
    const { workspace, outputDir } = await fixture(t);
    if (mutation === 'missing-depth') await rm(join(outputDir, 'depth', '000000_depth.exr'));
    if (mutation === 'wrong-name') {
      await writeState(workspace, { input: { image_count: 1, images: [{ name: 'other.jpg' }], warnings: [] } });
    }
    if (mutation === 'wrong-result-status' || mutation === 'wrong-index-path') {
      const result = JSON.parse(await readFile(join(workspace, 'result.json'), 'utf8'));
      if (mutation === 'wrong-result-status') result.result_status = 'partial';
      else result.depth_maps = [join(outputDir, 'other.exr')];
      await writeResult(workspace, result);
    }
    await assert.rejects(() => inspectArgusResult(workspace), undefined, mutation);
  }
});

test('missing result stops locally and an absent original ZIP is reported honestly', async (t) => {
  const { workspace, zip } = await fixture(t);
  await rm(zip);
  const report = await inspectArgusResult(workspace);
  assert.equal(report.artifacts.output_zip.present, false);
  assert.equal(report.artifacts.output_zip.integrity, 'not_checked');
  assert.ok(report.warnings.some((warning) => typeof warning === 'string' && warning.includes('output.zip is missing')));
  await rm(join(workspace, 'result.json'));
  await assert.rejects(() => inspectArgusResult(workspace), /No collected result/);
});

test('CLI and help work from another cwd in an installed copy without environment credentials', async (t) => {
  const { workspace } = await fixture(t);
  const installed = await mkdtemp(join(tmpdir(), 'argus-installed-report-'));
  t.after(() => rm(installed, { recursive: true, force: true }));
  for (const name of ['scripts', 'src', 'references']) await cp(join(skillRoot, name), join(installed, name), { recursive: true });
  const script = join(installed, 'scripts', 'inspect-result.mjs');
  const environment = { PATH: process.env.PATH, HOME: installed };
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8', env: environment, cwd: tmpdir() });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Offline/);
  await symlink(join(skillRoot, 'node_modules'), join(installed, 'node_modules'), 'dir');
  const report = spawnSync(process.execPath, [script, '--workspace', workspace, '--json'], {
    encoding: 'utf8', env: environment, cwd: tmpdir()
  });
  assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).result_status, 'success');
});

test('warning output redacts token values and signed links without copying unknown result fields', async (t) => {
  const { workspace } = await fixture(t);
  const resultPath = join(workspace, 'result.json');
  const result = JSON.parse(await readFile(resultPath, 'utf8'));
  const signedLink = new URL('https://example.invalid/result');
  signedLink.searchParams.set('signature', 'sample-signature');
  result.warnings = [`token=sample-private-value ${signedLink.href}`];
  result.provider_payload = { secret: 'sample-private-value' };
  // Intentionally use raw JSON to emulate an older external workspace, not the current state writer.
  await writeFile(resultPath, JSON.stringify(result));
  const output = spawnSync(process.execPath, [entrypoint, '--workspace', workspace, '--json'], { encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr);
  assert.doesNotMatch(output.stdout + output.stderr, /sample-private-value|sample-signature|example\.invalid|provider_payload/);
  assert.match(output.stdout, /REDACTED/);
});
