# Realsee API 流程

[English](api-workflow.md) | [简体中文](api-workflow.zh-CN.md)

1. 从环境或当前目录 `.env` 读取凭据并解析区域。
2. `POST /auth/access_token` 获取访问令牌。
3. `GET /open/v1/pano/file/token` 获取上传令牌。
4. 使用 `@realsee/universal-uploader` 上传 ZIP。
5. `POST /open/v1/pano/task/submit` 创建任务。
6. 轮询 `GET /open/v1/pano/task/status`。
7. 返回 `task_code`、`project_id`、`vr_url` 和 workspace。

[源 API 契约](pano-to-vr.openapi.json) 随 skill 保留。本地进度写入 stderr，`--json` 的最终结果写入 stdout。访问令牌缓存在内存并在轮询时刷新，每个任务使用独立 workspace。`--task-code` 跳过上传并续查。失败时尽可能保留 `result.json`。

状态文件可能保存上传路径与临时下载地址。请保持私有，不要将日志或 workspace 纳入发布包。轮询超时不等于远程任务失败；提交结果未知时先核实，不自动重提。
