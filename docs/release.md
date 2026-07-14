# Release Guide

[English](release.md) | [简体中文](zh-CN/release.md)

Release readiness is recorded in `release-channel.json` and enforced by `scripts/release-gate.mjs`.

## Version lines

- `v1.0.2` is the frozen legacy release for square input and the old single-GLB workflow. Do not add a mutable or ambiguous `v1.0` tag.
- `v2.0.0` keeps the Skill ID `argus` and uses the multi-panorama ZIP interface. It has no 1.x fallback.

During implementation, metadata stays `channel: development`, `state: preview`, and `stable_gate: pending`. Do not mark 2.0 stable based only on local tests.

## Gates

Preview:

```bash
npm run release:gate -- --channel preview --tag v2.0.0-rc.3
```

Stable:

```bash
npm run release:gate -- --channel stable --tag v2.0.0
```

Both gates run repository checks, regeneration/byte consistency for Claude and Arkclaw packages, and the complete Skill tests. Stable also requires the public four-path Gateway OpenAPI contract.

## Required order

1. Keep the existing `v1.0.2` tag unchanged.
2. Publish and verify `@realsee/universal-uploader@0.1.1`.
3. Cut `v2.0.0-rc.3` and run real multi-image E2E in both CN and global.
4. In both regions verify upload, task completion, success/partial/error collection, and result download.
5. Set release metadata to stable/passed and publish `v2.0.0`.
6. Verify the bilingual migration guide and fresh installs for Claude, Codex, `npx skills`, and CN-only Arkclaw.

The uploader release gate must pass unit tests, type checking, build, `npm pack` install smoke, and production audit with no high or critical vulnerability.

## Live verification record

Do not commit credentials, signed URLs, private task locators, or generated artifacts as evidence. Record only sanitized pass/fail results outside the public repository. Stable requires real AWS/global and Tencent COS/CN runs; local fakes are not a substitute.

## Tag

After every stable condition is met:

```bash
git tag -a v2.0.0 -m "v2.0.0"
git push origin v2.0.0
```

The release workflow runs the stable gate before creating the GitHub release.
