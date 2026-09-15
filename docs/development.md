# Development Guide

[English](development.md) | [简体中文](zh-CN/development.md)

This repository maintains Realsee agent skills under `.agents/skills/`: Argus has a Node.js runtime and API contracts; `realsee-blender-reconstruction` contains local modeling instructions and references.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- Local Blender for exercising reconstruction instructions; no Realsee credentials are needed for local modeling
- No committed `.env` files or generated private artifacts

## Maintainer setup

Run `npm run setup:local` to install locked Argus dependencies with lifecycle scripts disabled, rebuild both distributions, and run the Argus local diagnostic. The repository root has no dependencies. Missing Argus credentials do not block maintenance; configure them only for an Argus run. Skill users should follow the [installation guide](install-guides.md).

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
npm run test:repo
npm run test:skill
```

Use focused commands while editing:

| Command | Use |
| --- | --- |
| `npm run validate:ai` | After changing `llms.txt` or repository entry points. |
| `npm run validate:docs` | After changing bilingual repository docs. |
| `npm run validate:skills` | After changing skill metadata, README files, or references. |
| `npm run test:repo` | After changing repository tooling or distribution behavior. |
| `npm run test:skill` | After changing `argus` code. |
| `npm run rebuild` | Regenerate and byte-check the Claude plugin and CN-only Arkclaw copies. |
| `npm run doctor` | Check Argus by default; use `-- --skill realsee-blender-reconstruction` for Blender. Structured diagnostics: [agent preflight](install-guides.md#agent-preflight). |
| `npm run doctor:live -- --skill argus --channel preview` | Check required configuration presence only; the no-side-effect capability probe is not implemented. Stable mode fails without that verification. |

## Skill Workflow

The source of truth for all skills is `.agents/skills/`. Claude includes both canonical skills; Arkclaw includes only Argus. The Claude plugin is generated into `plugins/realsee-skills/`; the Arkclaw package is generated into `arkclaw/argus/` with deterministic CN-only overlays for runtime region, example downloads, and matching guidance.

When changing `argus`:

1. Edit files under `.agents/skills/argus/`.
2. Run `npm run test:skill`.
3. Run `npm run rebuild`.
4. Run `npm run ci`.

Do not edit either generated copy directly. New runtime behavior should be exercised through `ArgusTaskPort` and `ObjectTransferPort` fakes. Include focused input, lifecycle, output-contract, and idempotence tests.

For Blender instructions, edit `.agents/skills/realsee-blender-reconstruction/` and its bilingual references, then run `npm run validate:skills`, `npm run rebuild`, and `npm run ci`. Documentation checks do not prove modeling behavior: when changing the modeling workflow, exercise the affected instructions on appropriate local evidence and report the actual scope verified. No npm runtime or remote-service fake is required for this instruction-only skill.

## Configuration

Argus configuration uses these environment variables:

- `REALSEE_APP_KEY`
- `REALSEE_APP_SECRET`
- `REALSEE_REGION`

Follow the [Argus credential setup](usage.md#credentials-and-upload-consent) for inherited environment values, an existing `~/.realsee/credentials`, and secure local configuration of missing values. Persist app credentials only with explicit user authorization, outside the repository with mode 0600. Never persist temporary upload tokens or signed URLs. Do not commit real values, account identifiers, internal URLs, generated credentials, `output.zip`, extracted artifacts, or temporary workspaces.
