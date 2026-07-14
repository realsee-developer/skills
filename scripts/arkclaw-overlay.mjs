export const ARKCLAW_ENTRYPOINT = 'scripts/run-argus.mjs';
export const ARKCLAW_EXAMPLE_DOWNLOADER = 'scripts/download-examples.mjs';
export const ARKCLAW_SKILL = 'SKILL.md';
export const ARKCLAW_README = 'README.md';
export const ARKCLAW_README_ZH = 'README.zh-CN.md';
export const ARKCLAW_EXAMPLES_GUIDE = 'references/examples.md';
export const ARKCLAW_EXAMPLES_GUIDE_ZH = 'references/examples.zh-CN.md';
export const ARKCLAW_OVERLAY_PATHS = new Set([
  ARKCLAW_ENTRYPOINT,
  ARKCLAW_EXAMPLE_DOWNLOADER,
  ARKCLAW_SKILL,
  ARKCLAW_README,
  ARKCLAW_README_ZH,
  ARKCLAW_EXAMPLES_GUIDE,
  ARKCLAW_EXAMPLES_GUIDE_ZH
]);

export function applyArkclawOverlay(source, path) {
  if (path === ARKCLAW_ENTRYPOINT) {
    return replaceExactlyOnce(
      source,
      'env: process.env,',
      "env: { ...process.env, REALSEE_REGION: 'cn' },",
      path
    );
  }
  if (path === ARKCLAW_EXAMPLE_DOWNLOADER) {
    return replaceExactlyOnce(
      source,
      "const allowedRegions = ['cn', 'global'];",
      "const allowedRegions = ['cn'];",
      path
    );
  }
  if (path === ARKCLAW_SKILL) {
    return replaceExactlyOnce(
      replaceExactlyOnce(
        source,
        'ask them to choose a region and an absolute output directory',
        'ask them for an absolute output directory and use the CN set',
        path
      ),
      'Use `global` instead of `cn` when appropriate; the CN-only Arkclaw distribution only allows `cn`.',
      'This CN-only Arkclaw distribution only allows `cn`; do not offer or attempt a Global download.',
      path
    );
  }
  if (path === ARKCLAW_README) {
    return replaceExactlyOnce(
      replaceExactlyOnce(
        source,
        'Use `global` when it matches `REALSEE_REGION`.',
        'This CN-only Arkclaw build accepts only `cn`; use a canonical, Claude, Codex, or `npx skills` installation for the Global set.',
        path
      ),
      '- `REALSEE_REGION` (`global` or `cn`)',
      '- `REALSEE_REGION` (forced to `cn` by this Arkclaw build)',
      path
    );
  }
  if (path === ARKCLAW_README_ZH) {
    return replaceExactlyOnce(
      replaceExactlyOnce(
        source,
        '当 `REALSEE_REGION` 为 `global` 时改用 `global`。',
        '此 CN-only Arkclaw 构建仅接受 `cn`；Global 示例请使用 canonical、Claude、Codex 或 `npx skills` 安装。',
        path
      ),
      '- `REALSEE_REGION`（`global` 或 `cn`）',
      '- `REALSEE_REGION`（此 Arkclaw 构建强制为 `cn`）',
      path
    );
  }
  if (path === ARKCLAW_EXAMPLES_GUIDE) {
    return replaceExactlyOnce(
      source,
      'Use `--region global` for the Global download.',
      'This CN-only Arkclaw distribution cannot download the Global set; use a canonical, Claude, Codex, or `npx skills` installation for `--region global`.',
      path
    );
  }
  if (path === ARKCLAW_EXAMPLES_GUIDE_ZH) {
    return replaceExactlyOnce(
      source,
      'Global 下载改用 `--region global`。',
      '此 CN-only Arkclaw 分发不能下载 Global 示例；如需 `--region global`，请使用 canonical、Claude、Codex 或 `npx skills` 安装。',
      path
    );
  }
  return source;
}

function replaceExactlyOnce(source, needle, replacement, path) {
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`expected exactly one ${needle} in ${path}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}
