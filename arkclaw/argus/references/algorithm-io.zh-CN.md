# Argus 算法输入输出规范

[English](algorithm-io.md) | 简体中文

本文是 Argus Skill 2.x 使用的算法侧 canonical 合同，定义 Skill 发送给算法的规范化 ZIP，以及算法返回的 `output.zip`。`output.json` 的机器可读合同见 [argus-output.schema.json](argus-output.schema.json)。

## 1. 输入 ZIP

压缩包根目录只能包含图片：

```text
input.zip
├── 客厅.jpg
├── 厨房.png
└── 露台.webp
```

每个压缩包包含 1–99 张图片。每张图片必须为 JPEG、PNG 或 WebP，RGB 三通道、每通道 8-bit，并且是严格 2:1 的等距矩形全景图（`width == 2 * height`）。低于 2048×1024 只产生质量警告，不作为硬失败。方图和其他宽高比不属于本合同。

Skill 会拒绝目录、非图片条目、路径穿越、控制字符、重复 stem，以及 Unicode NFC 规范化或 case-fold 后冲突的文件名。它把文件名规范化为 UTF-8 NFC，按 NFC 后的 UTF-8 字节序排序；即使调用者提供现成 ZIP，也会安全解包并重新生成确定性 ZIP。

算法按规范化后的输入顺序分配六位补零 ID，从 `000000` 开始。带扩展名的原始文件名只记录在 `output.json#name_mapping` 中。消费者必须信任该映射，不能从文件名自行推导 ID。

## 2. 输出 ZIP

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
└── intrinsics/                 # 可选
    ├── 000000_intrinsics.json
    └── 000001_intrinsics.json
```

`output.json` 必选。它引用的文件必须使用安全相对路径、真实存在于压缩包内，并与声明类型一致。未被引用的文件或重复压缩路径均视为无效。

### 深度图

Argus Skill 2.0 正式承诺的深度格式只有 EXR：32-bit 浮点，单位为米。每个成功图像恰好对应一张深度图。实际分辨率由 `depth_maps[].resolution` 声明，不存在 `config.max_resolution`。在强制提供 `value_scale_to_meter` 之前，PNG 深度不属于 stable 合同。

### 合并点云

所有成功重建的帧合并到 `pointcloud/merged.glb`。坐标系固定为 `right-handed, Y-up`。顶点颜色和法线分别由 `has_color`、`has_normals` 描述；法线是可选能力，消费者不能假设 `has_normals` 恒为 `true`。

### 相机位姿

每个成功图像有一份位姿文档：

```json
{
  "image_id": "000000",
  "rotation": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  "translation": [0, 0, 0],
  "coordinate_system": "right-handed, Y-up"
}
```

`rotation` 是 3×3 的世界坐标系到相机坐标系旋转矩阵；`translation` 是世界原点在相机坐标系中的位置。

### 相机内参

内参是可选产物。存在时使用等距矩形模型：

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

对于等距矩形全景图，焦距字段仅作描述参考。

## 3. `output.json`

`status` 是判别字段，共三种变体：

- `success`：每个输入 ID 在 `depth_maps` 和 `poses` 中各出现一次；不存在 `missing_ids` 和 `error`。
- `partial`：必须提供非空且唯一的 `missing_ids`。成功 ID 在 `depth_maps` 和 `poses` 中各出现一次，缺失 ID 不出现在二者中；两个集合的并集必须等于 `name_mapping` 的 ID 集合。
- `error`：只允许 `version`、`status`、`error` 三个字段。

`intrinsics` 存在时只能引用成功 ID，但允许只覆盖部分成功 ID或完全省略。

成功示例：

```json
{
  "version": "1.0",
  "status": "success",
  "name_mapping": {
    "000000": "客厅.jpg",
    "000001": "厨房.png"
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

终态错误示例：

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

## 4. 消费侧校验

通过 JSON Schema 只是必要条件，消费者还必须验证：

1. 所有引用路径都已规范化、是相对路径、唯一且存在；
2. 每个引用 ID 都存在于 `name_mapping`；
3. 深度与位姿 ID 各自唯一，且两个集合完全相同；
4. 成功 ID 与 `missing_ids` 的并集恰好等于映射 ID；
5. `missing_ids` 与任何成功产物集合不相交；
6. GLB 以 `glTF` magic 开头，每个 EXR 以 OpenEXR magic bytes 开头；
7. 位姿和内参文档中的 ID 与 manifest 条目一致。

