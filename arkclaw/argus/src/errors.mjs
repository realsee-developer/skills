export function failure({
  stage,
  reason,
  workspaceDir,
  region,
  remoteCode = null,
  nextStep,
  elapsedMs = 0
}) {
  return {
    status: 'failed',
    skill: 'argus',
    region: region ?? null,
    stage,
    reason,
    workspace_dir: workspaceDir ?? null,
    elapsed_ms: elapsedMs,
    error_detail: {
      remote_code: remoteCode,
      retryable: false,
      next_step: nextStep ?? null
    }
  };
}
