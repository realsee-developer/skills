import test from 'node:test';
import assert from 'node:assert/strict';
import { UniversalObjectTransferPort, buildPrivateCosKey } from '../src/ports.mjs';

for (const [region, adaptorSpecifier, providerName] of [
  ['global', '@realsee/universal-uploader/adaptors/aws', 'aws'],
  ['cn', '@realsee/universal-uploader/adaptors/cos-node', 'cos']
]) {
  test(`object transfer loads only the ${region} Node adapter and streams uploadFile`, async () => {
    const required = [];
    const initial = { bucket: 'bucket', region: 'storage-region', prefix: 'first/' };
    const refreshed = { ...initial, prefix: 'second/' };
    let refreshes = 0;
    class FakeUploader {
      constructor(Adaptor, config) {
        this.Adaptor = Adaptor;
        this.config = config;
      }

      async uploadFile(key, filePath, options) {
        assert.equal(this.Adaptor.providerName, providerName);
        assert.equal(filePath, '/workspace/input.zip');
        assert.equal(options.signal, signal);
        assert.equal(await this.config.getToken(), initial);
        assert.equal(await this.config.getToken(), refreshed);
        return {
          providerName,
          key,
          objectPath: `first/${key}`,
          etag: 'etag',
          bytes: 42,
          attempts: 1
        };
      }
    }
    const signal = new AbortController().signal;
    const port = new UniversalObjectTransferPort({
      region,
      requireImpl(specifier) {
        required.push(specifier);
        if (specifier === '@realsee/universal-uploader') return { Uploader: FakeUploader };
        if (specifier === adaptorSpecifier) return { default: { providerName } };
        throw new Error(`unexpected require: ${specifier}`);
      }
    });
    const receipt = await port.upload({
      filePath: '/workspace/input.zip',
      objectName: 'input.zip',
      lease: initial,
      refreshLease: async () => { refreshes += 1; return refreshed; },
      signal
    });
    assert.deepEqual(required, ['@realsee/universal-uploader', adaptorSpecifier]);
    assert.equal(refreshes, 1);
    assert.deepEqual(receipt, {
      provider: providerName,
      object_path: 'first/input.zip',
      key: 'input.zip',
      etag: 'etag',
      bytes: 42,
      bucket: 'bucket',
      region: 'storage-region'
    });
  });
}

test('private COS key uses the safe receipt object path and never a token', () => {
  assert.equal(
    buildPrivateCosKey({ objectPath: 'prefix/input.zip' }, { prefix: 'ignored/' }, 'input.zip'),
    'prefix/input.zip'
  );
  assert.equal(
    buildPrivateCosKey({ key: 'input.zip' }, { prefix: 'prefix/' }, 'input.zip'),
    'prefix/input.zip'
  );
});
