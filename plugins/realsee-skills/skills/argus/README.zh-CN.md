# argus

![Skill argus](https://img.shields.io/badge/skill-realsee--argus-6f42c1?style=flat-square)
![Version 2.0](https://img.shields.io/badge/version-2.0.0-blue?style=flat-square)
![Upload consent](https://img.shields.io/badge/upload-consent%20required-brown?style=flat-square)

[English](README.md) | 简体中文

`argus` 把 1–99 张本地 2:1 全景图规范化打包成一个 ZIP，提交 Realsee Argus 任务，并收集经过校验的 `output.zip`。产物包含 EXR 深度图、一个合并 GLB 点云、逐图位姿、可选内参和 `output.json`。

2.0 保持 Skill ID 为 `argus`，但不包含旧版单图 VGGT fallback。1:1 方图、旧版仅单 GLB 输出或旧 preview 行为请固定到 `v1.0.2`。详见[迁移指南](references/migration-v2.zh-CN.md)。

## 安装依赖

在本包目录运行：

```bash
npm install
```

需要 Node.js 22 或更高版本。

## 显式生命周期

从多张图片启动：

```bash
node scripts/run-argus.mjs start \
  --image /absolute/path/a.jpg \
  --image /absolute/path/b.png \
  --workspace /absolute/workspace-root \
  --yes --json
```

或从一个现成 ZIP 启动：

```bash
node scripts/run-argus.mjs start \
  --zip /absolute/path/input.zip \
  --workspace /absolute/workspace-root \
  --yes --json
```

记录返回的 `workspace_dir`，之后每次显式查询一次：

```bash
node scripts/run-argus.mjs status --workspace /absolute/workspace-root/<run-dir> --json
```

远端任务成功后收集：

```bash
node scripts/run-argus.mjs collect --workspace /absolute/workspace-root/<run-dir> --json
```

不再有 detached poller、`--async` 或 `--resume`。`start`、`status`、`collect` 通过 schema-v2 `state.json` 独立恢复；已经完成的 `collect` 可幂等重复调用。

## 输入合同

- 1–99 张 JPEG、PNG 或 WebP。
- RGB、8-bit，严格满足 `width == 2 * height`。
- 建议至少 2048×1024；更小只产生警告。
- `--image` 可重复，并与 `--zip` 互斥。
- ZIP 根目录只能有图片；Skill 会安全校验并确定性重新打包。

上传前会拒绝嵌套条目、路径穿越、控制字符、重复 stem，以及 Unicode/case-fold 后的文件名冲突。

## 结果合同

`task_status` 表示远端生命周期：`queued`、`processing`、`succeeded` 或 `failed`。`result_status` 独立表示算法产物：`success`、`partial` 或 `error`。

本地 `result.json` 索引：

- 保留的 `output.zip` 与解压目录；
- `output.json`；
- `pointcloud/merged.glb`；
- EXR 深度图与 JSON 位姿；
- 可选内参；
- warnings 与 `missing_ids`。

`partial` 退出码为 0，但一定带醒目警告和非空缺失 ID 列表；`error` 非零退出。

## 配置与安全

继续使用现有环境变量合同：

- `REALSEE_APP_KEY`
- `REALSEE_APP_SECRET`
- `REALSEE_REGION`（`global` 或 `cn`）

真实运行会把规范化输入 ZIP 上传到 Realsee 远程服务。上传前必须取得用户同意。凭证、上传 token、provider 原始错误和签名结果 URL 不得写入 workspace state 或公开日志。

Arkclaw 构建仅支持 CN。Canonical、Claude plugin、Codex 与 `npx skills` 安装同时支持两个 Gateway region。

## 合同

- [Gateway OpenAPI](references/argus-gateway-openapi.json)
- [算法输入输出](references/algorithm-io.zh-CN.md) / [English](references/algorithm-io.md)
- [`output.json` JSON Schema](references/argus-output.schema.json)
- [从 1.x 迁移](references/migration-v2.zh-CN.md) / [English](references/migration-v2.md)
