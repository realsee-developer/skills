# 使用指南

[English](../usage.md) | 简体中文

本仓库为 agent runtimes 提供可安装的 Realsee skills。

## 安装

使用 open agent skills CLI 安装：

```bash
npx skills add realsee-developer/skills --skill argus
```

安装到 Claude Code：

```bash
npx skills add realsee-developer/skills --skill argus --agent claude-code
```

安装到 Codex：

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
```

安装到所有检测到的 agents：

```bash
npx skills add realsee-developer/skills --skill argus --agent '*'
```

从本地 checkout 安装：

```bash
npx skills add . --skill argus
```

## 使用 `argus`

同步调用（阻塞直到 GLB 下载完成；Argus 推理可能耗时数分钟）：

```bash
node .agents/skills/argus/scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json
```

异步调用（立即返回；detached 子进程在后台轮询并下载）：

```bash
node .agents/skills/argus/scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json --async
```

从 workspace 目录恢复 / 完成异步任务：

```bash
node .agents/skills/argus/scripts/run-argus.mjs --resume --workspace ./workspace/<run-dir> --json
```

输入类型按 JPEG 尺寸自动判定并强制校验：2:1（±0.05）→ 全景图，1:1（±0.05）→ 针孔图，其他比例直接拒掉，不发生任何上传。传 `--type panorama` / `--type image` 可强制覆盖自动判型，但仍会按上述比例校验文件。

## Skill 文件

- Runtime 定义：[SKILL.md](../../.agents/skills/argus/SKILL.md)
- Skill README：[README.zh-CN.md](../../.agents/skills/argus/README.zh-CN.md)
- OpenAPI 合同：[argus-gateway-openapi.json](../../.agents/skills/argus/references/argus-gateway-openapi.json)
- 机器可读索引：[llms.txt](../../llms.txt)

## 上传安全

真实 Argus 运行会把选中的本地图片上传到 Realsee 远程服务。任何上传前都必须确认用户同意。
