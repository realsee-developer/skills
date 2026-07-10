# 故障排查

[English](troubleshooting.md) | [简体中文](troubleshooting.zh-CN.md)

## 缺少凭证或区域

Argus 需要 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET` 和 `REALSEE_REGION`（`global` 或 `cn`）。不要将凭证值写入命令参数、日志、Issue、`state.json` 或 `result.json`。

## 输入在上传前被拒绝

请使用可重复的 `--image` 参数，或只提供一个 `--zip`，两者不能同时使用。一个批次必须包含 1–99 张位于根目录的 JPEG、PNG 或 WebP RGB8 图片，且尺寸严格为 2:1。1:1 方图属于旧版工作流；如需该能力，请将 Skill 固定在 `v1.0.2`。

嵌套路径、路径穿越、控制字符、重复 stem，以及 Unicode/case-fold 文件名冲突都会被拒绝。低于 2048×1024 只会产生警告，不会导致校验失败。

## `submission_unknown`

提交请求可能已经到达 Gateway，但响应丢失。不要对同一输入重新运行 `start`：提交不会自动重试，因为这可能创建重复的远端任务。请保留该 run 目录以便排查。

## 任务仍在排队或处理中

CLI 不会启动 detached poller。稍后再次执行 `status --workspace <run-dir> --json`。每次 `status` 调用只查询一次远端状态。

## 结果 URL 已过期

再次执行 `collect`。它会重新获取任务信息，并仅在内存中使用当前临时 URL。签名 URL 不会保存到磁盘。

## 部分结果

部分重建以退出码 0 结束，但会返回 `result_status: partial`、明确警告和 `missing_ids`。只使用本地结果索引及算法 manifest 中列出的产物 ID。

## 输出归档无效

Collector 会拒绝不安全路径、错误 CRC、不完整引用、无效 manifest 分支，以及 GLB 或 EXR magic 不匹配的文件。部分解压目录不会被视为完成结果；仅在错误被标记为可重试时再次执行 `collect`。
