# Public Distribution Checklist

[English](public-distribution.md) | [简体中文](zh-CN/public-distribution.md)

Run this checklist before promoting Argus Skill 2.0.

## Repository and versions

- [ ] `v1.0.2` remains unchanged; no `v1.0` alias exists.
- [ ] Root, Skill package, plugin package, and `release-channel.json` versions agree.
- [ ] Preview metadata remains pending until real two-region E2E passes.
- [ ] `npm run ci` and the selected release gate pass on a clean clone.
- [ ] Git status contains no credentials, `.env`, workspaces, output ZIPs, or extracted artifacts.

## Canonical distribution

- [ ] `npm run rebuild` regenerates both `plugins/realsee-skills/` and `arkclaw/argus/`.
- [ ] Claude plugin files are byte-identical to `.agents/skills/argus/`.
- [ ] Arkclaw files are canonical bytes except deterministic CN-only overlays for the runtime region, example downloader, and matching generated guidance.
- [ ] Codex install and `npx skills add . --skill argus` both resolve the same canonical Skill.
- [ ] Plugin manifest has no `userConfig` and no MCP server.

## Contracts and docs

- [ ] Gateway OpenAPI contains exactly the four public methods and both bases.
- [ ] Bilingual algorithm I/O docs agree on auto IDs, `missing_ids`, `error`, optional normals, fixed `right-handed, Y-up`, and EXR-only stable depth.
- [ ] JSON Schema 2020-12 discriminates success/partial/error and requires non-empty unique `missing_ids` for partial.
- [ ] English/Chinese usage and migration docs explain that square/single-GLB users pin `v1.0.2`.
- [ ] No document mentions detached polling, `--async`, `--resume`, or a 2.0 H5 preview as supported behavior.

## Runtime verification

- [ ] Input tests cover 1, 99, and 100 images; JPEG/PNG/WebP; invalid ratio/RGB8; duplicate names; nested/corrupt/Zip Slip/Bomb archives.
- [ ] Gateway tests cover paths, methods, envelopes, status mapping, and both region bases.
- [ ] Lifecycle tests cover upload interruption/lease change, submission-unknown, processing/failure, repeated and concurrent collect, interrupted download, and expired URLs.
- [ ] Artifact tests cover success/partial/error, ID consistency, invalid paths, invalid GLB/EXR, missing pose/depth, optional intrinsics, and atomic recovery.
- [ ] `start`, `status`, and `collect` return the documented JSON and exit codes.

## Uploader gate

- [ ] `@realsee/universal-uploader@0.1.1` is published and installable.
- [ ] Unit tests, typecheck, build, `npm pack` smoke, and GitLab CI pass.
- [ ] Production dependency audit has no high or critical finding.
- [ ] Argus installs only AWS Node and Tencent COS Node adapter dependencies; no browser COS, OSS, or uploader CLI dependency is pulled in for the Skill.

## Real E2E and promotion

- [ ] `v2.0.0-rc.3` completes a real multi-image run in global/AWS.
- [ ] `v2.0.0-rc.3` completes a real multi-image run in CN/Tencent COS.
- [ ] Both regions verify download plus success, partial, and error handling.
- [ ] Only after those checks, set `state: stable`, `stable_gate: passed`, and publish `v2.0.0`.
- [ ] Test fresh installs through Claude plugin, Codex, `npx skills`, and CN-only Arkclaw.
