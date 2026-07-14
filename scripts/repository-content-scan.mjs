import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DEFAULT_IGNORED_ENTRIES = new Set(['.git']);
const DEFAULT_IGNORED_DIRECTORIES = new Set(['node_modules']);
const STREAM_CHUNK_BYTES = 64 * 1024;

export async function* walkRepositoryFiles(root, options = {}) {
  const ignoredEntries = new Set(options.ignoredEntries ?? DEFAULT_IGNORED_ENTRIES);
  const ignoredDirectories = new Set(options.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES);
  yield* walk(root);

  async function* walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (ignoredEntries.has(entry.name) ||
          (entry.isDirectory() && ignoredDirectories.has(entry.name))) continue;
      const path = join(directory, entry.name);
      const stats = await lstat(path);
      const relativePath = toPortablePath(relative(root, path));
      await options.onEntry?.({ path, relativePath, stats });
      if (stats.isDirectory()) yield* walk(path);
      if (stats.isFile()) yield { path, relativePath };
    }
  }
}

export async function scanFile(file, createMatchers, options = {}) {
  const matchers = createMatchers();
  const matches = new Set();
  const stream = createReadStream(file, { highWaterMark: options.highWaterMark ?? STREAM_CHUNK_BYTES });
  for await (const chunk of stream) {
    const text = chunk.toString('latin1');
    for (const matcher of matchers) {
      matcher.push(text);
      for (const label of matcher.matches) matches.add(label);
    }
    if (options.stopAfterFirst && matches.size > 0) break;
  }
  for (const matcher of matchers) {
    matcher.finish?.();
    for (const label of matcher.matches) matches.add(label);
  }
  return [...matches];
}

export function createLiteralMatcher(entries) {
  const normalized = entries.map((entry) => {
    const [needle, label = needle] = Array.isArray(entry) ? entry : [entry, entry];
    return { needle, label };
  });
  const maxNeedleLength = Math.max(0, ...normalized.map(({ needle }) => needle.length));
  let tail = '';
  return {
    matches: new Set(),
    push(chunk) {
      const text = tail + chunk;
      for (const { needle, label } of normalized) {
        if (text.includes(needle)) this.matches.add(label);
      }
      tail = maxNeedleLength > 1 ? text.slice(-(maxNeedleLength - 1)) : '';
    }
  };
}

export function createSecretMatchers() {
  return [createKeyedTokenMatcher(), createAuthorizationMatcher(), createSignedUrlMatcher()];
}

function createKeyedTokenMatcher() {
  const prefixPattern = /\b(?:access[_-]?token|upload[_-]?token|tmpSecret(?:Key|Id))/giu;
  const matches = new Set();
  let mode = 'search';
  let tail = '';
  let separatorSeen = false;
  let tokenLength = 0;
  let label = null;
  let minimumLength = 0;

  return {
    matches,
    push(chunk) {
      let text = mode === 'search' ? tail + chunk : chunk;
      let index = 0;
      tail = '';
      while (index < text.length) {
        if (mode === 'search') {
          prefixPattern.lastIndex = index;
          const found = prefixPattern.exec(text);
          if (!found) {
            tail = text.slice(-32);
            return;
          }
          const prefix = found[0].toLowerCase();
          label = prefix.startsWith('access')
            ? 'access token'
            : prefix.startsWith('upload')
              ? 'upload token'
              : 'temporary secret';
          minimumLength = label === 'temporary secret' ? 8 : 16;
          separatorSeen = false;
          tokenLength = 0;
          mode = 'separator';
          index = found.index + found[0].length;
          continue;
        }

        if (mode === 'separator') {
          if (isSecretSeparator(text[index])) {
            separatorSeen = true;
            index += 1;
            continue;
          }
          if (separatorSeen && isTokenCharacter(text[index])) {
            tokenLength = 1;
            index += 1;
            mode = 'token';
            continue;
          }
          mode = 'search';
          continue;
        }

        if (mode === 'token') {
          if (isTokenCharacter(text[index])) {
            tokenLength += 1;
            index += 1;
            if (tokenLength >= minimumLength) {
              matches.add(label);
              mode = 'skip-token';
            }
            continue;
          }
          mode = 'search';
          continue;
        }

        if (isTokenCharacter(text[index])) {
          index += 1;
        } else {
          mode = 'search';
        }
      }
    }
  };
}

