# Development Guide

[English](development.md) | [简体中文](zh-CN/development.md)

This repository is a Node.js workspace for Realsee agent skills. Argus 2.0 runtime code and canonical contracts live under `.agents/skills/argus/`.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- No committed `.env` files or generated private artifacts

## Local Checks

Run the complete gate before publishing or updating protected branches:

```bash
npm run ci
```

The gate runs:

```bash
npm run scan:secrets
npm run validate:docs
npm run validate:ai
npm run validate:repo-boundary
npm run validate:skills
npm run rebuild
npm run validate:channel-metadata
npm run test:skill
```

Use focused commands while editing:

| Command | Use |
| --- | --- |
| `npm run validate:ai` | After changing `llms.txt` or repository entry points. |
| `npm run validate:docs` | After changing bilingual repository docs. |
| `npm run validate:skills` | After changing skill metadata, README files, or references. |
| `npm run test:skill` | After changing `argus` code. |
| `npm run rebuild` | Regenerate and byte-check the Claude plugin and CN-only Arkclaw copies. |
| `npm run doctor` | Check local prerequisites through `doctor:local`. |
| `npm run doctor:live` | Check live Argus prerequisites and environment. |

## Skill Workflow

The source of truth is `.agents/skills/argus/`. The Claude plugin is generated into `plugins/realsee-skills/`; the Arkclaw package is generated into `arkclaw/argus/` with deterministic CN-only overlays for runtime region, example downloads, and matching guidance.

When changing `argus`:

1. Edit files under `.agents/skills/argus/`.
2. Run `npm run test:skill`.
3. Run `npm run rebuild`.
4. Run `npm run ci`.

Do not edit either generated copy directly. New runtime behavior should be exercised through `ArgusTaskPort` and `ObjectTransferPort` fakes. Include focused input, lifecycle, output-contract, and idempotence tests.

## Configuration

Public documentation uses only these environment variable names:

- `REALSEE_APP_KEY`
- `REALSEE_APP_SECRET`
- `REALSEE_REGION`

The existing agent-driven `~/.realsee/credentials` loading flow remains supported. Do not commit real values, account identifiers, internal URLs, generated credentials, `output.zip`, extracted artifacts, or temporary workspaces.
