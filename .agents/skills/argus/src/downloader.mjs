import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, statfs } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { basename, dirname, join } from 'node:path';
import { finished, pipeline } from 'node:stream/promises';

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 60_000;

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

export async function downloadFileAtomic({
  url,
  outputPath,
  expectedBytes,
  expectedMd5,
  expectedSha256,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  transport = nodeTransport,
  maxRedirects = MAX_REDIRECTS
}) {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const parsed = parseDownloadUrl(currentUrl);
    const response = await transport({ url: parsed, signal, timeoutMs });
    if (isRedirect(response.statusCode)) {
      response.body?.destroy?.();
      if (redirectCount === maxRedirects) throw new Error('download redirect limit exceeded');
      const location = response.headers?.location;
      if (!location) throw new Error('download redirect missing location');
      currentUrl = new URL(location, parsed).toString();
      continue;
    }
    if (response.statusCode !== 200) {
      response.body?.destroy?.();
      throw new Error(`download failed with HTTP ${response.statusCode}`);
    }

    const headerBytes = parseContentLength(response.headers?.['content-length']);
    if (expectedBytes !== undefined && expectedBytes !== null && headerBytes !== null && headerBytes !== expectedBytes) {
      response.body?.destroy?.();
      throw new Error(`download Content-Length ${headerBytes} does not match expected size ${expectedBytes}`);
    }
    const requiredBytes = expectedBytes ?? headerBytes;
    await assertDiskSpace(outputPath, requiredBytes);
    const receipt = await writeBodyAtomic({
      body: response.body,
      outputPath,
      expectedBytes: expectedBytes ?? headerBytes,
      expectedMd5,
      expectedSha256,
      signal
    });
    return {
      ...receipt,
      host: parsed.hostname,
      redirected: redirectCount > 0,
      content_length: headerBytes
    };
  }

  throw new Error('download redirect limit exceeded');
}

function nodeTransport({ url, signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'http:' ? httpRequest : httpsRequest;
    const req = request(url, { method: 'GET', signal }, (res) => {
      resolve({ statusCode: res.statusCode, headers: res.headers, body: res });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('download request timed out')));
    req.on('error', reject);
    req.end();
  });
}

async function writeBodyAtomic({ body, outputPath, expectedBytes, expectedMd5, expectedSha256, signal }) {
  const outputDir = dirname(outputPath);
  await mkdir(outputDir, { recursive: true });
  const tmpPath = join(outputDir, `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`);
  const md5Hash = createHash('md5');
  const sha256Hash = createHash('sha256');
  let bytes = 0;
  let writer;

  try {
    writer = createWriteStream(tmpPath, { flags: 'wx', mode: 0o600 });
    await pipeline(
      (async function* () {
        for await (const chunk of chunks(body)) {
          if (signal?.aborted) throw signal.reason ?? new Error('download aborted');
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (expectedBytes !== undefined && expectedBytes !== null && bytes > expectedBytes) {
            throw new Error(`downloaded more than expected ${expectedBytes} bytes`);
          }
          md5Hash.update(buffer);
          sha256Hash.update(buffer);
          yield buffer;
        }
      })(),
      writer,
      { signal }
    );

    if (expectedBytes !== undefined && expectedBytes !== null && bytes !== expectedBytes) {
      throw new Error(`downloaded ${bytes} bytes; expected ${expectedBytes}`);
    }
    if (bytes === 0) throw new Error('downloaded file is empty');
    const md5 = md5Hash.digest('hex');
    const sha256 = sha256Hash.digest('hex');
    if (expectedMd5 && md5 !== normalizeMd5(expectedMd5)) {
      throw new Error('downloaded file MD5 does not match task metadata');
    }
    if (expectedSha256 && sha256 !== normalizeSha256(expectedSha256)) {
      throw new Error('downloaded file SHA-256 does not match manifest');
    }
    await rename(tmpPath, outputPath);
    return { bytes, md5 };
  } catch (error) {
    if (writer) {
      writer.destroy();
      try {
        await finished(writer, { cleanup: true });
      } catch {
        // Preserve the original transfer or integrity error.
      }
    }
    await rm(tmpPath, { force: true });
    throw error;
  }
}

async function assertDiskSpace(outputPath, requiredBytes) {
  if (!Number.isSafeInteger(requiredBytes) || requiredBytes <= 0) return;
  const dir = dirname(outputPath);
  await mkdir(dir, { recursive: true });
  const fs = await statfs(dir);
  const available = Number(fs.bavail) * Number(fs.bsize);
  if (Number.isFinite(available) && requiredBytes > available) {
    throw new Error(`insufficient disk space for ${requiredBytes} byte download`);
  }
}

function normalizeMd5(value) {
  const md5 = String(value).trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(md5)) throw new Error('expected MD5 must be 32 hexadecimal characters');
  return md5;
}

function normalizeSha256(value) {
  const sha256 = String(value).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('expected SHA-256 must be 64 hexadecimal characters');
  }
  return sha256;
}

function parseContentLength(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!/^\d+$/.test(String(value))) throw new Error('invalid download Content-Length');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('invalid download Content-Length');
  return parsed;
}

function isRedirect(statusCode) {
  return [301, 302, 303, 307, 308].includes(statusCode);
}

async function* chunks(body) {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array || typeof body === 'string') {
    yield body;
    return;
  }
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') {
    throw new Error('download response body is not readable');
  }
  yield* body;
}
