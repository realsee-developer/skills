import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/cli.mjs';
import { buildJpegWithDimensions } from './helpers/jpeg.mjs';

const LIVE_ENV = {
  REALSEE_REGION: 'global',
  REALSEE_APP_KEY: 'test-app-key',
  REALSEE_APP_SECRET: 'test-app-secret',
  REALSEE_POLL_INTERVAL_MS: '1',
  REALSEE_POLL_MAX_ATTEMPTS: '5'
};

// All live cli tests use real SOF-bearing JPEGs (1024×1024 for pinhole, 4096×2048
// for panorama) because cli.mjs now always reads the JPEG dimensions to enforce
// the 1:1 / 2:1 aspect ratio constraint.
const PINHOLE_JPEG = buildJpegWithDimensions(1024, 1024);
const PANORAMA_JPEG = buildJpegWithDimensions(4096, 2048);

test('live cli orchestrates upload → trigger → poll → download → result.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-live-'));
  try {
    const imagePath = join(root, 'photo.jpg');
    await writeFile(imagePath, PINHOLE_JPEG);

    const calls = {
      uploadToken: 0,
      trigger: 0,
      poll: 0,
      upload: 0,
      download: 0
    };
    const fakeGateway = {
      async getUploadToken({ inputImageId }) {
        calls.uploadToken += 1;
        assert.equal(inputImageId, '');
        return {
          input_image_id: 'image-id-123',
          upload_token: {
            tmpSecretId: 'aki', tmpSecretKey: 'sak', sessionToken: 'tok',
            ttl: '600', prefix: 'argus/', expire: 0, app_id: 'a',
            bucket: 'b', region: 'us-east-1', is_accelerate: 'false',
            host: 'https://upload.example.com', primaryid: 'p',
            download_type: 'presign', download_host: 'd', custom_domain: '',
            custom_scheme: 'https'
          }
        };
      },
      async triggerVGGT({ type, inputImageId }) {
        calls.trigger += 1;
        assert.equal(type, 'pinhole');
        assert.equal(inputImageId, 'image-id-123');
        return {};
      },
      async pollVGGT({ type, inputImageId }) {
        calls.poll += 1;
        assert.equal(type, 'pinhole');
        assert.equal(inputImageId, 'image-id-123');
        if (calls.poll < 2) return { status: 'pending' };
        return {
          status: 'success',
          alg_task_id: 'task-abc',
          result_url: 'https://cdn.example.com/result.glb'
        };
      }
    };

    const fakeUpload = async ({ imagePath: p, uploadToken, uploadKey }) => {
      calls.upload += 1;
      assert.equal(p, imagePath);
      assert.equal(uploadToken.bucket, 'b');
      assert.equal(uploadKey, 'pinholeImage.jpg');
      return { providerName: 'aws', key: uploadKey, etag: 'etag-1' };
    };
    const fakeDownload = async ({ url, outputPath }) => {
      calls.download += 1;
      assert.equal(url, 'https://cdn.example.com/result.glb');
      assert.match(outputPath, /task-abc\.glb$/);
      await writeFile(outputPath, Buffer.from('glTF binary placeholder'));
      return { bytes: 23, host: 'cdn.example.com', redirected: false };
    };
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();

    const result = await main([
      '--image', imagePath,
      '--type', 'image',
      '--workspace', root,
      '--json',
      '--yes'
    ], {
      env: LIVE_ENV,
      stdout,
      stderr,
      now: () => new Date('2026-05-11T00:00:00Z'),
      createGateway: () => fakeGateway,
      upload: fakeUpload,
      download: fakeDownload,
      sleep: () => Promise.resolve()
    });

    assert.equal(stderr.text, '');
    assert.equal(calls.uploadToken, 1);
    assert.equal(calls.trigger, 1);
    assert.equal(calls.poll, 2);
    assert.equal(calls.upload, 1);
    assert.equal(calls.download, 1);

    assert.equal(result.status, 'success');
    assert.equal(result.region, 'global');
    assert.equal(result.task_id, 'task-abc');
    assert.equal(result.input_image_id, 'image-id-123');
    assert.equal(result.upload.provider, 'aws');
    assert.equal(result.upload.key, 'pinholeImage.jpg');
    assert.equal(result.upload.etag, 'etag-1');
    assert.equal(result.download.bytes, 23);
    assert.match(result.output_glb_path, /task-abc\.glb$/);
    assert.match(result.preview_url, /\/argus\/image\/task\/task-abc$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('live cli surfaces failed poll status', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-live-'));
  try {
    const imagePath = join(root, 'photo.jpg');
    await writeFile(imagePath, PINHOLE_JPEG);

    const fakeGateway = {
      async getUploadToken() {
        return {
          input_image_id: 'image-id-9',
          upload_token: {
            tmpSecretId: 'a', tmpSecretKey: 'b', sessionToken: 'c',
            ttl: '0', prefix: 'p', expire: 0, app_id: 'a',
            bucket: 'b', region: 'r', is_accelerate: 'false',
            host: 'h', primaryid: 'p', download_type: 'direct',
            download_host: 'd', custom_domain: '', custom_scheme: ''
          }
        };
      },
      async triggerVGGT() { return {}; },
      async pollVGGT() {
        return { status: 'failed', failed_reason: 'malformed image' };
      }
    };

    await assert.rejects(
      () => main(['--image', imagePath, '--type', 'image', '--workspace', root, '--yes'], {
        env: LIVE_ENV,
        stdout: createWritableCapture(),
        stderr: createWritableCapture(),
        now: () => new Date('2026-05-11T00:00:00Z'),
        createGateway: () => fakeGateway,
        upload: async () => ({ providerName: 'aws', key: 'x', etag: 'y' }),
        download: async () => ({ bytes: 0 }),
        sleep: () => Promise.resolve()
      }),
      /malformed image/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('live cli rejects when poll budget is exhausted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-live-'));
  try {
    const imagePath = join(root, 'photo.jpg');
    await writeFile(imagePath, PINHOLE_JPEG);

    const fakeGateway = {
      async getUploadToken() {
        return {
          input_image_id: 'image-id-x',
          upload_token: {
            tmpSecretId: 'a', tmpSecretKey: 'b', sessionToken: 'c',
            ttl: '0', prefix: 'p', expire: 0, app_id: 'a',
            bucket: 'b', region: 'r', is_accelerate: 'false',
            host: 'h', primaryid: 'p', download_type: 'direct',
            download_host: 'd', custom_domain: '', custom_scheme: ''
          }
        };
      },
      async triggerVGGT() { return {}; },
      async pollVGGT() { return { status: 'pending' }; }
    };

    await assert.rejects(
      () => main(['--image', imagePath, '--type', 'image', '--workspace', root, '--yes'], {
        env: { ...LIVE_ENV, REALSEE_POLL_MAX_ATTEMPTS: '2' },
        stdout: createWritableCapture(),
        stderr: createWritableCapture(),
        now: () => new Date('2026-05-11T00:00:00Z'),
        createGateway: () => fakeGateway,
        upload: async () => ({ providerName: 'aws', key: 'x', etag: 'y' }),
        download: async () => ({ bytes: 0 }),
        sleep: () => Promise.resolve()
      }),
      /did not complete within the poll budget/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('live cli auto-detects panorama from 2:1 JPEG dimensions when --type is omitted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-live-'));
  try {
    const imagePath = join(root, 'pano.jpg');
    await writeFile(imagePath, PANORAMA_JPEG);

    const fakeGateway = {
      async getUploadToken() {
        return {
          input_image_id: 'pano-id-1',
          upload_token: {
            tmpSecretId: 'a', tmpSecretKey: 'b', sessionToken: 'c',
            ttl: '0', prefix: 'p', expire: 0, app_id: 'a',
            bucket: 'b', region: 'r', is_accelerate: 'false',
            host: 'h', primaryid: 'p', download_type: 'direct',
            download_host: 'd', custom_domain: '', custom_scheme: ''
          }
        };
      },
      async triggerVGGT({ type }) {
        assert.equal(type, 'pano');
        return {};
      },
      async pollVGGT() {
        return {
          status: 'success',
          alg_task_id: 'task-pano',
          result_url: 'https://cdn.example.com/result.glb'
        };
      }
    };
    let observedUploadKey;
    const result = await main(['--image', imagePath, '--workspace', root, '--yes', '--json'], {
      env: LIVE_ENV,
      stdout: createWritableCapture(),
      stderr: createWritableCapture(),
      now: () => new Date('2026-05-11T00:00:00Z'),
      createGateway: () => fakeGateway,
      upload: async ({ uploadKey }) => {
        observedUploadKey = uploadKey;
        return { providerName: 'aws', key: uploadKey, etag: 'etag' };
      },
      download: async ({ outputPath }) => {
        await writeFile(outputPath, Buffer.from('glTF'));
        return { bytes: 4, host: 'cdn.example.com', redirected: false };
      },
      sleep: () => Promise.resolve()
    });

    assert.equal(observedUploadKey, 'panoImage.jpg');
    assert.equal(result.status, 'success');
    assert.match(result.preview_url, /\/argus\/panorama\/task\/task-pano$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('live cli rejects 4:3 photo (neither 1:1 nor 2:1)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-live-'));
  try {
    const imagePath = join(root, 'rect.jpg');
    await writeFile(imagePath, buildJpegWithDimensions(4000, 3000)); // 4:3

    await assert.rejects(
      () => main(['--image', imagePath, '--workspace', root, '--yes', '--json'], {
        env: LIVE_ENV,
        stdout: createWritableCapture(),
        stderr: createWritableCapture(),
        now: () => new Date('2026-05-11T00:00:00Z'),
        // Gateway should NEVER be reached — validation throws before auth.
        createGateway: () => {
          throw new Error('gateway should not be constructed');
        },
        upload: async () => { throw new Error('upload should not be called'); },
        download: async () => { throw new Error('download should not be called'); },
        sleep: () => Promise.resolve()
      }),
      /Unsupported aspect ratio.*2:1.*1:1/s
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('live cli rejects --type panorama on a 1:1 image', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-live-'));
  try {
    const imagePath = join(root, 'square.jpg');
    await writeFile(imagePath, PINHOLE_JPEG);

    await assert.rejects(
      () => main(['--image', imagePath, '--type', 'panorama', '--workspace', root, '--yes', '--json'], {
        env: LIVE_ENV,
        stdout: createWritableCapture(),
        stderr: createWritableCapture(),
        now: () => new Date('2026-05-11T00:00:00Z'),
        createGateway: () => {
          throw new Error('gateway should not be constructed');
        },
        upload: async () => { throw new Error('upload should not be called'); },
        download: async () => { throw new Error('download should not be called'); },
        sleep: () => Promise.resolve()
      }),
      /--type panorama.*2:1/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function createWritableCapture() {
  return {
    text: '',
    write(chunk) {
      this.text += String(chunk);
    }
  };
}
