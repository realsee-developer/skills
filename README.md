<p align="center">
  <a href="https://argus.realsee.ai/">
    <img src=".agents/skills/argus/assets/brand/argus-logo-color.png" alt="Argus by Realsee" width="560">
  </a>
</p>

# Realsee Skills

[![CI](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/ci.yml)
[![Release gate](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/release-gate.yml?branch=main&label=release%20gate&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/release-gate.yml)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/codeql.yml?branch=main&label=CodeQL&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/codeql.yml)
[![Latest release](https://img.shields.io/github/v/release/realsee-developer/skills?display_name=tag&style=flat-square)](https://github.com/realsee-developer/skills/releases)
![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933?style=flat-square)

English | [简体中文](README.zh-CN.md)

Realsee Skills provides installable agent skills for Realsee workflows. The current Skill is `argus` 2.0: it processes 1–99 exact 2:1 panoramas and produces EXR depth maps, one merged GLB point cloud, per-image camera poses, optional intrinsics, and a validated local result index.

The Skill ID remains `argus`. Version 2.0 has no legacy single-image VGGT fallback. Pin `v1.0.2` when a workflow needs square 1:1 input, the old single-GLB-only result, or the old H5 preview behavior.

[Argus](https://argus.realsee.ai/) · [Interactive demo](https://h5.realsee.ai/argus) · [Research](https://argus-paper.realsee.ai/) · [Developer Platform](https://developer.realsee.ai/)

Those sites describe the wider product and research ecosystem. The installable Skill 2.0 contract remains intentionally specific: **1–99 local RGB8 panoramas with exact 2:1 dimensions**. Capabilities shown for arbitrary photos or other product surfaces are not exposed by this CLI.

## Credentials

Every install path uses the unchanged runtime contract:

| Key | Purpose | Sensitive |
| --- | --- | --- |
| `REALSEE_APP_KEY` | Realsee Open Platform APP_KEY | yes |
| `REALSEE_APP_SECRET` | Realsee Open Platform APP_SECRET | yes |
| `REALSEE_REGION` | `global` (`app-gateway.realsee.ai`) or `cn` (`app-gateway.realsee.cn`) | no |

Register at [my.realsee.ai](https://my.realsee.ai/?utm_source=github) or [my.realsee.cn](https://my.realsee.cn/?utm_source=github), then request the Argus Gateway capability through the support channel described in [SUPPORT.md](SUPPORT.md).

## Install

Claude Code marketplace:

```text
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

Codex:

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
```

Any detected agent host:

```bash
npx skills add realsee-developer/skills --skill argus
npx skills add realsee-developer/skills --skill argus --agent '*'
```

Install from a local checkout:

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install
(cd .agents/skills/argus && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
npm run rebuild
```

See [the install overview](docs/install-guides.md), [Claude Code](docs/claude-plugin.md), and [Codex](docs/codex.md) for host-specific details.

## Official example manifest

Every Skill install includes `examples/manifest.json`, which lists the CDN URL, byte length, and SHA-256 for the CN and Global first-party sample sets. Panorama JPEGs are absent from the current release tree and every generated Skill distribution. Download one set to a new absolute directory outside the installed Skill:

```bash
node <skillDir>/scripts/download-examples.mjs \
  --region cn \
  --output /absolute/example-output
```

Use the set matching `REALSEE_REGION`. The downloader publishes the output only after every file passes its manifest checks. Running Argus is a separate remote upload and still requires user consent.

## Direct CLI

Start from repeated images:

```bash
node .agents/skills/argus/scripts/run-argus.mjs start \
  --image /absolute/path/a.jpg \
  --image /absolute/path/b.webp \
  --workspace /absolute/workspace-root \
  --yes --json
```

Or start from one existing ZIP:

```bash
node .agents/skills/argus/scripts/run-argus.mjs start \
  --zip /absolute/path/input.zip \
  --workspace /absolute/workspace-root \
  --yes --json
```

Capture the returned `workspace_dir`. Each status call makes one query:

```bash
node .agents/skills/argus/scripts/run-argus.mjs status \
  --workspace /absolute/workspace-root/<run-dir> --json
```

Collect after success:

```bash
node .agents/skills/argus/scripts/run-argus.mjs collect \
  --workspace /absolute/workspace-root/<run-dir> --json
```

There is no detached poller, `--async`, or `--resume`. Completed collection is idempotent.

## Input and output

Inputs are 1–99 JPEG, PNG, or WebP RGB8 panoramas with exact `width == 2 * height`. At least 2048×1024 is recommended; lower resolution is a warning. `--image` is repeatable and mutually exclusive with `--zip`. ZIP mode is safely extracted, validated, normalized to Unicode NFC, sorted, and repacked before upload.

Remote `task_status` (`queued`, `processing`, `succeeded`, `failed`) is separate from algorithm `result_status` (`success`, `partial`, `error`). A partial result exits 0 but includes a prominent warning and non-empty `missing_ids`; an error exits non-zero.

The collector retains `output.zip`, safely extracts it, and writes this validated local result matrix:

| Artifact | Availability |
| --- | --- |
| `output.json` | Required algorithm manifest. |
| `pointcloud/merged.glb` | One merged `right-handed, Y-up` point cloud for successfully reconstructed images. |
| `depth/*_depth.exr` | One meter-scale floating-point depth map per successful image. |
| `pose/*_pose.json` | One camera pose per successful image. |
| `intrinsics/*_intrinsics.json` | Optional; absence is valid. |
| `result.json` | Local index for statuses, paths, warnings, and `missing_ids`. |

Real Argus runs upload the normalized input ZIP to Realsee remote services. Obtain user consent before upload. Never commit or log credentials, upload tokens, private result URLs, or generated artifacts.

## Contracts and migration

- [Skill README](.agents/skills/argus/README.md)
- [Official brand asset manifest](.agents/skills/argus/assets/brand/manifest.json)
- [Gateway OpenAPI](.agents/skills/argus/references/argus-gateway-openapi.json)
- [Algorithm I/O contract](.agents/skills/argus/references/algorithm-io.md)
- [`output.json` JSON Schema](.agents/skills/argus/references/argus-output.schema.json)
- [Migration from 1.x](.agents/skills/argus/references/migration-v2.md)
- [Machine-readable index](llms.txt)

## Development

Canonical source lives in `.agents/skills/argus/`. The Claude plugin and CN-only Arkclaw package are generated from it and checked for byte consistency (with deterministic Arkclaw overlays for runtime region, example downloads, and matching guidance).

```bash
npm run doctor
npm run test:skill
npm run rebuild
npm run ci
```

See [Architecture](ARCHITECTURE.md), [development](docs/development.md), [release](docs/release.md), and [public distribution](docs/public-distribution.md).

## License

This repository is source-available under the [Realsee SDK License Agreement](LICENSE). It is not published under an OSI open source license.
