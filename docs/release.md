# Release Guide

[English](release.md) | [简体中文](zh-CN/release.md)

Release readiness is recorded in `release-channel.json` and enforced by `scripts/release-gate.mjs`. Current metadata records version `2.1.0`, channel `stable`, and Argus `state: stable` / `stable_gate: passed`; it does not declare a separate Blender release state.

## Version lines

- `v1.0.2` is the frozen legacy release for square input and the old single-GLB workflow. Do not add a mutable or ambiguous `v1.0` tag.
- `v2.0.0` keeps the Skill ID `argus` and uses the multi-panorama ZIP interface, without a 1.x fallback. That tag does not contain `realsee-blender-reconstruction`.
- `v2.1.0` packages both skills and retains the Argus 2.0 API and artifact contract. It carries forward the existing Argus stable status; this packaging and guidance release does not claim a new remote E2E run or an actual Blender reconstruction.

## Current gates

For the currently recorded stable version:

```bash
npm run release:gate -- --channel stable --tag v2.1.0
```

A preview gate requires a prerelease tag whose base version matches the metadata version and whose full value equals `skills.argus.next_release_candidate`. Metadata must also be `channel: development`, `state: preview`, and `stable_gate: pending`. Current stable metadata has no pending candidate, so it cannot pass a preview gate. Select and record the next candidate only as part of an authorized release change.

Both gates run secret scanning, documentation and AI index validation, repository boundary and skill validation, distribution rebuild, generated-file cleanliness, smoke checks, worktree cleanliness, channel metadata validation, `test:repo`, `test:skill`, and the Argus production dependency audit. Compared with `npm run ci`, release gates additionally check generated-file/worktree cleanliness, run smoke checks, and audit production dependencies. Run them from a clean checkout with dependencies installed; they regenerate distributions.

Stable additionally requires the public Gateway OpenAPI contract (four required operations, required schemas, and both region bases), a matching stable version/tag, `stable/stable/passed` metadata, both CN/global regions, and no `next_release_candidate`. Metadata records maintainer approval of real two-region E2E; the gate does not perform those remote runs itself.

## Historical first 2.0 promotion

The first 2.0 promotion sequence used `@realsee/universal-uploader@0.1.1`, then `v2.0.0-rc.3` for real multi-image verification in CN and global, and finally stable/passed metadata and `v2.0.0`. These are historical release steps, not instructions to recreate or overwrite existing tags.

For an uploader release, verify unit tests, type checking, build, `npm pack` install smoke, and a production audit with no high or critical vulnerability. For an Argus promotion, verify upload, task completion, success/partial/error collection, result download, bilingual migration guidance, and fresh supported-host installs against the selected candidate. See the [distribution checklist](public-distribution.md).

## Live verification and publishing

Do not commit credentials, signed URLs, private task locators, or generated artifacts as evidence. Record only sanitized pass/fail results outside the public repository. Promoting an Argus preview to stable requires real AWS/global and Tencent COS/CN verification; local fakes are not a substitute. The v2.1.0 packaging and guidance release retains the already-stable remote contract and carries forward its existing status; it is not a new preview-to-stable promotion. Obtain upload consent for those runs.

Publishing requires explicit authorization and a new, approved tag; preserve existing tags. The release workflow classifies the pushed tag, runs its preview or stable gate, then rebuilds from a fresh checkout, checks committed generated files, builds and verifies the Arkclaw ZIP, and creates the GitHub release.
