# Argus Algorithm Input and Output Contract

[English](algorithm-io.md) | [简体中文](algorithm-io.zh-CN.md)

This document is the canonical algorithm-side contract consumed by Argus Skill 2.x. It describes the normalized ZIP sent to the algorithm and the `output.zip` returned by it. The machine-readable `output.json` contract is [argus-output.schema.json](argus-output.schema.json).

## 1. Input ZIP

The archive contains only images at its root:

```text
input.zip
├── kitchen.jpg
├── living-room.png
└── terrace.webp
```

Each archive must contain 1–99 images. Every image must be JPEG, PNG, or WebP; RGB; 8-bit per channel; and an exact 2:1 equirectangular panorama (`width == 2 * height`). A resolution below 2048×1024 is accepted with a quality warning. Square images and other aspect ratios are not part of this contract.

The Skill rejects directories, non-image entries, path traversal, control characters, duplicate stems, and filename collisions after Unicode NFC normalization and case folding. It normalizes filenames to UTF-8 NFC, sorts them by NFC UTF-8 byte order, and writes a new deterministic ZIP even when the caller supplies an existing archive.

The algorithm assigns zero-padded six-digit IDs in normalized input order, starting at `000000`. Original names, including extensions, are recorded only in `output.json#name_mapping`. Consumers must use that mapping; they must not derive IDs from filenames.

## 2. Output ZIP

```text
output.zip
├── output.json
├── depth/
│   ├── 000000_depth.exr
│   └── 000001_depth.exr
├── pointcloud/
│   └── merged.glb
├── pose/
│   ├── 000000_pose.json
│   └── 000001_pose.json
└── intrinsics/                 # optional
    ├── 000000_intrinsics.json
    └── 000001_intrinsics.json
```

`output.json` is required. Referenced files must use safe relative paths, exist in the archive, and match their declared type. Unreferenced files and duplicate archive paths are invalid.

### Depth maps

Argus Skill 2.0 formally supports EXR depth only: 32-bit floating-point values in meters. Each successful image has exactly one depth map. Its resolution is declared by `depth_maps[].resolution`; there is no `config.max_resolution` field. PNG depth is not part of the stable contract until a mandatory `value_scale_to_meter` field is defined.

### Merged point cloud

All successfully reconstructed frames contribute to `pointcloud/merged.glb`. The coordinate system is fixed to `right-handed, Y-up`. Vertex color and normals are described independently by `has_color` and `has_normals`; normals are optional and consumers must not assume `has_normals` is `true`.

### Camera pose

Each successful image has one pose document:

```json
{
  "image_id": "000000",
  "rotation": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  "translation": [0, 0, 0],
  "coordinate_system": "right-handed, Y-up"
}
```

`rotation` is a 3×3 world-to-camera matrix. `translation` is the world origin expressed in camera coordinates.

### Camera intrinsics

Intrinsics are optional. When present, an entry uses the equirectangular model:

```json
{
  "image_id": "000000",
  "width": 4096,
  "height": 2048,
  "focal_x": 2048,
  "focal_y": 2048,
  "principal_x": 2048,
  "principal_y": 1024,
  "model": "equirectangular"
}
```

Focal values are descriptive for equirectangular panoramas.

## 3. `output.json`

`status` is a discriminator with three variants:

- `success`: every input ID appears once in `depth_maps` and `poses`; `missing_ids` and `error` are absent.
- `partial`: `missing_ids` is required, non-empty, and unique. Successful IDs appear once in both `depth_maps` and `poses`; missing IDs appear in neither. The two sets together equal the IDs in `name_mapping`.
- `error`: only `version`, `status`, and `error` are valid.

`intrinsics`, when present, may contain only successful IDs and may omit some or all successful IDs.

Example success manifest:

```json
{
  "version": "1.0",
  "status": "success",
  "name_mapping": {
    "000000": "kitchen.jpg",
    "000001": "living-room.png"
  },
  "depth_maps": [
    {
      "image_id": "000000",
      "path": "depth/000000_depth.exr",
      "format": "exr",
      "resolution": [4096, 2048],
      "unit": "meter"
    },
    {
      "image_id": "000001",
      "path": "depth/000001_depth.exr",
      "format": "exr",
      "resolution": [4096, 2048],
      "unit": "meter"
    }
  ],
  "point_cloud": {
    "path": "pointcloud/merged.glb",
    "format": "glb",
    "vertex_count": 1234567,
    "has_color": true,
    "has_normals": false,
    "coordinate_system": "right-handed, Y-up"
  },
  "poses": [
    {"image_id": "000000", "path": "pose/000000_pose.json", "format": "json"},
    {"image_id": "000001", "path": "pose/000001_pose.json", "format": "json"}
  ]
}
```

Example terminal error:

```json
{
  "version": "1.0",
  "status": "error",
  "error": {
    "code": "RECONSTRUCTION_FAILED",
    "message": "No frame could be reconstructed."
  }
}
```

## 4. Consumer Validation

Schema validation is necessary but not sufficient. Consumers must additionally verify:

1. every referenced path is normalized, relative, unique, and present;
2. every referenced ID exists in `name_mapping`;
3. depth and pose IDs are unique and identical;
4. success IDs plus `missing_ids` exactly equal the mapped IDs;
5. `missing_ids` does not intersect any successful artifact set;
6. the GLB begins with the `glTF` magic and every EXR begins with the OpenEXR magic bytes;
7. pose and intrinsics documents identify the same ID as their manifest entry.

