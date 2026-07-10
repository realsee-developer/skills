import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function classifyReleaseTag(tag) {
  const match = String(tag ?? '').match(
    /^v\d+\.\d+\.\d+(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u
  );
  if (!match) {
    throw new Error(`release tag must be v<major>.<minor>.<patch> with an optional prerelease suffix (got: ${tag})`);
  }
  const prerelease = Boolean(match[1]);
  return {
    channel: prerelease ? 'preview' : 'stable',
    prerelease,
    releaseFlag: prerelease ? '--prerelease' : '--latest'
  };
}

async function main(tag) {
  const release = classifyReleaseTag(tag);
  const output = [
    `channel=${release.channel}`,
    `prerelease=${release.prerelease}`,
    `release_flag=${release.releaseFlag}`
  ].join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, output);
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]).catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
