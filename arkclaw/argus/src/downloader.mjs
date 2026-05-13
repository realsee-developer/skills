import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_REDIRECTS = 5;
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const GLB_MAGIC = Buffer.from('glTF');

export function parseDownloadUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('download url is invalid');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('download url must use http or https');
  }

  return parsed;
}

export async function downloadArgusGlb({
  url,
  outputPath,
  transport = httpsTransport,
  maxRedirects = MAX_REDIRECTS,
  maxBytes = MAX_DOWNLOAD_BYTES
}) {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const parsed = parseDownloadUrl(currentUrl);
    const response = await transport({
      url: parsed,
      maxBytes
    });

    if (isRedirect(response.statusCode)) {
      if (redirectCount === maxRedirects) {
        throw new Error('download redirect limit exceeded');
      }
      const location = response.headers?.location;
      if (!location) {
        throw new Error('download redirect missing location');
      }
      currentUrl = new URL(location, parsed).toString();
      continue;
    }

    if (response.statusCode !== 200) {
      throw new Error(`download failed with HTTP ${response.statusCode}`);
    }

    const bytes = await writeGlbAtomic({ body: response.body, outputPath, maxBytes });
    return {
      bytes,
      host: parsed.hostname,
      redirected: redirectCount > 0
    };
  }

  throw new Error('download redirect limit exceeded');
}

function isRedirect(statusCode) {
  return [301, 302, 303, 307, 308].includes(statusCode);
}

function httpsTransport({ url, maxBytes }) {
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'http:' ? httpRequest : httpsRequest;
    const req = request(url, { method: 'GET' }, (res) => {
      const expected = Number(res.headers['content-length'] ?? 0);
      if (expected > maxBytes) {
        res.destroy();
        reject(new Error('download exceeds maximum size'));
        return;
      }
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: res
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function writeGlbAtomic({ body, outputPath, maxBytes }) {
  const outputDir = dirname(outputPath);
  await mkdir(outputDir, { recursive: true });
  const tmpPath = join(outputDir, `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`);
  let bytes = 0;
  let prefix = Buffer.alloc(0);
  let writer;

  try {
    writer = createWriteStream(tmpPath, { flags: 'wx' });
    for await (const chunk of chunks(body)) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) {
        throw new Error('download exceeds maximum size');
      }
      if (prefix.length < GLB_MAGIC.length) {
        prefix = Buffer.concat([prefix, buffer]).subarray(0, GLB_MAGIC.length);
      }
      if (!writer.write(buffer)) {
        await new Promise((resolve) => writer.once('drain', resolve));
      }
    }
    await new Promise((resolve, reject) => {
      writer.end((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    if (bytes === 0) {
      throw new Error('downloaded GLB is empty');
    }
    if (!prefix.equals(GLB_MAGIC)) {
      throw new Error('downloaded file is not a GLB');
    }

    await rename(tmpPath, outputPath);
    return bytes;
  } catch (error) {
    writer?.destroy();
    await rm(tmpPath, { force: true });
    throw error;
  }
}

async function* chunks(body) {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array || typeof body === 'string') {
    yield body;
    return;
  }
  yield* body;
}
