import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_RUN_DIR_ATTEMPTS = 5;

export async function createRunWorkspace(root, now = new Date()) {
  const absoluteRoot = resolve(root);
  await mkdir(absoluteRoot, { recursive: true });

  const timestamp = formatUtcTimestamp(now);

  for (let attempt = 0; attempt < MAX_RUN_DIR_ATTEMPTS; attempt += 1) {
    const runDir = join(absoluteRoot, `${timestamp}-${randomUUID()}`);
    try {
      await mkdir(runDir);
      return runDir;
    } catch (error) {
      if (error?.code !== 'EEXIST' || attempt === MAX_RUN_DIR_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw new Error('failed to create run workspace');
}

function formatUtcTimestamp(date) {
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  const second = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}
