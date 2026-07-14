# 使用指南

[English](../usage.md) | 简体中文

本仓库提供可安装到 Claude Code、Codex 和其他 `npx skills` 支持宿主的 `argus` Skill。

官方资料：[Argus 官网](https://argus.realsee.ai/)、[交互 Demo](https://h5.realsee.ai/argus)、[研究主页](https://argus-paper.realsee.ai/)和 [Realsee Developer Platform](https://developer.realsee.ai/)。这些站点可能展示更广的照片和产品工作流；本文所述 Skill 只接受 1–99 张本地 RGB8 且严格 2:1 的全景图。

## 安装

```bash
npx skills add realsee-developer/skills --skill argus
npx skills add realsee-developer/skills --skill argus --agent claude-code
npx skills add realsee-developer/skills --skill argus --agent codex
npx skills add realsee-developer/skills --skill argus --agent '*'
```

从本地 checkout 安装：

```bash
npx skills add . --skill argus
```

## 官方示例清单

安装后的 Skill 包含 `examples/manifest.json`，不包含全景 JPEG。需要第一方示例时，请选择与 `REALSEE_REGION` 一致的区域，并指定 `<skillDir>` 外一个尚不存在的绝对目录：

```bash
node <skillDir>/scripts/download-examples.mjs \
  --region cn \
  --output /absolute/example-output
```

下载器读取 manifest 的 `source_url`，逐文件校验 `bytes` 与 SHA-256，并在整组通过后才发布目录。已下载示例可像自有全景图一样通过重复的 `--image` 传入。下载不等于上传同意；发送到对应区域 Gateway 前仍须取得用户同意。

## Start

使用重复图片参数：

```bash
node .agents/skills/argus/scripts/run-argus.mjs start \
  --image /absolute/path/a.jpg \
  --image /absolute/path/b.png \
  --workspace /absolute/workspace-root \
  --yes --json
```

或使用一个现成 ZIP：

```bash
node .agents/skills/argus/scripts/run-argus.mjs start \
  --zip /absolute/path/input.zip \
  --workspace /absolute/workspace-root \
  --yes --json
```

两种输入模式互斥。`start` 完成校验、规范化、上传和提交后返回 `workspace_dir`，不会轮询。

## Status

每次调用只发起一次远端查询：

```bash
node .agents/skills/argus/scripts/run-argus.mjs status \
  --workspace /absolute/workspace-root/<run-dir> --json
```

`task_status` 为 `queued` 或 `processing` 时，稍后再查。

## Collect

`task_status` 变为 `succeeded` 后：

```bash
node .agents/skills/argus/scripts/run-argus.mjs collect \
  --workspace /absolute/workspace-root/<run-dir> --json
```

Collect 会保留 `output.zip`，安全解压，校验 manifest 与产物，并写本地结果索引。完成后重复 collect 不会再次提交或下载。

`task_status` 与 `result_status` 分开表达。`partial` 退出码为 0，但带警告和非空 `missing_ids`；`error` 非零退出。

## 收集产物

| 产物 | 含义 |
| --- | --- |
| `output.zip` | 原始终态结果包，在本地保留。 |
| `output.json` | 必需并经过 Schema 校验的算法 manifest。 |
| `pointcloud/merged.glb` | 一个 `right-handed, Y-up` 合并点云。 |
| `depth/*_depth.exr` | 每张成功图片对应的米制浮点深度图。 |
| `pose/*_pose.json` | 每张成功图片对应的相机位姿。 |
| `intrinsics/*_intrinsics.json` | 可选相机内参。 |
| `result.json` | 状态、产物路径、警告和缺失 ID 的本地索引。 |

## 输入规则

- 1–99 张根目录 JPEG、PNG 或 WebP。
- RGB、8-bit、严格 2:1。
- 低于 2048×1024 只警告，不硬失败。
- ZIP 路径必须安全且平铺；Skill 拒绝重复 stem 和 Unicode/case-fold 冲突。
- 单张 2:1 全景图有效。方图无效；旧方图工作流请固定 `v1.0.2`。

## Skill 文件

- Runtime 定义：[SKILL.md](../../.agents/skills/argus/SKILL.md)
- Skill README：[README.zh-CN.md](../../.agents/skills/argus/README.zh-CN.md)
- 品牌素材：[manifest.json](../../.agents/skills/argus/assets/brand/manifest.json)
- 官方示例清单：[manifest.json](../../.agents/skills/argus/examples/manifest.json)
- 示例下载指南：[examples.zh-CN.md](../../.agents/skills/argus/references/examples.zh-CN.md)
- Gateway 合同：[argus-gateway-openapi.json](../../.agents/skills/argus/references/argus-gateway-openapi.json)
- 算法合同：[algorithm-io.zh-CN.md](../../.agents/skills/argus/references/algorithm-io.zh-CN.md)
- 输出 Schema：[argus-output.schema.json](../../.agents/skills/argus/references/argus-output.schema.json)
- 机器索引：[llms.txt](../../llms.txt)

真实 Argus 运行属于远程上传，必须先取得用户同意，且不得持久化凭证、上传 token 或签名结果 URL。
