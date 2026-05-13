import { writeFile, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function writeJsonAtomic(path, value) {
  const dir = dirname(path);
  const tempPath = join(dir, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  const json = `${JSON.stringify(value, null, 2)}\n`;

  await writeFile(tempPath, json, 'utf8');
  await rename(tempPath, path);
}
