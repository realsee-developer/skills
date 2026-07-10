---
name: argus
description: Process one to 99 local 2:1 panorama images with Realsee Argus, producing depth maps, a merged GLB point cloud, camera poses, optional intrinsics, and a validated local output index. Use for multi-panorama Argus reconstruction, Argus ZIP input, or explicit start/status/collect task lifecycle requests.
compatibility: Requires Node.js 22+ and network access to app-gateway.realsee.ai or app-gateway.realsee.cn
metadata:
  version: "2.0.0"
  documentation: README.md
---

# argus

Use this Skill to submit 1–99 exact 2:1 equirectangular panoramas to Realsee Argus and collect a validated `output.zip`. The public entrypoint is `scripts/run-argus.mjs`; `<skillDir>` below means the directory containing this file.

Argus is a remote upload. Do not upload until the user has selected the input and consented. Never print, log, or persist credentials, upload tokens, presigned URLs, or raw provider errors. Do not open output files unless the user asks.

## 1. Ensure runtime dependencies

Skill installers copy the canonical package but may not install its Node.js dependencies. Before the first Argus command in an installed Skill directory, check all four runtime packages without printing any sensitive data. If any are absent, install the exact lockfile once:

```bash
test -f "<skillDir>/node_modules/@realsee/universal-uploader/package.json" \
  && test -f "<skillDir>/node_modules/@aws-sdk/client-s3/package.json" \
  && test -f "<skillDir>/node_modules/ajv/package.json" \
  && test -f "<skillDir>/node_modules/yauzl/package.json" \
  || (cd "<skillDir>" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
```

Do not replace `npm ci` with an unlocked install. If the package cannot be resolved, stop and report the install error; do not begin an upload.

## 2. Resolve credentials

The runtime requires `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION` (`global` or `cn`). The Gateway base is unchanged: global uses `app-gateway.realsee.ai`; CN uses `app-gateway.realsee.cn`. In the CN-only Arkclaw distribution, use `cn` and do not offer the global region.

Resolve values in the existing order:

1. Probe the current shell environment without printing values:

   ```bash
   printenv REALSEE_APP_KEY REALSEE_APP_SECRET REALSEE_REGION >/dev/null \
     && echo present || echo missing
   ```

2. If `~/.realsee/credentials` already exists, load it into the shell and probe presence. Never display the file:

   ```bash
   [ -f ~/.realsee/credentials ] && set -a && . ~/.realsee/credentials && set +a; \
     [ -n "$REALSEE_APP_KEY" ] && [ -n "$REALSEE_APP_SECRET" ] && [ -n "$REALSEE_REGION" ] \
     && echo present || echo missing
   ```

3. Otherwise ask for region, APP_KEY, and APP_SECRET one field per turn. Never repeat a supplied value. If the user explicitly chooses to persist them, retain the existing mode-0600 `~/.realsee/credentials` flow. Never place credential values in a CLI argument or environment prefix recorded by the host.

## 3. Select the input

Two mutually exclusive modes are supported:

- repeat `--image <absolute-path>` for 1–99 local images; or
- pass one `--zip <absolute-path>` containing root-level images.

The CLI performs authoritative validation and deterministic packaging. Inputs must be JPEG, PNG, or WebP, RGB, 8-bit, and exactly `width == 2 * height`. A resolution below 2048×1024 emits a warning. Square 1:1 images are rejected; users who require the old square/single-GLB workflow must pin `v1.0.2`.

ZIP mode is not a validation bypass. The CLI safely extracts, validates, Unicode-normalizes, sorts, and repacks it before upload. Do not manually rename output IDs: consumers trust the algorithm's `name_mapping`.

## 4. Start once

The user selecting files for an Argus request is upload consent. If the user has not selected files, ask one question that also states the files will leave the machine for remote processing. Do not ask a redundant second confirmation.

For repeated images:

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node <skillDir>/scripts/run-argus.mjs start \
  --image "/absolute/path/a.jpg" \
  --image "/absolute/path/b.webp" \
  --workspace "/absolute/workspace-root" \
  --yes --json
```

For an existing ZIP:

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node <skillDir>/scripts/run-argus.mjs start \
  --zip "/absolute/path/input.zip" \
  --workspace "/absolute/workspace-root" \
  --yes --json
```

If credentials already exist in the inherited shell, omit the `source` prefix. Capture `workspace_dir` from the JSON response; it is the durable run handle for later commands.

`start` validates and packages locally, uploads one ZIP, submits once, persists `task_code`, and returns. It does not poll in the background. Never automatically rerun `start` after `submission_unknown`: the submit operation is not idempotent and a blind retry may create a duplicate task.

## 5. Query status explicitly

Run one status query:

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node <skillDir>/scripts/run-argus.mjs status \
  --workspace "<workspace_dir>" --json
```

Interpret `task_status` as `queued`, `processing`, `succeeded`, or `failed`. When queued or processing, report the current state and query again later only when appropriate. There is no detached poller and no `--resume` mode.

## 6. Collect a terminal result

When the task succeeds, run:

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node <skillDir>/scripts/run-argus.mjs collect \
  --workspace "<workspace_dir>" --json
```

`collect` retains the original `output.zip`, safely extracts it, validates `output.json` and all referenced artifacts, and writes a local `result.json` index. Repeating `collect` is safe: a completed run is not resubmitted or downloaded twice.

Report these fields separately:

- `task_status`: remote lifecycle state;
- `result_status`: algorithm result (`success`, `partial`, or `error`);
- local `output_zip_path`, output directory, manifest, merged GLB, depth-map, pose, and optional intrinsics paths;
- `missing_ids` and warnings.

For `partial`, the CLI exits 0. Still show a prominent warning and the complete non-empty `missing_ids` list. For `error`, surface the sanitized error and treat the command as failed. Do not present temporary result URLs as durable output.

## References

- [Gateway workflow](references/api-workflow.md)
- [Gateway OpenAPI](references/argus-gateway-openapi.json)
- [Algorithm I/O contract](references/algorithm-io.md) / [中文](references/algorithm-io.zh-CN.md)
- [`output.json` JSON Schema](references/argus-output.schema.json)
- [2.0 migration guide](references/migration-v2.md) / [中文](references/migration-v2.zh-CN.md)
- [Troubleshooting](references/troubleshooting.md)
