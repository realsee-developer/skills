# Codex Install

[English](codex.md) | [简体中文](zh-CN/codex.md)

Install the canonical `argus` Skill into Codex:

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
```

Pin the stable 2.0 release when available:

```bash
npx skills add realsee-developer/skills@v2.0.0 --skill argus --agent codex
```

Use `@v1.0.2` instead only for legacy square 1:1 or single-GLB behavior.

## Local checkout

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install
(cd .agents/skills/argus && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
CODEX_HOME=$HOME/.codex npm run install:codex-skills
```

Codex discovers the Skill at `${CODEX_HOME:-$HOME/.codex}/skills/argus`. Verify:

```bash
ls -la "${CODEX_HOME:-$HOME/.codex}/skills/argus"
head "${CODEX_HOME:-$HOME/.codex}/skills/argus/SKILL.md"
```

## Credentials

The existing runtime contract is unchanged:

1. inherited `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION`;
2. an existing `~/.realsee/credentials` loaded by the agent;
3. one-field-per-turn collection in the Codex session.

Do not print values or put them in recorded command arguments. To avoid prompts, export the variables before launching Codex.

## Prompt examples

```text
Use $argus to start a batch from /path/a.jpg and /path/b.webp. Report the run workspace.
Use $argus to check the status of /workspace/<run-dir> once.
Use $argus to collect /workspace/<run-dir>, then report result_status, missing_ids, and local artifacts.
```

Codex should invoke the explicit lifecycle:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/run-argus.mjs" start \
  --image /absolute/a.jpg --image /absolute/b.webp \
  --workspace /absolute/workspace --yes --json

node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/run-argus.mjs" status \
  --workspace /absolute/workspace/<run-dir> --json

node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/run-argus.mjs" collect \
  --workspace /absolute/workspace/<run-dir> --json
```

There is no detached poller or resume flag. A completed collect is idempotent. Codex must highlight `partial` and its non-empty `missing_ids`, even though that command exits 0.

## Release policy

`main` is the integration branch. Stable installs use a Git tag. Version 2.0 is promoted only after uploader 0.1.0 and real global/CN E2E have passed.
