# Argus Gateway 工作流

[English](api-workflow.md) | [简体中文](api-workflow.zh-CN.md)

本文记录 Argus Skill 2.x 使用的公开 Gateway 工作流。机器可读契约见 [argus-gateway-openapi.json](argus-gateway-openapi.json)。

## 1. 预检与规范化

发起任何网络请求前，Skill 会：

- 读取 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET` 和 `REALSEE_REGION`；
- 确认上传授权；
- 校验 1–99 张严格 2:1 的 JPEG、PNG 或 WebP RGB8 全景图；
- 必要时安全解压输入 ZIP，再将所有输入规范化并重新打包为一个确定性 ZIP；
- 仅将不含敏感信息的输入元数据写入 schema v2 `state.json`。

Gateway 基础地址保持不变：

- `global`：`https://app-gateway.realsee.ai`
- `cn`：`https://app-gateway.realsee.cn`

## 2. Start

`start` 依次执行四个远端操作：

1. `POST /auth/access_token`
2. `GET /open/v1/argus/file/token`
3. 将一个规范化 ZIP 流式上传到对象存储
4. 使用仅包含一个已上传对象路径的 `private_cos_keys` 数组和 `title` 调用 `POST /open/v1/argus/task/submit`

上传 lease locator 为 `bucket + region + prefix`。上传凭证可以仅在内存中刷新，但绝不能写入状态文件。`start` 会原子持久化返回的 `task_code`，然后立即结束。

任务提交不具备幂等性，客户端绝不自动重试。如果请求可能已经到达服务端、但响应不可用，状态会变为 `submission_unknown`。调用方不得盲目重新提交。

## 3. Status

`status` 只发起一次 `GET /open/v1/argus/task/info?task_code=...`，并按下表映射 Gateway 数字状态：

| Gateway | 本地 `task_status` |
| --- | --- |
| `0` | `queued` |
| `1` | `processing` |
| `2` | `succeeded` |
| `3` | `failed` |

它不会在后台轮询。由 Agent 或调用方决定何时再次执行。临时结果 URL 只在内存中使用，绝不写入 `state.json` 或 `result.json`。

## 4. Collect

`collect` 会查询一次任务信息。远端任务成功后，它会原子下载并保留 `output.zip`，校验传输长度以及 Gateway 可选返回的 size 或 MD5，校验 ZIP CRC 与安全解压限制，然后安全解压。

随后 collector 会校验 [argus-output.schema.json](argus-output.schema.json)、产物路径与 ID、引用文件存在性、GLB/EXR magic，以及成功集合与缺失集合的一致性。它会写入只包含持久本地路径的 `result.json` 索引。完成后的 `collect` 具备幂等性：重复调用既不会重新提交任务，也不会重复下载结果。

算法 manifest 的 `status` 会映射为本地 `result_status`（`success`、`partial` 或 `error`），与远端 `task_status` 相互独立。`partial` 是成功的 CLI 结果，但必须显示明确警告和非空 `missing_ids`；`error` 则以非零退出码结束。
