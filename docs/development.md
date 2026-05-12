# Development Guide

[English](development.md) | [简体中文](zh-CN/development.md)

This repository is a Node.js workspace for Realsee agent skills. Runtime skill code lives under `.agents/skills/argus/`.

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
| `npm run rebuild` | After changing source skill files copied into `plugins/realsee-skills/`. |
| `npm run doctor` | Check local prerequisites through `doctor:local`. |
| `npm run doctor:live` | Check live Argus prerequisites and environment. |

## Skill Workflow

The source of truth for skills is `.agents/skills/`. The Claude plugin bundle is generated into `plugins/realsee-skills/`.

When changing `argus`:

1. Edit files under `.agents/skills/argus/`.
2. Run `npm run test:skill`.
3. Run `npm run rebuild`.
4. Run `npm run ci`.

## Configuration

Public documentation uses only these environment variable names:

- `REALSEE_APP_KEY`
- `REALSEE_APP_SECRET`
- `REALSEE_REGION`
- `REALSEE_POLL_INTERVAL_MS`
- `REALSEE_POLL_MAX_ATTEMPTS`

Do not commit real values, account identifiers, internal URLs, generated credentials, downloaded GLB files, or temporary preview outputs.
