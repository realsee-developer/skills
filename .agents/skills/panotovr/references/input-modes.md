# Input Modes

[English](input-modes.md) | [简体中文](input-modes.zh-CN.md)

The runtime supports two new-run input patterns plus polling resume.

## 1. Image-only mode

Arguments:

```bash
--images-dir /abs/path/to/panoramas
```

Behavior:

- Scan the directory for supported image types.
- Normalize each panorama to `.jpg`.
- Generate date-based `IMG_YYYYMMDD_NNN` IDs.
- Create `manifest.json` automatically.
- Package `manifest.json` and `images/*.jpg` into `upload.zip`.

Use this mode when the user only has a panorama directory and does not want to build `manifest.json` manually.

## 2. Manifest mode

Arguments:

```bash
--manifest /abs/path/to/manifest.json --images-dir /abs/path/to/images
```

Behavior:

- Read and validate the provided manifest.
- Require `version`, `project_name`, `floor_map`, and `scan_list`.
- Resolve each `scan_list[].id` against an image in `images-dir`.
- Normalize matched images to `.jpg` in the workspace.

Use this mode when the user already controls naming, ordering, or floor mapping.

## 3. Resume mode

Arguments:

```bash
--workspace /abs/path/to/workspace --task-code your_task_code
```

Behavior:

- Reuse the existing workspace root
- Skip manifest preparation and upload
- Continue polling until the remote task reaches a terminal state

Use this mode when the first run already submitted the task and only the polling step needs to continue.
