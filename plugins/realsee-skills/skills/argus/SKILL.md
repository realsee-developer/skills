---
name: argus
description: Use this skill to process one to 99 local exact 2:1 equirectangular panorama images with Realsee Argus, producing depth maps, a merged GLB point cloud, camera poses, optional intrinsics, and a validated local output index. Trigger for Argus panorama reconstruction, Argus ZIP input, explicit Argus lifecycle requests, or Argus installation and collected-result checks. Do not trigger for panorama editing or stitching, arbitrary-photo 3D generation, standalone GLB inspection, or research-only questions.
compatibility: Requires a POSIX shell, Node.js 22+, npm 10+, npm registry access, and network access to app-gateway.realsee.ai or app-gateway.realsee.cn
metadata:
  version: "2.4.0"
  documentation: README.md
---

# argus

Run Argus through `scripts/run-argus.mjs`. `<skillDir>` below means the directory containing this file.

Argus uploads inputs to a remote service. Never print or log credentials, upload tokens, presigned URLs, or raw provider errors. Keep tokens and signed URLs out of persistent state.

## Match the requested outcome

| Request | Finish condition |
| --- | --- |
| Check an installed Argus setup | Run `check-local.mjs`; report missing prerequisites. |
| Verify a collected Argus result | Run `inspect-result.mjs` for that workspace. |
| Run the reconstruction, official examples, or a complete verification | Submit once, query until terminal, collect, and inspect the result. Continue without requiring a new user request at each step. |
| Start or submit and return immediately | Submit once; return `workspace_dir` and current status. |
| Check status | Perform one `status` request. |
| Collect or continue an existing task | Reuse its `workspace_dir`; query if needed, collect at terminal, and inspect. |

## 1. Ensure runtime dependencies

For setup checks or before the first live command, run from any working directory:

```bash
node <skillDir>/scripts/check-local.mjs --json
```

The check works before runtime dependencies are installed. It checks the package, Node.js, npm, dependency resolution, and environment configuration without network access or reading credential-file contents. Read `status` (`ready`, `needs_configuration`, or `blocked`); exit 0 alone does not mean ready or prove remote service access.

If runtime dependencies are missing, install the lockfile once:

```bash
(cd "<skillDir>" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
```

Rerun the check after resolving dependencies and, for live commands, credentials below. If the locked install fails, report the error before uploading; do not substitute an unlocked install.

## 2. Resolve credentials

Live commands require `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION` (`global` or `cn`). The CN-only Arkclaw distribution uses `cn`.

Use the existing shell environment first. If `check-local.mjs` reports missing configuration and `~/.realsee/credentials` exists, load it in the same shell and rerun the check without displaying the file:

```bash
set -a
. "$HOME/.realsee/credentials"
set +a
node <skillDir>/scripts/check-local.mjs --json
```

If configuration is still missing, request only the missing items through a local shell or secure credential interface. Persist app credentials only when explicitly requested, in `~/.realsee/credentials` with mode 0600 outside the repository. Never put credential values in recorded CLI arguments or environment prefixes. Resolve credentials again whenever a live command starts in a new shell.

## 3. Select the input

Two mutually exclusive modes are supported:

- repeat `--image <absolute-path>` for 1–99 local images; or
- pass one `--zip <absolute-path>` containing root-level images.

The CLI performs authoritative validation and deterministic packaging. Inputs must be JPEG, PNG, or WebP, RGB, 8-bit, and exactly `width == 2 * height`. A resolution below 2048×1024 emits a warning. Square 1:1 images are rejected; users who require the old square/single-GLB workflow must pin `v1.0.2`.

ZIP input is safely extracted, validated, Unicode-normalized, sorted, and repacked before upload. Use the returned `name_mapping` for output IDs rather than deriving or renaming them.

`examples/manifest.json` lists two first-party example sets with CDN URLs, byte lengths, and SHA-256 digests; the JPEGs are not bundled. For official examples, use the configured region unless the user specifies another, and choose a new absolute output directory in the task workspace outside `<skillDir>`. State the choices; ask only if they cannot be resolved from the task. Create the parent before invoking the downloader:

```bash
node <skillDir>/scripts/download-examples.mjs \
  --region cn \
  --output "/absolute/example-output"
```

