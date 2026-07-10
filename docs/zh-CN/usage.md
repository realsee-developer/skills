# 使用指南

[English](../usage.md) | 简体中文

本仓库提供可安装到 Claude Code、Codex 和其他 `npx skills` 支持宿主的 `argus` Skill。

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

## 输入规则

- 1–99 张根目录 JPEG、PNG 或 WebP。
- RGB、8-bit、严格 2:1。
- 低于 2048×1024 只警告，不硬失败。
- ZIP 路径必须安全且平铺；Skill 拒绝重复 stem 和 Unicode/case-fold 冲突。
- 单张 2:1 全景图有效。方图无效；旧方图工作流请固定 `v1.0.2`。

## Skill 文件

- Runtime 定义：[SKILL.md](../../.agents/skills/argus/SKILL.md)
- Skill README：[README.zh-CN.md](../../.agents/skills/argus/README.zh-CN.md)
- Gateway 合同：[argus-gateway-openapi.json](../../.agents/skills/argus/references/argus-gateway-openapi.json)
- 算法合同：[algorithm-io.zh-CN.md](../../.agents/skills/argus/references/algorithm-io.zh-CN.md)
- 输出 Schema：[argus-output.schema.json](../../.agents/skills/argus/references/argus-output.schema.json)
- 机器索引：[llms.txt](../../llms.txt)

真实 Argus 运行属于远程上传，必须先取得用户同意，且不得持久化凭证、上传 token 或签名结果 URL。
