# Usage Guide

[English](usage.md) | [简体中文](zh-CN/usage.md)

This repository provides the installable `argus` Skill for Claude Code, Codex, and other hosts supported by `npx skills`.

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

## Input rules

- 1–99 root-level JPEG, PNG, or WebP images.
- RGB, 8-bit, exact 2:1 dimensions.
- Below 2048×1024 is a warning, not a hard failure.
- ZIP paths must be safe and flat; the Skill rejects duplicate stems and Unicode/case-fold collisions.
- A single 2:1 panorama is valid. A square image is not; pin `v1.0.2` for the legacy square workflow.

## Skill files

- Runtime definition: [SKILL.md](../.agents/skills/argus/SKILL.md)
- Skill README: [README.md](../.agents/skills/argus/README.md)
- Gateway contract: [argus-gateway-openapi.json](../.agents/skills/argus/references/argus-gateway-openapi.json)
- Algorithm contract: [algorithm-io.md](../.agents/skills/argus/references/algorithm-io.md)
- Output schema: [argus-output.schema.json](../.agents/skills/argus/references/argus-output.schema.json)
- Machine index: [llms.txt](../llms.txt)

Real Argus runs are remote uploads. Obtain user consent first and do not persist credentials, upload tokens, or signed result URLs.
