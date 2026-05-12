import test from 'node:test';
import assert from 'node:assert/strict';
import { assertUploadConsent } from '../src/consent.mjs';

test('requires upload consent with yes', () => {
  assert.throws(
    () => assertUploadConsent({ yes: false, files: ['a.jpg'], region: 'cn' }),
    /consent.*--yes/i
  );
});

test('records minimal consent metadata', () => {
  const metadata = assertUploadConsent({
    yes: true,
    files: ['/workspace/uploads/a.jpg', '/workspace/uploads/b.jpg'],
    region: 'global'
  });

  assert.equal(metadata.skill, 'argus');
  assert.equal(metadata.target, 'Realsee Argus/VGGT:global');
  assert.equal(metadata.file_count, 2);
  assert.match(metadata.consented_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(JSON.stringify(metadata).includes('/workspace/uploads'), false);
});

test('rejects missing files', () => {
  assert.throws(() => assertUploadConsent({ yes: true, files: [], region: 'cn' }), /files/i);
  assert.throws(() => assertUploadConsent({ yes: true, files: null, region: 'cn' }), /files/i);
});

test('rejects missing region', () => {
  assert.throws(() => assertUploadConsent({ yes: true, files: ['a.jpg'] }), /region/i);
});
