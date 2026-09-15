# Realsee Skills

Agent skills for **panorama reconstruction** and **editable Blender spaces**. Use them with Claude Code, Codex, or another host supported by `npx skills`.

[![CI](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/realsee-developer/skills?display_name=tag&style=flat-square)](https://github.com/realsee-developer/skills/releases)

English | [简体中文](README.zh-CN.md)

[Choose a skill](#choose-a-skill) · [Install](#install) · [Use](#use) · [Documentation](#documentation) · [Versions](#versions) · [Development](#development)

## Choose a skill

| Category | Skill | Input → output | Requirements |
| --- | --- | --- | --- |
| Panorama reconstruction | [Argus](.agents/skills/argus/README.md) | 1–99 local 2:1 panoramas → EXR depth maps, merged GLB point cloud, camera poses, optional intrinsics, validated result index | Remote Realsee service; app credentials and upload consent; POSIX shell, Node.js 22+, npm 10+ |
| Editable space modeling | [Blender reconstruction](.agents/skills/realsee-blender-reconstruction/README.md) | Existing scan exports, point clouds, CAD, or panoramas → editable native `.blend` scene | Local Blender and an agent that can read files and run commands; no Argus credentials for local modeling |

Choose **Argus** to generate depth, point clouds, and poses from panoramas. Choose **Blender reconstruction** to build or refine an editable scene from existing evidence. Argus output can serve as reconstruction evidence; running one skill does not automatically run the other.

## Install

### Claude Code — both skills

Run in Claude Code:

```text
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

The current plugin exposes `realsee-skills:argus` and `realsee-skills:realsee-blender-reconstruction`. [Claude Code guide](docs/claude-plugin.md).

### Codex — select a skill

Install the skill you need, or run both commands:

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
npx skills add realsee-developer/skills --skill realsee-blender-reconstruction --agent codex
```

[Codex guide](docs/codex.md), including local-checkout installation.

### Other installation options

- **Other agent hosts:** omit `--agent codex` to choose a host, or use `--agent '*'` for all detected hosts.
- **Local checkout:** use `npx skills add . --skill <skill-id> --agent codex` from a checkout containing the selected skill.
- **Arkclaw:** the release asset `argus.zip` contains only Argus and supports the CN region.
- **Repository Codex installer:** `npm run install:codex-skills` installs only Argus; it replaces the existing Argus target directory.

See the [installation guide](docs/install-guides.md) for dependencies, installation paths, and version pinning.

## Use

### Argus: panoramas → reconstruction data

Example request:

> Use $argus to upload /data/living-room.jpg and /data/hall.jpg to Realsee for processing. Start the task and report its workspace.

Inputs must be JPEG, PNG, or WebP, RGB8, and exactly 2:1. The workflow has three explicit commands: `start`, `status`, and `collect`. Collected outputs include `output.zip`, the algorithm manifest, and a validated local `result.json` index; partial results include a missing-image list.

Argus requires `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION` (`global` or `cn`). Configure secrets locally and obtain consent before upload. Follow the [credential and usage guide](docs/usage.md#credentials-and-upload-consent) for setup and CLI examples.

[Official sample panoramas](.agents/skills/argus/references/examples.md) can be downloaded separately; they are not bundled with the skill. Downloading samples does not authorize uploading them.

### Blender: existing evidence → editable scene

Example request:

> Use $realsee-blender-reconstruction with the exports in data/. Rebuild the evidenced space as an editable Blender scene, save output/reconstruction_native.blend, and verify geometry and material edits after reopening.

The skill prioritizes layout, walls, floors, ceilings, openings, and connections, then refines the requested furniture, materials, and lighting. Walkthroughs, physics exports, and web previews are available when requested.

See the [Blender guide](.agents/skills/realsee-blender-reconstruction/README.md) for input preparation, local requirements, and deliverables. In Claude Code, use the plugin-qualified skill names shown above.

## Documentation

### Users

| Topic | Guide |
| --- | --- |
| Installation and supported hosts | [Install overview](docs/install-guides.md) · [Claude Code](docs/claude-plugin.md) · [Codex](docs/codex.md) |
| Workflows and credential setup | [Usage](docs/usage.md) |
| Argus input, output, and examples | [Argus guide](.agents/skills/argus/README.md) · [Examples](.agents/skills/argus/references/examples.md) |
| Native scene reconstruction and editing | [Blender guide](.agents/skills/realsee-blender-reconstruction/README.md) |
| Troubleshooting and capability access | [Support](SUPPORT.md) · [Argus troubleshooting](.agents/skills/argus/references/troubleshooting.md) |

### Integrators and maintainers

| Topic | Reference |
| --- | --- |
| Argus interfaces | [Gateway OpenAPI](.agents/skills/argus/references/argus-gateway-openapi.json) · [Algorithm I/O](.agents/skills/argus/references/algorithm-io.md) · [Output schema](.agents/skills/argus/references/argus-output.schema.json) |
| Repository structure and agent discovery | [Architecture](ARCHITECTURE.md) · [Machine index](llms.txt) · [Agent guide](AGENTS.md) |
| Changes and releases | [Development](docs/development.md) · [Contributing](CONTRIBUTING.md) · [Release guide](docs/release.md) · [Distribution checklist](docs/public-distribution.md) |
| Security | [Security policy](SECURITY.md) |

Argus product resources: [Product](https://argus.realsee.ai/) · [Demo](https://h5.realsee.ai/argus) · [Research](https://argus-paper.realsee.ai/) · [Developer platform](https://developer.realsee.ai/). These describe the broader product; the installable Argus skill supports the panorama workflow above.

## Versions

| Source | Contents |
| --- | --- |
| Current `main` | Both Argus and Blender reconstruction, including the latest guidance |
| Stable release `v2.1.0` | Both skills; pin `realsee-developer/skills@v2.1.0` for a reproducible install |
| Previous `v2.0.0` | Argus only; does not contain Blender reconstruction |
| Legacy `v1.0.2` | Old square-image and single-GLB workflow; see [migration guidance](.agents/skills/argus/references/migration-v2.md) |

A merge into `main` does not update an existing release or its downloadable assets. Check [GitHub Releases](https://github.com/realsee-developer/skills/releases) for published tags and artifacts. Current Argus release metadata is recorded in `release-channel.json`.

## Development

Canonical skill sources live under `.agents/skills/`. Edit those sources and regenerate distributions; do not edit the copies in `plugins/realsee-skills/` or `arkclaw/argus/` directly.

```bash
npm run rebuild
npm run ci
```

See the [development guide](docs/development.md) for prerequisites and focused checks. Repository CI checks packaging and runtime contracts; it does not perform remote Argus processing or a Blender reconstruction.

## License

Source-available under the [Realsee SDK License Agreement](LICENSE). This is not an OSI-approved open source license.
