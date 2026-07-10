# Install Guide Overview

[English](install-guides.md) | [简体中文](zh-CN/install-guides.md)

Every install path uses the same canonical `argus` Skill 2.0 source and explicit `start` / `status` / `collect` lifecycle.

## Host matrix

| Host | Install | Skill handle | Guide |
| --- | --- | --- | --- |
| Claude Code | `/plugin marketplace add realsee-developer/skills`, then `/plugin install realsee-skills@realsee-developer-skills` | `realsee-skills:argus` | [Claude Code](claude-plugin.md) |
| Codex | `npx skills add realsee-developer/skills --skill argus --agent codex` | `$argus` | [Codex](codex.md) |
| Any detected host | `npx skills add realsee-developer/skills --skill argus --agent '*'` | Host-specific | This guide |
| Arkclaw | Published Arkclaw ZIP | `argus` | CN-only |

For the active host only:

```bash
npx skills add realsee-developer/skills --skill argus
```

## Reproducible versions

Use a release tag when a reproducible install matters:

```bash
npx skills add realsee-developer/skills@v2.0.0 --skill argus
```

Pin `v1.0.2` only for legacy square 1:1 input, the old single-GLB output, or legacy preview behavior:

```bash
npx skills add realsee-developer/skills@v1.0.2 --skill argus
```

## Credentials

All hosts use `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION` (`global` or `cn`). The existing Skill flow checks inherited shell environment first, then an agent-loaded `~/.realsee/credentials`, then asks one field per turn. Arkclaw fixes the region to `cn`.

Never print credentials or pass them as recorded command arguments. See [SUPPORT.md](../SUPPORT.md) if the target account does not have Argus capability.

## After install

The host invokes:

```bash
node <skillDir>/scripts/run-argus.mjs start --image /absolute/a.jpg --workspace /absolute/workspace --yes --json
node <skillDir>/scripts/run-argus.mjs status --workspace /absolute/workspace/<run-dir> --json
node <skillDir>/scripts/run-argus.mjs collect --workspace /absolute/workspace/<run-dir> --json
```

There is no detached background poller. Durable output is local `output.zip`, its validated extraction, and `result.json`.
