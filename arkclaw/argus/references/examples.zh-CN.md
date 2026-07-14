# 官方示例全景图

Argus 2.0 在 `examples/manifest.json` 中提供两组 Realsee 第一方全景图的机器可读清单。当前发布树和所有生成的 Skill 分发包都只包含 manifest，不内置全景 JPEG。

## 示例集

| 区域 | 图片数 | 尺寸 | Manifest 来源 |
|---|---:|---:|---|
| CN | 12 张 JPEG | 16000×8000 | `sets.cn.files` |
| Global | 14 张 JPEG | 8000×4000 | `sets.global.files` |

每个 manifest 条目都包含确定性的 `panoNN.jpg` 文件名、公开 `source_url`、精确 `bytes` 和 SHA-256。图片是 Realsee 第一方官方示例，受本仓库许可证约束，不属于 CC0 或第三方开源素材。

## 下载示例集

选择与 `REALSEE_REGION` 一致的区域，并指定 `<skillDir>` 外一个尚不存在的绝对输出目录。命令退出前，该路径及其父目录应由命令独占；不要并发创建、重命名或替换它们：

```bash
node <skillDir>/scripts/download-examples.mjs \
  --region cn \
  --output "/absolute/example-output"
```

命令按 manifest 顺序读取每个 `source_url`，校验响应字节数与 SHA-256，并通过临时文件下载。整组文件全部通过校验后，才会再次确认指定输出路径不存在，并通过一次原子重命名发布完整 staging 目录。失败时会删除自身的 staging 数据，不发布未经完整校验的示例集。仅支持 CN 的 Arkclaw 分发只接受 `--region cn`。

测试使用进程内本地 HTTP server；默认 CI 不会访问这些 CDN URL。

## 运行已下载示例

下载示例不代表同意把它们上传到 Argus。用户选定已下载文件并同意远程上传后，再把目录展开为可重复的 `--image` 参数：

```bash
example_dir="/absolute/example-output"
image_args=()
for image in "$example_dir"/*.jpg; do
  image_args+=(--image "$image")
done

node <skillDir>/scripts/run-argus.mjs start \
  "${image_args[@]}" \
  --workspace "/absolute/workspace-root" \
  --yes --json
```

此 CN-only Arkclaw 分发不能下载 Global 示例；如需 `--region global`，请使用 canonical、Claude、Codex 或 `npx skills` 安装。也可以只选择其中一部分，只要总数在 1–99 张之间。不要把目录枚举顺序当作图片 ID 合同：CLI 会按规范化文件名确定性排序；消费算法产物时必须使用返回的 `name_mapping`。