function createAuthorizationMatcher() {
  const prefixPattern = /Authorization:/giu;
  const bearer = 'bearer';
  const matches = new Set();
  let mode = 'search';
  let tail = '';
  let bearerIndex = 0;
  let whitespaceSeen = false;

  return {
    matches,
    push(chunk) {
      const text = mode === 'search' ? tail + chunk : chunk;
      let index = 0;
      tail = '';
      while (index < text.length) {
        if (mode === 'search') {
          prefixPattern.lastIndex = index;
          const found = prefixPattern.exec(text);
          if (!found) {
            tail = text.slice(-13);
            return;
          }
          mode = 'before-bearer';
          index = found.index + found[0].length;
          continue;
        }

        if (mode === 'before-bearer') {
          if (isWhitespace(text[index])) {
            index += 1;
            continue;
          }
          if (text[index].toLowerCase() === bearer[0]) {
            bearerIndex = 1;
            index += 1;
            mode = 'bearer';
            continue;
          }
          mode = 'search';
          continue;
        }

        if (mode === 'bearer') {
          if (text[index].toLowerCase() !== bearer[bearerIndex]) {
            mode = 'search';
            continue;
          }
          bearerIndex += 1;
          index += 1;
          if (bearerIndex === bearer.length) {
            whitespaceSeen = false;
            mode = 'after-bearer';
          }
          continue;
        }

        if (mode === 'after-bearer') {
          if (isWhitespace(text[index])) {
            whitespaceSeen = true;
            index += 1;
            continue;
          }
          if (whitespaceSeen && isTokenCharacter(text[index])) {
            matches.add('authorization bearer token');
            index += 1;
            mode = 'skip-token';
            continue;
          }
          mode = 'search';
          continue;
        }

        if (isTokenCharacter(text[index])) {
          index += 1;
        } else {
          mode = 'search';
        }
      }
    }
  };
}

function createSignedUrlMatcher() {
  const schemePattern = /https?:\/\//giu;
  const markers = [
    'x-amz-', 'signature=', 'sign=', 'token=', 'q-ak=', 'q-signature=', 'q-sign-algorithm='
  ];
  const maxMarkerLength = Math.max(...markers.map((marker) => marker.length));
  const matches = new Set();
  let mode = 'search';
  let tail = '';
  let sawQuery = false;
  let markerTail = '';

  return {
    matches,
    push(chunk) {
      const text = mode === 'search' ? tail + chunk : chunk;
      let index = 0;
      tail = '';
      while (index < text.length) {
        if (mode === 'search') {
          schemePattern.lastIndex = index;
          const found = schemePattern.exec(text);
          if (!found) {
            tail = text.slice(-7);
            return;
          }
          mode = 'url';
          sawQuery = false;
          markerTail = '';
          index = found.index + found[0].length;
          continue;
        }

        const character = text[index];
        if (isUrlDelimiter(character)) {
          mode = 'search';
          index += 1;
          continue;
        }
        if (character === '?') sawQuery = true;
        if (sawQuery) {
          markerTail = (markerTail + character.toLowerCase()).slice(-maxMarkerLength);
          if (markers.some((marker) => markerTail.endsWith(marker))) {
            matches.add('signed url');
          }
        }
        index += 1;
      }
    }
  };
}

function isSecretSeparator(character) {
  return character === '"' || character === "'" || character === ':' || character === '=' ||
    isWhitespace(character);
}

function isWhitespace(character) {
  return /\s/u.test(character);
}

function isTokenCharacter(character) {
  return /[A-Za-z0-9._-]/u.test(character);
}

function isUrlDelimiter(character) {
  return isWhitespace(character) || character === '"' || character === "'" ||
    character === '<' || character === '>';
}

function toPortablePath(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}
