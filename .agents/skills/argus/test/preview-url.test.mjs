import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviewUrl } from '../src/preview-url.mjs';

test('builds global path route', () => {
  assert.equal(buildPreviewUrl({ region: 'global', previewType: 'image', algTaskId: 'abc' }), 'https://h5.realsee.ai/argus/image/task/abc');
});

test('builds cn path route', () => {
  assert.equal(buildPreviewUrl({ region: 'cn', previewType: 'panorama', algTaskId: 'abc' }), 'https://h5.realsee.cn/argus/panorama/task/abc');
});

test('throws for invalid region', () => {
  assert.throws(
    () => buildPreviewUrl({ region: 'mars', previewType: 'image', algTaskId: 'abc' }),
    /invalid region/i,
  );
});

test('throws when algTaskId is missing', () => {
  assert.throws(
    () => buildPreviewUrl({ region: 'global', previewType: 'image' }),
    /algTaskId/i,
  );
});

test('throws when previewType is missing', () => {
  assert.throws(
    () => buildPreviewUrl({ region: 'global', algTaskId: 'abc' }),
    /previewType|preview_type/,
  );

  assert.throws(
    () => buildPreviewUrl({ region: 'cn', previewType: '', algTaskId: 'abc' }),
    /previewType|preview_type/,
  );
});

test('encodes preview url components', () => {
  assert.equal(
    buildPreviewUrl({ region: 'global', previewType: 'image type', algTaskId: 'abc/123?' }),
    'https://h5.realsee.ai/argus/image%20type/task/abc%2F123%3F',
  );

  assert.equal(
    buildPreviewUrl({ region: 'cn', previewType: 'pano type', algTaskId: 'abc 123' }),
    'https://h5.realsee.cn/argus/pano%20type/task/abc%20123',
  );
});
