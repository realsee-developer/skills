# Usage Guide

[English](usage.md) | [简体中文](zh-CN/usage.md)

This repository provides the installable `argus` Skill for Claude Code, Codex, and other hosts supported by `npx skills`.

Official resources: [Argus](https://argus.realsee.ai/), [interactive demo](https://h5.realsee.ai/argus), [research](https://argus-paper.realsee.ai/), and the [Realsee Developer Platform](https://developer.realsee.ai/). These sites may show broader photo and product workflows; the Skill documented here accepts only 1–99 local RGB8 panoramas with exact 2:1 dimensions.

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

Real Argus runs are remote uploads. Obtain user consent first and do not persist credentials, upload tokens, or signed result URLs.
