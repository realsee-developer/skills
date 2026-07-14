# Codex Install

[English](codex.md) | [简体中文](zh-CN/codex.md)

Install the canonical `argus` Skill into Codex:

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
```

For product context, see [Argus](https://argus.realsee.ai/), its [interactive demo](https://h5.realsee.ai/argus), [research site](https://argus-paper.realsee.ai/), and the [Realsee Developer Platform](https://developer.realsee.ai/). Codex must follow the installed Skill contract rather than infer broader capabilities from those pages: Skill 2.0 accepts only 1–99 local RGB8 panoramas with exact 2:1 dimensions.

Pin the stable 2.0 release:

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

The install includes `examples/manifest.json`, but no panorama JPEGs. To use official samples, Codex should ask for the region and a new absolute output directory outside the installed Skill, then run `node <skillDir>/scripts/download-examples.mjs --region <cn|global> --output <absolute-dir>`. The command verifies every manifest byte length and SHA-256 before publishing the directory. A later Argus run still requires separate upload consent and uses the corresponding regional Gateway.

## Credentials

The existing runtime contract is unchanged:

1. inherited `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION`;
2. an existing `~/.realsee/credentials` loaded by the agent;
3. one-field-per-turn collection in the Codex session.

Do not print values or put them in recorded command arguments. To avoid prompts, export the variables before launching Codex.

## Prompt examples

```text
Use $argus to start a batch from /path/a.jpg and /path/b.webp. Report the run workspace.
Use $argus to download and verify the CN examples to /absolute/examples, then ask for upload consent before starting them.
Use $argus to check the status of /workspace/<run-dir> once.
Use $argus to collect /workspace/<run-dir>, then report result_status, missing_ids, and local artifacts.
```

Codex should invoke the explicit lifecycle:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/download-examples.mjs" \
  --region cn --output /absolute/examples

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

`main` is the integration branch. Stable installs use a Git tag. Version 2.0 is promoted only after uploader 0.1.1 and real global/CN E2E have passed.
