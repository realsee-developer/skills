import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  statfs
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { validateImageFiles } from './input.mjs';

const require = createRequire(import.meta.url);
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR = 0x07064b50;
const ZIP64_EXTRA_FIELD = 0x0001;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_ENCRYPTED_FLAG = 0x0001;
const ZIP_STORE_METHOD = 0;
const ZIP_DEFLATE_METHOD = 8;
const DOS_1980_01_01 = 0x0021;
const UINT32_MAX = 0xffffffff;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const DEFAULT_LIMITS = Object.freeze({
  maxEntries: 2048,
  maxCompressedBytes: Infinity,
  maxUncompressedBytes: Infinity,
  maxEntryUncompressedBytes: Infinity,
  maxCompressionRatio: 200,
  minFreeDiskBytes: 0
});

/**
 * Write a deterministic ZIP64 archive using only stored entries. Files are
 * ordered by NFC UTF-8 filename bytes and carry a fixed 1980 DOS timestamp.
 * File contents are streamed twice (CRC pass, then output pass), never held in
 * memory as a whole.
 */
export async function writeDeterministicZip(entries, outputPath, options = {}) {
  throwIfAborted(options.signal);
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Deterministic ZIP requires at least one file entry.');
  }

  const prepared = [];
  const seenNames = new Map();
  for (const item of entries) {
    throwIfAborted(options.signal);
    const path = typeof item === 'string' ? item : item?.path;
    const requestedName = typeof item === 'string'
      ? basename(item)
      : item?.archiveName ?? item?.name ?? basename(path ?? '');
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error('Each deterministic ZIP entry requires a local path.');
    }
    const name = normalizeRootFileName(requestedName);
    const folded = caseFold(name);
    const prior = seenNames.get(folded);
    if (prior) {
      throw new Error(`Duplicate or case-folding ZIP entry collision: "${prior}" and "${name}".`);
    }
    seenNames.set(folded, name);

    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`ZIP source must be a regular non-symlink file: ${path}`);
    }
    const measured = await crc32File(path, options.signal);
    if (measured.size !== stat.size) {
      throw new Error(`ZIP source changed while it was being measured: ${path}`);
    }
    prepared.push({ path, name, nameBytes: Buffer.from(name, 'utf8'), ...measured });
  }
  prepared.sort((left, right) => Buffer.compare(left.nameBytes, right.nameBytes));

  const destination = resolve(outputPath);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = join(dirname(destination), `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
  let output;
  try {
    output = await open(temporary, 'wx', 0o600);
    let offset = 0;
    const centralRecords = [];

    for (const entry of prepared) {
      throwIfAborted(options.signal);
      assertSafeArchiveNumber(offset, 'local header offset');
      const localOffset = offset;
      const localHeader = buildLocalFileHeader(entry);
      const localExtra = buildZip64LocalExtra(entry.size);
      await writeAllAt(output, localHeader, offset);
      offset += localHeader.length;
      await writeAllAt(output, entry.nameBytes, offset);
      offset += entry.nameBytes.length;
      await writeAllAt(output, localExtra, offset);
      offset += localExtra.length;
      offset = await copyFileAt(entry.path, output, offset, entry.size, entry.crc32, options.signal);
      centralRecords.push({ entry, localOffset });
    }

    const centralOffset = offset;
    for (const record of centralRecords) {
      const centralHeader = buildCentralDirectoryHeader(record.entry, record.localOffset);
      const centralExtra = buildZip64CentralExtra(record.entry.size, record.localOffset);
      await writeAllAt(output, centralHeader, offset);
      offset += centralHeader.length;
      await writeAllAt(output, record.entry.nameBytes, offset);
      offset += record.entry.nameBytes.length;
      await writeAllAt(output, centralExtra, offset);
      offset += centralExtra.length;
    }
    const centralSize = offset - centralOffset;
    assertSafeArchiveNumber(centralSize, 'central directory size');
    const zip64EndOffset = offset;
    const zip64End = buildZip64EndOfCentralDirectory(prepared.length, centralSize, centralOffset);
    await writeAllAt(output, zip64End, offset);
    offset += zip64End.length;
    const zip64Locator = buildZip64EndLocator(zip64EndOffset);
    await writeAllAt(output, zip64Locator, offset);
    offset += zip64Locator.length;
    const end = buildEndOfCentralDirectory();
    await writeAllAt(output, end, offset);
    offset += end.length;
    await output.sync();
    await output.close();
    output = null;
    const sha256 = await sha256File(temporary, options.signal);
    await rename(temporary, destination);
    return {
      path: destination,
      bytes: offset,
      sha256,
      entries: prepared.map(({ name, size, crc32 }) => ({ name, size, crc32 }))
    };
  } catch (error) {
    await output?.close().catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function createCanonicalInputZip(entries, outputPath, options = {}) {
  const canonicalEntries = entries.map((entry) => ({
    path: entry.path,
    name: entry.filename ?? entry.name ?? entry.archiveName
  }));
  const archive = await writeDeterministicZip(canonicalEntries, outputPath, options);
  return { ...archive, entries };
}

/**
 * Safely extract an untrusted ZIP into a new/empty destination. The central
 * directory is scanned first with yauzl lazyEntries so declared sizes, paths,
 * file types, disk capacity, and collisions are rejected before writing data.
 * Actual streamed byte counts and CRC32 values are then verified independently.
 */
export async function extractZipSafely(zipPath, destination, options = {}) {
  throwIfAborted(options.signal);
  const yauzl = loadYauzl(options.yauzl);
  const limits = resolveLimits(options);
  const archiveStat = await lstat(zipPath);
  if (!archiveStat.isFile() || archiveStat.isSymbolicLink()) {
    throw new Error(`ZIP input must be a regular non-symlink file: ${zipPath}`);
  }
  if (archiveStat.size > limits.maxCompressedBytes) {
    throw new Error(`ZIP file exceeds compressed-size limit of ${limits.maxCompressedBytes} bytes.`);
  }

  const scan = await scanZip(zipPath, yauzl, {
    ...limits,
    rootFilesOnly: options.rootFilesOnly === true,
    normalizeNames: options.normalizeNames === true,
    signal: options.signal
  });

  const target = resolve(destination);
  await mkdir(dirname(target), { recursive: true });
  await assertDestinationReplaceable(target);
  await assertDiskCapacity(dirname(target), scan.totalUncompressedBytes, limits.minFreeDiskBytes, options);
  const stage = join(dirname(target), `.${basename(target)}.extract-${randomUUID()}`);
  await mkdir(stage, { recursive: false, mode: 0o700 });

  try {
    const extracted = await extractScannedEntries(zipPath, stage, scan.entries, yauzl, {
      ...limits,
      signal: options.signal
    });
    await rename(stage, target);
    return {
      directory: target,
      bytes: extracted.totalUncompressedBytes,
      totalUncompressedBytes: extracted.totalUncompressedBytes,
      entries: extracted.entries.map((entry) => ({
        ...entry,
        path: join(target, ...entry.name.split('/'))
      }))
    };
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Validate an input ZIP, normalize safe filenames to NFC, and rewrite it as a
 * deterministic stored ZIP. The original archive's compression, ordering,
 * timestamps, extras, and platform attributes never cross the seam.
 */
export async function normalizeInputZip(
  inputZipPath,
  stagingOrOutputPath,
  outputPathOrOptions = {},
  trailingOptions = {}
) {
  const lifecycleShape = typeof outputPathOrOptions === 'string';
  const outputZipPath = lifecycleShape ? outputPathOrOptions : stagingOrOutputPath;
  const options = lifecycleShape ? trailingOptions : outputPathOrOptions;
  throwIfAborted(options.signal);
  const temporaryRoot = lifecycleShape ? null : await mkdtemp(join(tmpdir(), 'argus-input-zip-'));
  const extractionDirectory = lifecycleShape
    ? resolve(stagingOrOutputPath)
    : join(temporaryRoot, 'files');
  try {
    const extracted = await extractZipSafely(inputZipPath, extractionDirectory, {
      ...options,
      maxEntries: Math.min(options.maxEntries ?? 99, 99),
      rootFilesOnly: true,
      normalizeNames: true
    });
    const validated = await validateImageFiles(
      extracted.entries.map((entry) => ({ path: entry.path, archiveName: entry.name })),
      { minImages: 1, maxImages: 99 }
    );
    const written = await writeDeterministicZip(
      validated.images.map((image) => ({ path: image.path, archiveName: image.filename })),
      outputZipPath,
      { signal: options.signal }
    );
    return {
      ...written,
      images: validated.images,
      warnings: validated.warnings
    };
  } finally {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function loadYauzl(injected) {
  if (injected?.open) return injected;
  try {
    const loaded = require('yauzl');
    if (loaded?.open) return loaded;
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
  }
  throw new Error(
    'archive extraction requires the "yauzl" dependency; install it in the Argus skill package.'
  );
}

function resolveLimits(options) {
  const limits = {};
  for (const [name, fallback] of Object.entries(DEFAULT_LIMITS)) {
    const value = name === 'maxUncompressedBytes'
      ? options[name] ?? options.maxExpandedBytes ?? fallback
      : options[name] ?? fallback;
    if ((value !== Infinity && !Number.isFinite(value)) || value < 0) {
      throw new Error(`${name} must be a non-negative number or Infinity.`);
    }
    limits[name] = value;
  }
  if (limits.maxEntries < 1 || limits.maxEntries > 0xffff) {
    throw new Error('maxEntries must be between 1 and 65535.');
  }
  if (limits.maxCompressionRatio < 1) {
    throw new Error('maxCompressionRatio must be at least 1.');
  }
  return limits;
}

async function scanZip(zipPath, yauzl, options) {
  const zip = await openZip(yauzl, zipPath);
  return new Promise((resolvePromise, rejectPromise) => {
    const entries = [];
    const seen = new Map();
    let totalCompressedBytes = 0;
    let totalUncompressedBytes = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      zip.close();
      rejectPromise(error);
    };

    zip.on('error', fail);
    zip.on('entry', (entry) => {
      try {
        throwIfAborted(options.signal);
        if (entries.length >= options.maxEntries) {
          throw new Error(`ZIP entry count exceeds limit of ${options.maxEntries}.`);
        }
        const descriptor = inspectZipEntry(entry, {
          rootFilesOnly: options.rootFilesOnly,
          normalizeNames: options.normalizeNames
        });
        assertNoPathCollision(descriptor, entries, seen);
        totalCompressedBytes += descriptor.compressedSize;
        totalUncompressedBytes += descriptor.uncompressedSize;
        if (totalCompressedBytes > options.maxCompressedBytes) {
          throw new Error(`ZIP entries exceed compressed-size limit of ${options.maxCompressedBytes} bytes.`);
        }
        if (totalUncompressedBytes > options.maxUncompressedBytes) {
          throw new Error(`ZIP entries exceed expanded-size limit of ${options.maxUncompressedBytes} bytes.`);
        }
        if (descriptor.uncompressedSize > options.maxEntryUncompressedBytes) {
          throw new Error(
            `ZIP entry "${descriptor.name}" exceeds per-entry expanded-size limit ` +
              `of ${options.maxEntryUncompressedBytes} bytes.`
          );
        }
        const ratio = descriptor.uncompressedSize / Math.max(1, descriptor.compressedSize);
        if (ratio > options.maxCompressionRatio) {
          throw new Error(
            `ZIP entry "${descriptor.name}" exceeds compression-ratio limit of ${options.maxCompressionRatio}.`
          );
        }
        entries.push(descriptor);
        zip.readEntry();
      } catch (error) {
        fail(error);
      }
    });
    zip.on('end', () => {
      if (settled) return;
      settled = true;
      resolvePromise({ entries, totalCompressedBytes, totalUncompressedBytes });
    });
    zip.readEntry();
  });
}

function inspectZipEntry(entry, options) {
  if ((entry.generalPurposeBitFlag & ZIP_ENCRYPTED_FLAG) !== 0) {
    throw new Error(`Encrypted ZIP entries are not supported: "${entry.fileName}".`);
  }
  if (![ZIP_STORE_METHOD, ZIP_DEFLATE_METHOD].includes(entry.compressionMethod)) {
    throw new Error(
      `Unsupported ZIP compression method ${entry.compressionMethod} for "${entry.fileName}".`
    );
  }
  const directory = entry.fileName.endsWith('/');
  const name = normalizeZipEntryPath(entry.fileName, {
    directory,
    normalizeNames: options.normalizeNames
  });
  if (options.rootFilesOnly && (directory || name.includes('/'))) {
    throw new Error(`Argus input ZIP may contain only image files at the archive root: "${entry.fileName}".`);
  }

  const madeBy = (entry.versionMadeBy >>> 8) & 0xff;
  const mode = madeBy === 3 ? (entry.externalFileAttributes >>> 16) & 0xffff : 0;
  const fileType = mode & 0o170000;
  if (fileType === 0o120000) {
    throw new Error(`ZIP symbolic links are not allowed: "${entry.fileName}".`);
  }
  if (fileType && fileType !== 0o100000 && fileType !== 0o040000) {
    throw new Error(`ZIP special files are not allowed: "${entry.fileName}".`);
  }
  if (directory && fileType === 0o100000) {
    throw new Error(`ZIP entry type disagrees with directory name: "${entry.fileName}".`);
  }
  if (!directory && fileType === 0o040000) {
    throw new Error(`ZIP entry type disagrees with file name: "${entry.fileName}".`);
  }
  if (
    /[^\x00-\x7f]/u.test(entry.fileName) &&
    (entry.generalPurposeBitFlag & ZIP_UTF8_FLAG) === 0
  ) {
    throw new Error(`Non-ASCII ZIP entry names must be UTF-8 flagged: "${entry.fileName}".`);
  }

  return {
    rawName: entry.fileName,
    name,
    directory,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    crc32: entry.crc32 >>> 0,
    compressionMethod: entry.compressionMethod
  };
}

function assertNoPathCollision(descriptor, entries, seen) {
  const folded = caseFold(descriptor.name);
  const prior = seen.get(folded);
  if (prior) {
    throw new Error(`Duplicate or case-folding ZIP path collision: "${prior}" and "${descriptor.name}".`);
  }
  const components = descriptor.name.split('/');
  for (let index = 1; index < components.length; index += 1) {
    const parent = components.slice(0, index).join('/');
    const parentEntry = seen.get(caseFold(parent));
    if (parentEntry && !entries.find((entry) => entry.name === parentEntry)?.directory) {
      throw new Error(`ZIP file/directory path collision at "${parent}".`);
    }
  }
  if (!descriptor.directory) {
    const childPrefix = `${folded}/`;
    for (const existing of seen.keys()) {
      if (existing.startsWith(childPrefix)) {
        throw new Error(`ZIP file/directory path collision at "${descriptor.name}".`);
      }
    }
  }
  seen.set(folded, descriptor.name);
}

async function extractScannedEntries(zipPath, stage, descriptors, yauzl, limits) {
  const zip = await openZip(yauzl, zipPath);
  return new Promise((resolvePromise, rejectPromise) => {
    let index = 0;
    let actualTotal = 0;
    let settled = false;
    const extracted = [];

    const fail = (error) => {
      if (settled) return;
      settled = true;
      zip.close();
      rejectPromise(error);
    };

    zip.on('error', fail);
    zip.on('entry', (entry) => {
      try {
        throwIfAborted(limits.signal);
      } catch (error) {
        fail(error);
        return;
      }
      const descriptor = descriptors[index];
      index += 1;
      if (!descriptor || entry.fileName !== descriptor.rawName) {
        fail(new Error('ZIP central directory changed between validation and extraction.'));
        return;
      }
      void extractOneEntry(zip, entry, descriptor, stage, limits, () => actualTotal)
        .then((result) => {
          actualTotal += result.bytes;
          if (actualTotal > limits.maxUncompressedBytes) {
            throw new Error(`ZIP actual expanded bytes exceed ${limits.maxUncompressedBytes}.`);
          }
          extracted.push(result);
          zip.readEntry();
        })
        .catch(fail);
    });
    zip.on('end', () => {
      if (settled) return;
      settled = true;
      if (index !== descriptors.length) {
        rejectPromise(new Error('ZIP entry count changed between validation and extraction.'));
        return;
      }
      resolvePromise({ entries: extracted, totalUncompressedBytes: actualTotal });
    });
    zip.readEntry();
  });
}

async function extractOneEntry(zip, entry, descriptor, stage, limits, getActualTotal) {
  const target = resolveInside(stage, descriptor.name);
  if (descriptor.directory) {
    await mkdir(target, { recursive: true, mode: 0o700 });
    return { name: descriptor.name, directory: true, bytes: 0, crc32: 0, path: target };
  }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  let bytes = 0;
  let crc = 0xffffffff;
  await streamEntryToFile(zip, entry, target, limits.signal, (chunk) => {
      throwIfAborted(limits.signal);
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > descriptor.uncompressedSize || bytes > limits.maxEntryUncompressedBytes) {
        throw new Error(`ZIP entry "${descriptor.name}" expanded beyond its declared or configured limit.`);
      }
      if (getActualTotal() + bytes > limits.maxUncompressedBytes) {
        throw new Error(`ZIP actual expanded bytes exceed ${limits.maxUncompressedBytes}.`);
      }
      crc = updateCrc32(crc, buffer);
  });
  crc = (crc ^ 0xffffffff) >>> 0;
  if (bytes !== descriptor.uncompressedSize) {
    throw new Error(
      `ZIP entry "${descriptor.name}" expanded to ${bytes} bytes, expected ${descriptor.uncompressedSize}.`
    );
  }
  if (crc !== descriptor.crc32) {
    throw new Error(`ZIP entry CRC32 mismatch for "${descriptor.name}".`);
  }
  return { name: descriptor.name, directory: false, bytes, crc32: crc, path: target };
}

function streamEntryToFile(zip, entry, target, signal, onChunk) {
  return new Promise((resolvePromise, rejectPromise) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      const validator = new Transform({
        transform(chunk, encoding, callback) {
          try {
            onChunk(chunk);
            callback(null, chunk);
          } catch (validationError) {
            callback(validationError);
          }
        }
      });
      const writer = createWriteStream(target, { flags: 'wx', mode: 0o600 });
      void pipeline(stream, validator, writer, { signal }).then(resolvePromise, rejectPromise);
    });
  });
}

function openZip(yauzl, path) {
  return new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(path, {
      lazyEntries: true,
      autoClose: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true
    }, (error, zip) => {
      if (error) rejectPromise(error);
      else resolvePromise(zip);
    });
  });
}

function normalizeRootFileName(value) {
  const normalized = normalizeZipEntryPath(value, { directory: false, normalizeNames: true });
  if (normalized.includes('/')) {
    throw new Error(`Deterministic input ZIP entries must be root-level files: "${value}".`);
  }
  return normalized;
}

function normalizeZipEntryPath(value, { directory, normalizeNames }) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('ZIP entry name must be a non-empty string.');
  }
  if (value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/u.test(value)) {
    throw new Error(`ZIP entry path is absolute or platform-dependent: "${value}".`);
  }
  if (CONTROL_CHARACTER.test(value)) {
    throw new Error(`ZIP entry path contains a control character: ${JSON.stringify(value)}.`);
  }
  const withoutTrailingSlash = directory ? value.slice(0, -1) : value;
  const components = withoutTrailingSlash.split('/');
  if (components.length === 0 || components.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`ZIP entry path contains an empty or traversal component: "${value}".`);
  }
  const normalizedComponents = components.map((part) => part.normalize('NFC'));
  if (!normalizeNames && normalizedComponents.some((part, index) => part !== components[index])) {
    throw new Error(`ZIP entry path must already use NFC Unicode normalization: "${value}".`);
  }
  const normalized = normalizedComponents.join('/');
  if (Buffer.byteLength(normalized, 'utf8') > 0xffff) {
    throw new Error(`ZIP entry path exceeds the ZIP filename limit: "${value}".`);
  }
  return normalized;
}

function resolveInside(root, relativeName) {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, ...relativeName.split('/'));
  const rel = relative(resolvedRoot, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(target) === resolvedRoot) {
    throw new Error(`ZIP entry escapes or aliases the extraction root: "${relativeName}".`);
  }
  return target;
}

async function assertDestinationReplaceable(destination) {
  try {
    const stat = await lstat(destination);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`ZIP extraction destination must be a directory path: ${destination}`);
    }
    const children = await readdir(destination);
    if (children.length !== 0) {
      throw new Error(`ZIP extraction destination must not already contain files: ${destination}`);
    }
    await rm(destination, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function assertDiskCapacity(path, expandedBytes, reserveBytes, options) {
  let available;
  if (options.availableBytes !== undefined) {
    available = toNonNegativeBigInt(options.availableBytes, 'availableBytes');
  } else if (options.getAvailableBytes) {
    const probed = await options.getAvailableBytes(path);
    available = toNonNegativeBigInt(probed, 'getAvailableBytes result');
  } else {
    const stats = await statfs(path, { bigint: true });
    available = stats.bavail * stats.bsize;
  }
  const required = BigInt(Math.ceil(expandedBytes)) + BigInt(Math.ceil(reserveBytes));
  if (available < required) {
    throw new Error(
      `Insufficient disk space for ZIP extraction: need ${required} bytes, have ${available} bytes.`
    );
  }
}

function buildLocalFileHeader(entry) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(ZIP_LOCAL_FILE_HEADER, 0);
  header.writeUInt16LE(45, 4);
  header.writeUInt16LE(ZIP_UTF8_FLAG, 6);
  header.writeUInt16LE(ZIP_STORE_METHOD, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(DOS_1980_01_01, 12);
  header.writeUInt32LE(entry.crc32, 14);
  header.writeUInt32LE(UINT32_MAX, 18);
  header.writeUInt32LE(UINT32_MAX, 22);
  header.writeUInt16LE(entry.nameBytes.length, 26);
  header.writeUInt16LE(20, 28);
  return header;
}

function buildCentralDirectoryHeader(entry, localOffset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_HEADER, 0);
  header.writeUInt16LE(0x032d, 4);
  header.writeUInt16LE(45, 6);
  header.writeUInt16LE(ZIP_UTF8_FLAG, 8);
  header.writeUInt16LE(ZIP_STORE_METHOD, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(DOS_1980_01_01, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(UINT32_MAX, 20);
  header.writeUInt32LE(UINT32_MAX, 24);
  header.writeUInt16LE(entry.nameBytes.length, 28);
  header.writeUInt16LE(28, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  header.writeUInt32LE(UINT32_MAX, 42);
  return header;
}

function buildZip64LocalExtra(size) {
  const extra = Buffer.alloc(20);
  extra.writeUInt16LE(ZIP64_EXTRA_FIELD, 0);
  extra.writeUInt16LE(16, 2);
  extra.writeBigUInt64LE(BigInt(size), 4);
  extra.writeBigUInt64LE(BigInt(size), 12);
  return extra;
}

function buildZip64CentralExtra(size, localOffset) {
  const extra = Buffer.alloc(28);
  extra.writeUInt16LE(ZIP64_EXTRA_FIELD, 0);
  extra.writeUInt16LE(24, 2);
  extra.writeBigUInt64LE(BigInt(size), 4);
  extra.writeBigUInt64LE(BigInt(size), 12);
  extra.writeBigUInt64LE(BigInt(localOffset), 20);
  return extra;
}

function buildZip64EndOfCentralDirectory(entryCount, centralSize, centralOffset) {
  const end = Buffer.alloc(56);
  end.writeUInt32LE(ZIP64_END_OF_CENTRAL_DIRECTORY, 0);
  end.writeBigUInt64LE(44n, 4);
  end.writeUInt16LE(0x032d, 12);
  end.writeUInt16LE(45, 14);
  end.writeUInt32LE(0, 16);
  end.writeUInt32LE(0, 20);
  end.writeBigUInt64LE(BigInt(entryCount), 24);
  end.writeBigUInt64LE(BigInt(entryCount), 32);
  end.writeBigUInt64LE(BigInt(centralSize), 40);
  end.writeBigUInt64LE(BigInt(centralOffset), 48);
  return end;
}

function buildZip64EndLocator(zip64EndOffset) {
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR, 0);
  locator.writeUInt32LE(0, 4);
  locator.writeBigUInt64LE(BigInt(zip64EndOffset), 8);
  locator.writeUInt32LE(1, 16);
  return locator;
}

function buildEndOfCentralDirectory() {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(0xffff, 8);
  end.writeUInt16LE(0xffff, 10);
  end.writeUInt32LE(UINT32_MAX, 12);
  end.writeUInt32LE(UINT32_MAX, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

async function crc32File(path, signal) {
  const handle = await open(path, 'r');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0;
  let crc = 0xffffffff;
  try {
    while (true) {
      throwIfAborted(signal);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      crc = updateCrc32(crc, buffer.subarray(0, bytesRead));
      position += bytesRead;
      assertSafeArchiveNumber(position, `size of ${path}`);
    }
  } finally {
    await handle.close();
  }
  return { size: position, crc32: (crc ^ 0xffffffff) >>> 0 };
}

async function copyFileAt(path, output, outputOffset, expectedSize, expectedCrc, signal) {
  const input = await open(path, 'r');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let inputOffset = 0;
  let targetOffset = outputOffset;
  let crc = 0xffffffff;
  try {
    while (true) {
      throwIfAborted(signal);
      const { bytesRead } = await input.read(buffer, 0, buffer.length, inputOffset);
      if (bytesRead === 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      crc = updateCrc32(crc, chunk);
      await writeAllAt(output, chunk, targetOffset);
      inputOffset += bytesRead;
      targetOffset += bytesRead;
    }
  } finally {
    await input.close();
  }
  if (inputOffset !== expectedSize) {
    throw new Error(`ZIP source changed while it was being archived: ${path}`);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  if (crc !== expectedCrc) {
    throw new Error(`ZIP source changed while it was being archived: ${path}`);
  }
  return targetOffset;
}

async function writeAllAt(handle, buffer, position) {
  let written = 0;
  while (written < buffer.length) {
    const result = await handle.write(buffer, written, buffer.length - written, position + written);
    if (result.bytesWritten <= 0) throw new Error('Filesystem write made no progress.');
    written += result.bytesWritten;
  }
}

const CRC32_TABLE = buildCrc32Table();

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function updateCrc32(crc, buffer) {
  let value = crc >>> 0;
  for (const byte of buffer) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
}

function caseFold(value) {
  return value.normalize('NFC').toLocaleLowerCase('und');
}

async function sha256File(path, signal) {
  const handle = await open(path, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

function toNonNegativeBigInt(value, label) {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error(`${label} must be non-negative.`);
    return value;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number or bigint.`);
  }
  return BigInt(Math.floor(value));
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error('Operation aborted.');
  error.name = 'AbortError';
  throw error;
}

function assertSafeArchiveNumber(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`ZIP64 ${label} exceeds JavaScript's safe integer range.`);
  }
}
