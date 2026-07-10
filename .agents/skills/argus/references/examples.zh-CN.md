# 官方示例全景图

Argus 2.0 内置两组 Realsee 第一方全景图。它们替换原先的 Wikimedia/第三方开源示例，Skill 安装完成后无需再次下载。

## 示例集

| 区域 | 目录 | 图片数 | 尺寸 |
|---|---|---:|---:|
| CN | `<skillDir>/examples/cn/` | 12 张 JPEG | 16000×8000 |
| Global | `<skillDir>/examples/global/` | 14 张 JPEG | 8000×4000 |

所有文件均为 RGB、8-bit、严格 2:1 的 JPEG 全景图，名称为 `panoNN.jpg`。`examples/manifest.json` 是权威的机器可读清单，记录每个文件的公开来源 URL、字节数与 SHA-256。图片是 Realsee 第一方官方示例，受本仓库许可证约束，不属于 CC0 或第三方开源素材。

应选择与 `REALSEE_REGION` 相同的示例集。文件虽然已内置在本地，但 Argus 运行仍会把所选图片发送到 Realsee 远程服务，必须取得用户的上传同意。

## 运行完整示例集

下面的 Bash/Zsh 命令把选定目录展开为可重复的 `--image` 参数：

```bash
example_dir="<skillDir>/examples/cn"
image_args=()
for image in "$example_dir"/*.jpg; do
  image_args+=(--image "$image")
done

node <skillDir>/scripts/run-argus.mjs start \
  "${image_args[@]}" \
  --workspace "/absolute/workspace-root" \
  --yes --json
```

Global 示例使用 `examples/global` 与 `REALSEE_REGION=global`。也可以只选其中一部分，只要总数在 1–99 张之间。

不要把目录枚举顺序当作图片 ID 合同。CLI 会按规范化文件名确定性排序；消费算法产物时必须使用返回的 `name_mapping`。
