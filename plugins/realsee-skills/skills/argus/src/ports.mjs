import { createRequire } from 'node:module';
import { downloadFileAtomic } from './downloader.mjs';

export class GatewayArgusTaskPort {
  constructor(gateway) {
    if (!gateway) throw new TypeError('gateway is required');
    this.gateway = gateway;
  }

  allocateUpload() {
    return this.gateway.getFileToken();
  }

  submit({ privateCosKey, title }) {
    return this.gateway.submitTask({ privateCosKey, title });
  }

  inspect(taskCode) {
    return this.gateway.getTaskInfo({ taskCode });
  }
}

export class UniversalObjectTransferPort {
  constructor({ region, requireImpl = createRequire(import.meta.url) }) {
    if (!['global', 'cn'].includes(region)) throw new TypeError('region must be global or cn');
    this.region = region;
    this.require = requireImpl;
  }

  async upload({ filePath, objectName, lease, refreshLease, signal, onProgress }) {
    const { Uploader } = this.require('@realsee/universal-uploader');
    const Adaptor = resolveAdaptor(this.require, this.region);
    let initialLease = lease;
    const uploader = new Uploader(Adaptor, {
      getToken: async () => {
        if (initialLease) {
          const token = initialLease;
          initialLease = null;
          return token;
        }
        return refreshLease();
      }
    });
    if (typeof uploader.uploadFile !== 'function') {
      throw new Error('@realsee/universal-uploader 0.1.1 with uploadFile() is required');
    }
    const receipt = await uploader.uploadFile(objectName, filePath, { signal, onProgress });
    return sanitizeUploadReceipt(receipt, lease, objectName, this.region);
  }

  download(options) {
    return downloadFileAtomic(options);
  }
}

export function buildPrivateCosKey(receipt, initialLease, objectName) {
  const explicit = receipt?.objectPath ?? receipt?.object_path ?? receipt?.path;
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  const prefix = receipt?.prefix ?? initialLease?.prefix;
  const key = receipt?.key ?? objectName;
  if (typeof prefix !== 'string' || !prefix || typeof key !== 'string' || !key) {
    throw new Error('upload receipt is missing object path information');
  }
  return `${prefix}${key}`;
}

function resolveAdaptor(requireImpl, region) {
  const specifier = region === 'cn'
    ? '@realsee/universal-uploader/adaptors/cos-node'
    : '@realsee/universal-uploader/adaptors/aws';
  const loaded = requireImpl(specifier);
  return loaded.CosNodeAdaptor ?? loaded.AwsAdaptor ?? loaded.default ?? loaded;
}

function sanitizeUploadReceipt(receipt, lease, objectName, targetRegion) {
  if (!receipt || typeof receipt !== 'object') throw new Error('upload did not return a receipt');
  const objectPath = buildPrivateCosKey(receipt, lease, objectName);
  return {
    provider: receipt.providerName ?? receipt.provider ?? (targetRegion === 'cn' ? 'cos-node' : 'aws'),
    object_path: objectPath,
    key: receipt.key ?? objectName,
    etag: receipt.etag ?? null,
    bytes: receipt.bytes ?? receipt.size ?? null,
    bucket: receipt.bucket ?? lease?.bucket ?? null,
    region: receipt.region ?? lease?.region ?? null
  };
}
