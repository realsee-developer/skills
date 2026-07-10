# argus

![Skill argus](https://img.shields.io/badge/skill-realsee--argus-6f42c1?style=flat-square)
![Version 2.0](https://img.shields.io/badge/version-2.0.0-blue?style=flat-square)
![Upload consent](https://img.shields.io/badge/upload-consent%20required-brown?style=flat-square)

[English](README.md) | [简体中文](README.zh-CN.md)

`argus` packages 1–99 local 2:1 panoramas into one normalized ZIP, submits a Realsee Argus task, and collects a validated `output.zip` containing EXR depth maps, one merged GLB point cloud, per-image poses, optional intrinsics, and `output.json`.

Version 2.0 keeps the Skill ID `argus` but does not include the old single-image VGGT fallback. Pin `v1.0.2` for square 1:1 input, the old single-GLB-only output, or legacy preview behavior. See the [migration guide](references/migration-v2.md).

## Install dependencies

From this package directory:

```bash
npm install
```

Node.js 22 or newer is required.

## Explicit lifecycle

Start from repeated images:

```bash
node scripts/run-argus.mjs start \
  --image /absolute/path/a.jpg \
  --image /absolute/path/b.png \
  --workspace /absolute/workspace-root \
  --yes --json
```

Or start from one existing ZIP:

```bash
node scripts/run-argus.mjs start \
  --zip /absolute/path/input.zip \
  --workspace /absolute/workspace-root \
  --yes --json
```

Capture the returned `workspace_dir`, then query once per invocation:

```bash
node scripts/run-argus.mjs status --workspace /absolute/workspace-root/<run-dir> --json
```

Collect after the remote task succeeds:

```bash
node scripts/run-argus.mjs collect --workspace /absolute/workspace-root/<run-dir> --json
```

There is no detached poller, `--async`, or `--resume`. `start`, `status`, and `collect` are independently resumable through schema-v2 `state.json`. A completed `collect` is idempotent.

## Input contract

- 1–99 JPEG, PNG, or WebP images.
- RGB, 8-bit, exact `width == 2 * height`.
- At least 2048×1024 is recommended; smaller images produce a warning.
- `--image` is repeatable and mutually exclusive with `--zip`.
- ZIPs may contain only images at the root. The Skill safely validates and deterministically repacks them.

The Skill rejects nested entries, path traversal, control characters, duplicate stems, and Unicode/case-fold name collisions before upload.

## Result contract

`task_status` describes the remote lifecycle: `queued`, `processing`, `succeeded`, or `failed`. `result_status` independently describes the algorithm output: `success`, `partial`, or `error`.

The local `result.json` indexes:

- the retained `output.zip` and extracted directory;
- `output.json`;
- `pointcloud/merged.glb`;
- EXR depth maps and JSON poses;
- optional intrinsics;
- warnings and `missing_ids`.

`partial` exits 0 but always carries an explicit warning and a non-empty missing-ID list. `error` exits non-zero.

## Configuration and safety

Configuration uses the existing environment contract:

- `REALSEE_APP_KEY`
- `REALSEE_APP_SECRET`
- `REALSEE_REGION` (`global` or `cn`)

Real runs upload the normalized input ZIP to Realsee remote services. Obtain user consent before upload. Credentials, upload tokens, provider errors, and signed result URLs must not be stored in workspace state or public logs.

The Arkclaw build is CN-only. Canonical, Claude plugin, Codex, and `npx skills` installs support both Gateway regions.

## Contracts

- [Gateway OpenAPI](references/argus-gateway-openapi.json)
- [Algorithm I/O](references/algorithm-io.md) / [中文](references/algorithm-io.zh-CN.md)
- [`output.json` JSON Schema](references/argus-output.schema.json)
- [Migration from 1.x](references/migration-v2.md) / [中文](references/migration-v2.zh-CN.md)
