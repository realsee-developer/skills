export const ARKCLAW_ENTRYPOINT = 'scripts/run-argus.mjs';

export function applyArkclawOverlay(source, path) {
  if (path !== ARKCLAW_ENTRYPOINT) return source;

  const needle = 'env: process.env,';
  const replacement = "env: { ...process.env, REALSEE_REGION: 'cn' },";
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`expected exactly one ${needle} in ${ARKCLAW_ENTRYPOINT}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

