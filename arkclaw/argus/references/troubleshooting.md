# Troubleshooting

[English](troubleshooting.md) | [简体中文](troubleshooting.zh-CN.md)

## Missing credentials or region

Argus requires `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION` (`global` or `cn`). Never place credential values in command arguments, logs, issue reports, `state.json`, or `result.json`.

## Input rejected before upload

Provide either repeated `--image` arguments or one `--zip`, never both. The batch must contain 1–99 root-level JPEG, PNG, or WebP RGB8 images with exact 2:1 dimensions. A 1:1 square image belongs to the legacy workflow; pin the Skill to `v1.0.2` if that behavior is required.

Nested paths, path traversal, control characters, duplicate stems, and Unicode/case-fold filename collisions are rejected. A resolution below 2048×1024 produces a warning but is still accepted.

## `submission_unknown`

The submit response was lost after the request may have reached Gateway. Do not rerun `start` against the same input: submission is not automatically retried because that could create a duplicate remote task. Preserve the run directory for investigation.

## Task still queued or processing

The CLI does not launch a detached poller. Run `status --workspace <run-dir> --json` again later. `status` makes one remote query per invocation.

## Result URL expired

Run `collect` again. It refreshes task info and uses the current temporary URL in memory. Signed URLs are deliberately not saved to disk.

## Partial result

A partial reconstruction exits with code 0 but reports `result_status: partial`, an explicit warning, and `missing_ids`. Use only the artifact IDs listed in the local result index and algorithm manifest.

## Invalid output archive

The collector rejects unsafe paths, bad CRCs, incomplete references, invalid manifest variants, and files whose GLB or EXR magic does not match. It keeps no partially extracted directory as a completed result; retry `collect` only when the failure is classified as retryable.
