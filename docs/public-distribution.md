# Public Distribution Checklist

[English](public-distribution.md) | [简体中文](zh-CN/public-distribution.md)

Use this checklist for a planned distribution or release change. Current Argus metadata is `2.0.0` / stable / passed; the first 2.0 promotion is historical. See the [release guide](release.md) for gate conditions. Argus-specific runtime and live checks below do not apply to the instruction-only Blender skill.

## Repository and versions

- [ ] `v1.0.2` remains unchanged; no `v1.0` alias exists.
- [ ] Root, Argus runtime package, plugin package, and `release-channel.json` versions agree.
- [ ] For a new preview, the tag matches `next_release_candidate` and the metadata version; metadata remains development/preview/pending until real two-region E2E passes.
- [ ] `npm run ci` and the selected release gate pass on a clean clone.
- [ ] Git status contains no credentials, `.env`, workspaces, output ZIPs, or extracted artifacts.

## Canonical distribution

- [ ] `npm run rebuild` regenerates both `plugins/realsee-skills/` and `arkclaw/argus/`.
- [ ] Claude plugin includes both `argus` and `realsee-blender-reconstruction`, with files byte-identical to their canonical directories under `.agents/skills/`.
- [ ] Arkclaw files are canonical bytes except deterministic CN-only overlays for the runtime region, example downloader, and matching generated guidance.
- [ ] The dedicated Codex installer and Arkclaw package support only Argus; `npx skills add . --skill argus` and `npx skills add . --skill realsee-blender-reconstruction` resolve their respective canonical skills.
- [ ] Versioned installation examples only name tags containing the selected skill; `v2.0.0` does not contain Blender.
- [ ] Plugin manifest has no `userConfig` and no MCP server.

## Argus contracts and docs

- [ ] Gateway OpenAPI contains exactly the four public methods and both bases.
- [ ] Bilingual algorithm I/O docs agree on auto IDs, `missing_ids`, `error`, optional normals, fixed `right-handed, Y-up`, and EXR-only stable depth.
- [ ] JSON Schema 2020-12 discriminates success/partial/error and requires non-empty unique `missing_ids` for partial.
- [ ] English/Chinese usage and migration docs explain that square/single-GLB users pin `v1.0.2`.
- [ ] No document mentions detached polling, `--async`, `--resume`, or a 2.0 H5 preview as supported behavior.

## Argus runtime verification

- [ ] Input tests cover 1, 99, and 100 images; JPEG/PNG/WebP; invalid ratio/RGB8; duplicate names; nested/corrupt/Zip Slip/Bomb archives.
- [ ] Gateway tests cover paths, methods, envelopes, status mapping, and both region bases.
- [ ] Lifecycle tests cover upload interruption/lease change, submission-unknown, processing/failure, repeated and concurrent collect, interrupted download, and expired URLs.
- [ ] Artifact tests cover success/partial/error, ID consistency, invalid paths, invalid GLB/EXR, missing pose/depth, optional intrinsics, and atomic recovery.
- [ ] `start`, `status`, and `collect` return the documented JSON and exit codes.

## Uploader release checks

- [ ] `@realsee/universal-uploader@0.1.1` is published and installable.
- [ ] Unit tests, typecheck, build, `npm pack` smoke, and GitLab CI pass.
- [ ] Production dependency audit has no high or critical finding.
- [ ] Argus installs only AWS Node and Tencent COS Node adapter dependencies; no browser COS, OSS, or uploader CLI dependency is pulled in for the Skill.

## Real E2E and promotion

- [ ] The selected Argus release candidate completes a real multi-image run in global/AWS.
- [ ] The selected Argus release candidate completes a real multi-image run in CN/Tencent COS.
- [ ] Both regions verify download plus success, partial, and error handling.
- [ ] Only after those checks, record stable/passed metadata for the selected version, remove `next_release_candidate`, and obtain authorization before publishing a new tag.
- [ ] Test fresh installs through Claude plugin, the Argus-only Codex installer, `npx skills` for each skill, and CN-only Arkclaw.
- [ ] For Blender guidance changes, review input prerequisites, local tool requirements, editable deliverables, and applicable acceptance checks against the canonical skill; do not claim a real reconstruction was run unless it was.
