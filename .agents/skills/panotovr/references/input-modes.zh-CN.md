# 输入方式

[English](input-modes.md) | [简体中文](input-modes.zh-CN.md)

新任务有两种输入方式，已有任务可续查。

1. `--images-dir <imagesDir>`：扫描目录根层的 JPEG/PNG/WebP，转成 JPEG，生成日期和序号组成的 `IMG_YYYYMMDD_NNN` ID、manifest，并打包 `manifest.json` 和 `images/*.jpg`。
2. `--manifest <manifestPath> --images-dir <imagesDir>`：要求 `version`、`project_name`、`floor_map`、非空 `scan_list`；每项需要 `id` 和 `floor`。通过 ID 匹配本地图片并规范为 JPEG。参考 [manifest 模板](../assets/manifest.example.json)。
3. `--workspace <workspaceRoot> --task-code <taskCode>`：复用父级 workspace 根目录，跳过准备、上传和提交，仅继续轮询。

图片目录模式只扫描根层文件；manifest 查找使用小写扩展名。运行时不执行 Argus 的尺寸和色彩校验。
