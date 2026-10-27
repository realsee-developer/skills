#!/usr/bin/env node
import { safeReportText } from '../src/sanitizer.mjs';

const usage = 'node <skillDir>/scripts/inspect-result.mjs --workspace <run-dir> [--json] [--write-report]\nOffline: revalidate collected artifacts; --write-report saves verification.json in the workspace.\nThis checks the artifact contract, not visual reconstruction quality.';
const args = process.argv.slice(2);
const json = args.includes('--json');

try {
  const options = {};
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--workspace', '--json', '--write-report', '--help'].includes(flag) || seen.has(flag)) {
      throw new Error('Invalid or repeated option. Use --help for supported options.');
    }
    seen.add(flag);
    if (flag === '--workspace') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('--workspace requires a path.');
      options.workspace = value;
    }
  }
  if (seen.has('--help')) {
    process.stdout.write(`${json ? JSON.stringify({ usage }) : usage}\n`);
  } else {
    if (!options.workspace) throw new Error('--workspace is required.');
    const { inspectArgusResult } = await import('../src/result-report.mjs');
    const report = await inspectArgusResult(options.workspace, { writeReport: seen.has('--write-report') });
    if (json) process.stdout.write(`${JSON.stringify(report)}\n`);
    else {
      process.stdout.write(`Phase: ${report.phase}\nTask: ${report.task_status}\nResult: ${report.result_status}\nArtifact contract: ${report.validation.status}\nVisual quality: ${report.visual_quality}\nWorkspace: ${report.workspace_dir}\n`);
      process.stdout.write(`Artifacts: ${report.artifacts.point_cloud ? 1 : 0} GLB, ${report.artifacts.depth_maps.count} depth maps, ${report.artifacts.poses.count} poses, ${report.artifacts.intrinsics.count} intrinsics\n`);
      if (report.report_path) process.stdout.write(`Report: ${report.report_path}\n`);
      if (report.error) process.stdout.write(`Error: ${report.error.code}: ${report.error.message}\n`);
    }
    for (const warning of report.warnings) {
      process.stderr.write(`WARNING: ${typeof warning === 'string' ? warning : JSON.stringify(warning)}\n`);
    }
    if (report.result_status === 'error') process.exitCode = 2;
  }
} catch (error) {
  const message = safeReportText(error?.message ?? error);
  if (json) {
    process.stdout.write(`${JSON.stringify({ schema_version: 1, skill: 'argus', validation: { scope: 'artifact_contract', status: 'failed' }, visual_quality: 'not_assessed', error: { code: 'INSPECTION_FAILED', message } })}\n`);
  } else process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
