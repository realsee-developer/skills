# Realsee Skills

[![CI](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/ci.yml)
[![Release gate](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/release-gate.yml?branch=main&label=release%20gate&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/release-gate.yml)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/codeql.yml?branch=main&label=CodeQL&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/codeql.yml)
[![Latest release](https://img.shields.io/github/v/release/realsee-developer/skills?display_name=tag&style=flat-square)](https://github.com/realsee-developer/skills/releases)
![Agent skills](https://img.shields.io/badge/agent-skills-0b7285?style=flat-square)
![Claude Code](https://img.shields.io/badge/Claude%20Code-supported-555?style=flat-square)
![Codex](https://img.shields.io/badge/Codex-supported-555?style=flat-square)
![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933?style=flat-square)

English | [简体中文](README.zh-CN.md)

Realsee Skills provides installable agent skills for Realsee workflows. Users and agent runtimes can install these skills to generate Realsee outputs from local inputs.

The current skill is `argus`. It generates Realsee Argus GLB output from a local JPEG image or panorama.

## Credentials

Every install path needs three values:

| Key | Purpose | Sensitive |
| --- | --- | --- |
| `REALSEE_APP_KEY` | Realsee Open Platform APP_KEY | ✅ |
| `REALSEE_APP_SECRET` | Realsee Open Platform APP_SECRET | ✅ |
| `REALSEE_REGION` | `global` (app-gateway.realsee.ai) or `cn` (app-gateway.realsee.cn) | — |

Register at [my.realsee.ai](https://my.realsee.ai/?utm_source=github) (global) or [my.realsee.cn](https://my.realsee.cn/?utm_source=github) (cn), then email [developer@realsee.com](mailto:developer@realsee.com?subject=Argus%20VGGT%20API%20Capability%20Request) with your account region, `UserID`, and `IdentityID` to request Argus VGGT API capability.

## Install & Use — Claude Code

**One-line install** (inside a Claude Code session):

```
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

Claude Code will prompt you for `REALSEE_APP_KEY` / `REALSEE_APP_SECRET` / `REALSEE_REGION` via the plugin config dialog. The two secrets are stored in the system keychain (not in `settings.json`).

**Use** — just describe the task in chat; Claude picks the skill based on its `SKILL.md` description. Examples:

```
Turn /path/to/photo.jpg into a Realsee Argus GLB (image mode).
Generate an Argus GLB from /path/to/pano.jpg (panorama, 2:1 aspect).
```

Need an explicit handle? The plugin-namespaced id is `realsee-skills:argus`.

Development install from a clone:

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install && npm run rebuild
claude --plugin-dir ./plugins/realsee-skills
```

## Install & Use — Codex

**One-line install** (host machine):

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
```

This copies `.agents/skills/argus/` into `$CODEX_HOME/skills/argus` (default `$HOME/.codex/skills/argus`).

**Use** — export credentials, then reference the skill in your Codex prompt:

```bash
export REALSEE_APP_KEY=...
export REALSEE_APP_SECRET=...
export REALSEE_REGION=global   # or cn
```

```
Use $argus on /path/to/photo.jpg (image mode) and report the GLB path.
```

Install from a clone instead (sets `CODEX_HOME` if you want a custom location):

```bash
CODEX_HOME=$HOME/.codex npm run install:codex-skills
```

## Install & Use — `npx skills` (any detected host)

**One-line install** for the currently-active agent:

```bash
npx skills add realsee-developer/skills --skill argus
```

Install for all detected hosts in one call:

```bash
npx skills add realsee-developer/skills --skill argus --agent '*'
```

Or target a specific host:

```bash
npx skills add realsee-developer/skills --skill argus --agent claude-code
npx skills add realsee-developer/skills --skill argus --agent codex
```

List skills without installing:

```bash
npx skills add realsee-developer/skills --list
```

Install from a local checkout:

```bash
npx skills add . --skill argus
```

**Use** — once installed, invoke the skill exactly as you would on each host (see the Claude Code / Codex sections above).

## Direct CLI Use (no host required)

Synchronous run (blocks until GLB download; Argus inference can take several minutes):

```bash
node .agents/skills/argus/scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json
```

Asynchronous (returns immediately with `status: in_progress`; a detached process polls + downloads):

```bash
node .agents/skills/argus/scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json --async
```

Resume or recover an async run from its workspace directory:

```bash
node .agents/skills/argus/scripts/run-argus.mjs --resume --workspace ./workspace/<run-dir> --json
```

Input type is auto-detected from the JPEG dimensions and strictly enforced: 2:1 (±0.05) → panorama, 1:1 (±0.05) → pinhole image, anything else is rejected before upload. `--type panorama` / `--type image` may be passed to override auto-detection, but the override is still validated against the file's dimensions.

Argus generation uploads the selected local image to Realsee remote services. Confirm user consent before any upload.

## Open The Result

The skill does not ship an opener script. Read the workspace's `result.json` directly:

```bash
cat ./workspace/<run-dir>/result.json
```

When `result.json#status === "success"`, ask the user whether to open the local GLB, the H5 preview, both, or neither. Then invoke the OS-native opener (see SKILL.md "Step 5"):

```bash
case "$(uname -s)" in
  Darwin)               open "<path-or-url>" ;;
  Linux)                xdg-open "<path-or-url>" ;;
  CYGWIN*|MINGW*|MSYS*) start "" "<path-or-url>" ;;
esac
```

Do not open anything until `result.json#status` is `success`.

## Agent Runtime Files

| File | Purpose |
| --- | --- |
| [`llms.txt`](llms.txt) | Machine-readable repository map. |
| [`AGENTS.md`](AGENTS.md) | Safe operating rules for automation. |
| [`SKILL.md`](.agents/skills/argus/SKILL.md) | Runtime-facing skill definition. |
| [`README.md`](.agents/skills/argus/README.md) | Skill-specific user documentation. |
| [`argus-gateway-openapi.json`](.agents/skills/argus/references/argus-gateway-openapi.json) | Public Gateway contract used by the skill. |

## Skill

| Skill | State | Description |
| --- | --- | --- |
| [`argus`](.agents/skills/argus/README.md) | Stable | Generate Realsee Argus GLB output from a local JPEG image or panorama. |

Release metadata lives in [`release-channel.json`](release-channel.json).

## Local Checks

Check local prerequisites:

```bash
npm run doctor
```

Run skill tests:

```bash
npm run test:skill
```

## Contribute

Source skill files live under `.agents/skills/`. The Claude plugin package under `plugins/realsee-skills/` is generated from the source skill files.

After changing source skill files, run:

```bash
npm run rebuild
npm run ci
```

Documentation:

- [Architecture](ARCHITECTURE.md) / [架构](ARCHITECTURE.zh-CN.md)
- [Install guide overview](docs/install-guides.md) / [安装指南总览](docs/zh-CN/install-guides.md)
- [Claude Code install](docs/claude-plugin.md) / [Claude Code 安装](docs/zh-CN/claude-plugin.md)
- [Codex install](docs/codex.md) / [Codex 安装](docs/zh-CN/codex.md)
- [Usage guide](docs/usage.md) / [使用指南](docs/zh-CN/usage.md)
- [Maintainer guide](docs/development.md) / [维护者指南](docs/zh-CN/development.md)
- [Release guide](docs/release.md) / [发布指南](docs/zh-CN/release.md)
- [Public distribution checklist](docs/public-distribution.md) / [公开分发检查清单](docs/zh-CN/public-distribution.md)
- [Support](SUPPORT.md) / [支持](SUPPORT.zh-CN.md)
- [Community guide](docs/community.md) / [社区指南](docs/zh-CN/community.md)
- [Contribution guide](CONTRIBUTING.md) / [贡献指南](CONTRIBUTING.zh-CN.md)
- [Security policy](SECURITY.md) / [安全政策](SECURITY.zh-CN.md)
- [License](LICENSE)

## License

This repository is source-available under the [Realsee SDK License Agreement](LICENSE). It is not published under an OSI open source license.
