# Release Guide

[English](release.md) | [简体中文](zh-CN/release.md)

Release readiness is controlled by `release-channel.json` and `scripts/release-gate.mjs`.

## Channels

The repository currently tracks `argus` as a stable skill:

- `channel`: `stable` for the published release (`development` is reserved for active build branches)
- `state`: `stable`
- `stable_gate`: `passed`

Preview releases validate repository health and skill behavior. Stable releases also validate the public Gateway OpenAPI contract.

## Preview Gate

Run:

```bash
npm run release:gate -- --channel preview --tag manual-preview-check
```

The preview gate runs the same command sequence as `npm run ci`.

## Stable Gate

Run:

```bash
npm run release:gate -- --channel stable --tag v0.0.0
```

The stable gate requires:

- A public Gateway OpenAPI contract in `.agents/skills/argus/references/argus-gateway-openapi.json`
- Successful skill tests and repository validation

Do not promote a skill to stable until the public contract is current and live capability has been validated outside the public repository.

## GitHub Workflow

`.github/workflows/release-gate.yml` runs the release gate on:

- pushes to `main`
- pushes to `test/**`
- pushes to `stable/**`
- pull requests targeting `main`
- manual workflow dispatch

Manual dispatch accepts a `channel` of `preview` or `stable` and a validation `tag`.