The downloader publishes the directory after all files pass byte-length and SHA-256 checks. Do not create, rename, or replace the output path or its parent while it runs. Use `global` instead of `cn` when appropriate; the CN-only Arkclaw distribution only allows `cn`. See the [example panorama guide](references/examples.md) / [中文](references/examples.zh-CN.md) for selection details.

## 4. Start once

Before uploading, require selected inputs and consent to send them to Realsee. An explicit request to upload those inputs is sufficient; file selection or example downloads alone are not consent. If either is missing, ask one question explaining that the files will leave the machine. Reuse existing consent for the same input and scope without reconfirming.

Submit the selected images once:

```bash
node <skillDir>/scripts/run-argus.mjs start \
  --image "/absolute/path/a.jpg" \
  --image "/absolute/path/b.webp" \
  --workspace "/absolute/workspace-root" \
  --yes --json
```

For a ZIP, replace all `--image` arguments with `--zip "/absolute/path/input.zip"`. `--yes` records existing authorization; it does not create consent. Capture the returned `workspace_dir` for all later commands.

`start` validates, packages, uploads, submits, and returns. Never automatically repeat it after `submission_unknown`: submission is not idempotent and a retry may create a duplicate task.

## 5. Query status explicitly

Run one status query:

```bash
node <skillDir>/scripts/run-argus.mjs status \
  --workspace "<workspace_dir>" --json
```

`task_status` is `queued`, `processing`, `succeeded`, or `failed`. For a full run, query until terminal with bounded foreground waits of about 30 seconds, within the host's tool timeout. There is no detached poller or `--resume` mode. After an interruption or transient query/collection failure, continue with `status` or `collect` using the saved workspace; never recover by repeating `start`. If recovery cannot proceed, report the workspace and failed stage. Do not claim ongoing monitoring after the agent stops.

## 6. Collect a terminal result

When the task is terminal, run:

```bash
node <skillDir>/scripts/run-argus.mjs collect \
  --workspace "<workspace_dir>" --json
```

`collect` retains `output.zip`, safely extracts and validates its manifest and references, and writes `result.json`. A failed remote task produces a local error result instead. Repeating a completed `collect` does not resubmit or download again.

## 7. Verify and report the collected result

Use the installed offline inspector rather than rewriting Schema or artifact checks:

```bash
node <skillDir>/scripts/inspect-result.mjs \
  --workspace "<workspace_dir>" --json --write-report
```

The inspector reuses the canonical validator offline and needs no credentials. It checks artifact references and available archive integrity metadata; `--write-report` saves `verification.json` in the workspace. Without that option it is read-only. It preserves the original state, result index, archive, and extracted artifacts.

Report these fields separately:

- Recorded local `phase`, remote `task_status`, and algorithm `result_status`; copy them from the report rather than inferring one from another.
- Every `missing_ids` entry and all input/result warnings.
- Usable local artifact/report links, counts, and file sizes; do not replace file links with shortened `...` paths.
- Declared depth resolution and whether optional intrinsics were returned.

For `partial`, the CLI exits 0. Still show a prominent warning and the complete non-empty `missing_ids` list. For `error`, surface the sanitized error and treat the command as failed. Do not present temporary result URLs as durable output.

Keep the response concise. Validation covers the artifact contract: binary checks inspect headers without fully decoding GLB/EXR payloads, and point counts/resolutions come from the manifest. Depth resolution is service-defined and may be lower than input resolution. Visual quality and geometric accuracy remain unassessed. When requested, inspect the original GLB with an available local point-cloud viewer; unsupported host previews do not indicate reconstruction failure. Do not claim visual inspection from metadata alone.

## References

- For lifecycle implementation details: [Gateway workflow](references/api-workflow.md)
- When checking request/response fields: [Gateway OpenAPI](references/argus-gateway-openapi.json)
- When interpreting or validating artifacts: [Algorithm I/O contract](references/algorithm-io.md) / [中文](references/algorithm-io.zh-CN.md)
- [Official example panoramas](references/examples.md) / [中文](references/examples.zh-CN.md)
- [`output.json` JSON Schema](references/argus-output.schema.json)
- For older inputs or integrations: [2.0 migration guide](references/migration-v2.md) / [中文](references/migration-v2.zh-CN.md)
- When a command fails: [Troubleshooting](references/troubleshooting.md)
