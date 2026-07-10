# Migrating from Argus Skill 1.x to 2.0

[English](migration-v2.md) | [简体中文](migration-v2.zh-CN.md)

Argus Skill 2.0 keeps the Skill ID `argus` but replaces the 1.x VGGT workflow. Existing `v1.0.2` remains the frozen legacy release; no `v1.0` alias is introduced.

## Pin 1.x when you need legacy behavior

Continue using `v1.0.2` if your workflow requires any of the following:

- one square 1:1 image;
- the legacy single-image VGGT endpoints;
- a single downloaded GLB as the complete output;
- the legacy H5 preview URL;
- 1.x `state.json` or `result.json` behavior.

Example pinned install:

```bash
npx skills add realsee-developer/skills@v1.0.2 --skill argus
```

There is no automatic 1.x workspace migration and no 1.x fallback in 2.0.

## Input changes

| 1.x | 2.0 |
| --- | --- |
| One JPEG, square 1:1 or panorama 2:1 | 1–99 JPEG/PNG/WebP panoramas, exact 2:1, RGB8 |
| Image uploaded directly | One normalized ZIP uploaded per task |
| `--image` once plus optional `--type` | Repeat `--image`, or pass one mutually exclusive `--zip` |

A single 2:1 panorama is still valid as a one-image batch.

## Lifecycle changes

Replace synchronous, `--async`, and `--resume` invocations with explicit commands:

```bash
node scripts/run-argus.mjs start --image /absolute/a.jpg --workspace /absolute/workspace --yes --json
node scripts/run-argus.mjs status --workspace /absolute/workspace/<run-dir> --json
node scripts/run-argus.mjs collect --workspace /absolute/workspace/<run-dir> --json
```

`start` returns after submission, `status` queries once, and `collect` downloads and validates only a terminal result. There is no detached poller.

## Output changes

The durable output is `output.zip` plus its safely extracted directory and local `result.json` index. The archive can contain EXR depth maps, one merged GLB, per-image poses, optional intrinsics, and `output.json`.

Read remote `task_status` separately from algorithm `result_status`. A `partial` algorithm result exits successfully but must be handled with its warning and `missing_ids`; `error` exits non-zero.

