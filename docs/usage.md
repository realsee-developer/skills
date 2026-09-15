# Usage Guide

[English](usage.md) | [简体中文](zh-CN/usage.md)

This repository provides `argus` and `realsee-blender-reconstruction` for Claude Code, Codex, and other hosts supported by `npx skills`.

## Local Blender space reconstruction

Use [realsee-blender-reconstruction](../.agents/skills/realsee-blender-reconstruction/README.md) when Realsee exports already exist locally and the goal is an editable native scene. It does not require Argus credentials or a remote job. From this checkout:

```sh
npx skills add . --skill realsee-blender-reconstruction --agent codex
```

Then open the modeling project and ask:

> Use $realsee-blender-reconstruction with data/. Reconstruct the evidenced space, prioritizing structure and connections. Save output/reconstruction_native.blend and verify source comparisons and actual edits after reopening.

Verify that local Blender runs and inspect its version; keep inputs, scripts, and outputs in the modeling project. The skill includes optional walkthrough, physics/USDZ, image-and-text asset generation, and web-preview guidance when requested. `npm run install:codex-skills` remains the Argus-specific installer. The rest of this guide describes Argus remote processing.

Official resources: [Argus](https://argus.realsee.ai/), [interactive demo](https://h5.realsee.ai/argus), [research](https://argus-paper.realsee.ai/), and the [Realsee Developer Platform](https://developer.realsee.ai/). These sites may show broader photo and product workflows; the Argus Skill accepts only 1–99 local RGB8 panoramas with exact 2:1 dimensions.

## Install

```bash
npx skills add realsee-developer/skills --skill argus
npx skills add realsee-developer/skills --skill argus --agent claude-code
npx skills add realsee-developer/skills --skill argus --agent codex
npx skills add realsee-developer/skills --skill argus --agent '*'
```

From a local checkout:

```bash
npx skills add . --skill argus
```

## Credentials and upload consent

Only Argus requires `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION` (`global` or `cn`; Arkclaw fixes it to `cn`). The agent first checks the inherited shell environment; if configuration is incomplete, it loads an existing `~/.realsee/credentials`, then requests only what is still missing. Have the user configure secrets in their local shell or a secure credential interface, rather than collecting them field by field in chat.

Never echo credentials or put values in recorded command arguments or environment prefixes. Only when the user explicitly chooses persistent storage may app credentials be saved outside the repository in `~/.realsee/credentials` with mode 0600. Upload tokens and signed URLs must never be persisted; run state contains no credentials.

`start` sends the selected files to Realsee. File selection and example downloads are not upload consent; an explicit request to upload those files is sufficient. Reuse existing consent for the same input and scope without another confirmation. `--yes` in the examples records that consent has been obtained; it does not replace user authorization.

## Official example manifest

The installed Skill contains `examples/manifest.json`, not the panorama JPEGs. To use a first-party sample set, choose the region matching `REALSEE_REGION` and a new absolute directory outside `<skillDir>`:

```bash
node <skillDir>/scripts/download-examples.mjs \
  --region cn \
  --output /absolute/example-output
```

The downloader follows the manifest `source_url` values, verifies each `bytes` and SHA-256 value, and publishes the directory only after the full set passes. Pass any downloaded subset with repeated `--image` options. Downloading is not upload consent; obtain consent before sending the selected images to the regional Gateway.

## Start

Use repeated images:

```bash
node .agents/skills/argus/scripts/run-argus.mjs start \
  --image /absolute/path/a.jpg \
  --image /absolute/path/b.png \
  --workspace /absolute/workspace-root \
  --yes --json
```

Or one existing ZIP:

```bash
node .agents/skills/argus/scripts/run-argus.mjs start \
  --zip /absolute/path/input.zip \
  --workspace /absolute/workspace-root \
  --yes --json
```

The two input modes are mutually exclusive. `start` validates, normalizes, uploads, and submits, then returns `workspace_dir` without polling.

## Status

Each invocation makes one remote query:

```bash
node .agents/skills/argus/scripts/run-argus.mjs status \
  --workspace /absolute/workspace-root/<run-dir> --json
```

Repeat later while `task_status` is `queued` or `processing`.

## Collect

After `task_status` becomes `succeeded`:

```bash
node .agents/skills/argus/scripts/run-argus.mjs collect \
  --workspace /absolute/workspace-root/<run-dir> --json
```

Collection retains `output.zip`, safely extracts it, validates the manifest and artifacts, and writes a local result index. Repeating collect after completion does not submit or download again.

`task_status` and `result_status` are separate. `partial` exits 0 with a warning and non-empty `missing_ids`; `error` exits non-zero.

## Collected artifacts

| Artifact | Meaning |
| --- | --- |
| `output.zip` | Original terminal result archive, retained locally. |
| `output.json` | Required, schema-validated algorithm manifest. |
| `pointcloud/merged.glb` | One merged `right-handed, Y-up` point cloud. |
| `depth/*_depth.exr` | Meter-scale floating-point depth for each successful image. |
| `pose/*_pose.json` | Camera pose for each successful image. |
| `intrinsics/*_intrinsics.json` | Optional camera intrinsics. |
| `result.json` | Local index of statuses, artifact paths, warnings, and missing IDs. |

## Input rules

- 1–99 root-level JPEG, PNG, or WebP images.
- RGB, 8-bit, exact 2:1 dimensions.
- Below 2048×1024 is a warning, not a hard failure.
- ZIP paths must be safe and flat; the Skill rejects duplicate stems and Unicode/case-fold collisions.
- A single 2:1 panorama is valid. A square image is not; pin `v1.0.2` for the legacy square workflow.

## Skill files

- Runtime definition: [SKILL.md](../.agents/skills/argus/SKILL.md)
- Skill README: [README.md](../.agents/skills/argus/README.md)
- Brand assets: [manifest.json](../.agents/skills/argus/assets/brand/manifest.json)
- Official example manifest: [manifest.json](../.agents/skills/argus/examples/manifest.json)
- Example download guide: [examples.md](../.agents/skills/argus/references/examples.md)
- Gateway contract: [argus-gateway-openapi.json](../.agents/skills/argus/references/argus-gateway-openapi.json)
- Algorithm contract: [algorithm-io.md](../.agents/skills/argus/references/algorithm-io.md)
- Output schema: [argus-output.schema.json](../.agents/skills/argus/references/argus-output.schema.json)
- Machine index: [llms.txt](../llms.txt)

Follow the credential and upload-consent requirements above; use validated local artifacts as durable deliverables.
