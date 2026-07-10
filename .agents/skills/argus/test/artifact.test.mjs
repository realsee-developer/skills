import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArgusOutput, validateArgusResult } from '../src/result-validator.mjs';
import { validManifest, writeOutputDirectory } from './helpers/artifacts.mjs';

test('canonical JSON Schema is a 2020-12 success/partial/error discriminated union', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../references/argus-output.schema.json', import.meta.url),
    'utf8'
  ));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.deepEqual(schema.oneOf, [
    { $ref: '#/$defs/success' },
    { $ref: '#/$defs/partial' },
    { $ref: '#/$defs/error' }
  ]);
  assert.equal(schema.$defs.partial.properties.missing_ids.minItems, 1);
  assert.equal(schema.$defs.partial.properties.missing_ids.uniqueItems, true);
  assert.equal(schema.$defs.depthMap.properties.format.const, 'exr');
  assert.equal(schema.$defs.pointCloud.properties.coordinate_system.const, 'right-handed, Y-up');
});

for (const scenario of [
  { status: 'success', missingIds: [], inputNames: ['1.jpg'] },
  { status: 'partial', missingIds: ['000001'], inputNames: ['1.jpg', '2.jpg'] },
  { status: 'error', missingIds: [], inputNames: undefined }
]) {
  test(`validates a complete ${scenario.status} artifact tree`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'argus-artifact-'));
    try {
      await writeOutputDirectory(root, {
        manifest: validManifest({ status: scenario.status, missingIds: scenario.missingIds })
      });
      const result = await validateArgusOutput(root, { expectedInputNames: scenario.inputNames });
      assert.equal(result.result_status, scenario.status);
      assert.deepEqual(result.missing_ids, scenario.missingIds);
      if (scenario.status === 'error') {
        assert.equal(result.point_cloud_path, null);
        assert.equal(result.error.code, 'RECONSTRUCTION_FAILED');
      } else {
        assert.match(result.point_cloud_path, /pointcloud\/merged\.glb$/);
        assert.equal(result.depth_maps.length, 1);
        assert.equal(result.poses.length, 1);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('accepts optional intrinsics and verifies its embedded image ID', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-intrinsics-'));
  try {
    await writeOutputDirectory(root, { manifest: validManifest({ includeIntrinsics: true }) });
    assert.equal((await validateArgusOutput(root)).intrinsics.length, 1);
    await writeFile(join(root, 'intrinsics', '000000_intrinsics.json'), JSON.stringify({
      image_id: '999999', model: 'equirectangular', width: 840, height: 420
    }));
    await assert.rejects(() => validateArgusOutput(root), /image_id.*000000|same image ID/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('partial requires unique nonempty missing IDs disjoint from successful artifacts', async () => {
  for (const missingIds of [[], ['000001', '000001'], ['000000']]) {
    const root = await mkdtemp(join(tmpdir(), 'argus-partial-invalid-'));
    try {
      const manifest = validManifest({ status: 'partial', missingIds });
      await writeOutputDirectory(root, { manifest });
      await assert.rejects(
        () => validateArgusResult(root),
        /missing_ids|duplicate|successful inputs|every input/i
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('rejects duplicate/unknown IDs, unsafe paths, and depth/pose set mismatch', async () => {
  const mutations = [
    (manifest) => manifest.depth_maps.push({ ...manifest.depth_maps[0] }),
    (manifest) => {
      manifest.depth_maps[0].image_id = '999999';
      manifest.depth_maps[0].path = 'depth/999999_depth.exr';
    },
    (manifest) => { manifest.depth_maps[0].path = '../escape.exr'; },
    (manifest) => { manifest.poses = []; }
  ];
  for (const mutate of mutations) {
    const root = await mkdtemp(join(tmpdir(), 'argus-contract-invalid-'));
    try {
      const manifest = validManifest();
      mutate(manifest);
      await writeOutputDirectory(root, { manifest });
      await assert.rejects(
        () => validateArgusResult(root),
        /duplicate|path|image IDs|successful inputs|missing|does not match|ENOENT/i
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('rejects missing referenced files, invalid GLB/EXR magic, and invalid pose coordinates', async () => {
  const scenarios = [
    { overrides: { glb: Buffer.from('not-glb') }, pattern: /GLB|glTF|magic/i },
    { overrides: { exr: Buffer.from('not-exr') }, pattern: /EXR|magic/i },
    {
      overrides: {
        pose: {
          image_id: '000000',
          rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
          translation: [0, 0, 0],
          coordinate_system: 'left-handed, Z-up'
        }
      },
      pattern: /right-handed, Y-up/
    }
  ];
  for (const scenario of scenarios) {
    const root = await mkdtemp(join(tmpdir(), 'argus-magic-invalid-'));
    try {
      await writeOutputDirectory(root, { overrides: scenario.overrides });
      await assert.rejects(() => validateArgusResult(root), scenario.pattern);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  const root = await mkdtemp(join(tmpdir(), 'argus-missing-file-'));
  try {
    await writeOutputDirectory(root);
    await rm(join(root, 'pose', '000000_pose.json'));
    await assert.rejects(() => validateArgusResult(root), /pose.*missing|ENOENT/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects unreferenced files, input-name mismatch, and artifacts forged beside an error result', async () => {
  const successRoot = await mkdtemp(join(tmpdir(), 'argus-extra-file-'));
  const errorRoot = await mkdtemp(join(tmpdir(), 'argus-error-forged-'));
  try {
    await writeOutputDirectory(successRoot);
    await writeFile(join(successRoot, 'extra.bin'), 'extra');
    await assert.rejects(() => validateArgusResult(successRoot), /Unexpected file/);
    await rm(join(successRoot, 'extra.bin'));
    await assert.rejects(
      () => validateArgusResult(successRoot, { expectedInputNames: ['different.jpg'] }),
      /does not match the validated input filename ordering/
    );

    await writeOutputDirectory(errorRoot, { manifest: validManifest({ status: 'error' }) });
    await writeFile(join(errorRoot, 'forged.glb'), 'glTF');
    await assert.rejects(() => validateArgusResult(errorRoot), /must not contain artifact/);
  } finally {
    await rm(successRoot, { recursive: true, force: true });
    await rm(errorRoot, { recursive: true, force: true });
  }
});
