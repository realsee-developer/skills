# Install Guide Overview

[English](install-guides.md) | [简体中文](zh-CN/install-guides.md)

This repository provides two skills: `argus` uploads panoramas to Realsee for remote processing; `realsee-blender-reconstruction` reconstructs existing local exports as editable Blender scenes. Canonical sources live under `.agents/skills/`.

## Host matrix

| Host | Install | Skill handle | Guide |
| --- | --- | --- | --- |
| Claude Code | `/plugin marketplace add realsee-developer/skills`, then `/plugin install realsee-skills@realsee-developer-skills` | `realsee-skills:argus`, `realsee-skills:realsee-blender-reconstruction` | [Claude Code](claude-plugin.md) |
| Codex | `npx skills add realsee-developer/skills@v2.1.0 --skill argus --agent codex` | `$argus`, `$realsee-blender-reconstruction` | [Codex](codex.md) |
| Any detected host | `npx skills add realsee-developer/skills@v2.1.0 --skill argus --agent '*'` | Host-specific | This guide |
| Arkclaw | Published Arkclaw ZIP | `argus` | CN-only |

For the active host only:

```bash
npx skills add realsee-developer/skills@v2.1.0 --skill argus
npx skills add realsee-developer/skills@v2.1.0 --skill realsee-blender-reconstruction
```

The `npx skills` commands in the table install Argus; replace `--skill argus` with `--skill realsee-blender-reconstruction` to install Blender. The current Claude plugin includes both skills; Arkclaw and `npm run install:codex-skills` install only Argus.

## Runtime requirements

Argus requires a POSIX shell, Node.js 22+, npm 10+, npm registry and regional Gateway access, and Argus-enabled app credentials. Before first use, the agent installs missing runtime dependencies from the lockfile as directed by the installed `SKILL.md`. The Blender skill requires a working local Blender installation and existing scan exports, point clouds, CAD, or panoramas; local reconstruction needs no Realsee credentials.

## Reproducible versions

Pin `v2.1.0` for either skill. The older `v2.0.0` tag contains only Argus.

Pin `v1.0.2` only for legacy square 1:1 input, the old single-GLB output, or legacy preview behavior:

```bash
npx skills add realsee-developer/skills@v1.0.2 --skill argus
```

## Credentials

Only Argus needs app credentials; Arkclaw fixes the region to `cn`. See the [usage guide](usage.md#credentials-and-upload-consent) for environment variables, existing credential files, secure setup, and upload consent. See [SUPPORT.md](../SUPPORT.md) if the account lacks Argus capability.

## After install

See the [usage guide](usage.md) for Blender invocation and deliverables. For Argus, after dependencies, credentials, and upload consent are ready, the host invokes:

```bash
node <skillDir>/scripts/run-argus.mjs start --image /absolute/a.jpg --workspace /absolute/workspace --yes --json
node <skillDir>/scripts/run-argus.mjs status --workspace /absolute/workspace/<run-dir> --json
node <skillDir>/scripts/run-argus.mjs collect --workspace /absolute/workspace/<run-dir> --json
```

There is no detached background poller. Durable output is local `output.zip`, its validated extraction, and `result.json`.
