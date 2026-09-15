# Realsee Skills

面向 **全景重建** 与 **Blender 可编辑空间建模** 的 Agent Skills，支持 Claude Code、Codex，以及 `npx skills` 支持的其他宿主。

[![CI](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/realsee-developer/skills?display_name=tag&style=flat-square)](https://github.com/realsee-developer/skills/releases)

[English](README.md) | 简体中文

[选择能力](#选择能力) · [安装](#安装) · [使用](#使用) · [文档导航](#文档导航) · [版本](#版本) · [开发维护](#开发维护)

## 选择能力

| 分类 | Skill | 输入 → 输出 | 运行要求 |
| --- | --- | --- | --- |
| 全景重建 | [Argus](.agents/skills/argus/README.zh-CN.md) | 1–99 张本地 2:1 全景图 → EXR 深度图、合并 GLB 点云、相机位姿、可选内参与校验后的结果索引 | Realsee 远程服务；应用凭据与上传授权；POSIX shell、Node.js 22+、npm 10+ |
| 可编辑空间建模 | [Blender 重建](.agents/skills/realsee-blender-reconstruction/README.zh-CN.md) | 已有扫描导出、点云、CAD 或全景图 → 原生可编辑 `.blend` 场景 | 本地 Blender，以及可读取文件、执行命令的 Agent；本地建模无需 Argus 凭据 |

需要从全景图生成深度、点云和位姿时，选择 **Argus**；需要基于已有资料创建或修改可编辑场景时，选择 **Blender 重建**。Argus 产物可以作为重建资料，但运行一项 skill 不会自动运行另一项。

## 安装

### Claude Code — 安装两项 skill

在 Claude Code 中运行：

```text
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

当前插件提供 `realsee-skills:argus` 和 `realsee-skills:realsee-blender-reconstruction`。详见 [Claude Code 指南](docs/zh-CN/claude-plugin.md)。

### Codex — 按需选择

安装需要的 skill，或执行两条命令安装全部：

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
npx skills add realsee-developer/skills --skill realsee-blender-reconstruction --agent codex
```

[Codex 指南](docs/zh-CN/codex.md)包含本地检出安装方法。

### 其他安装方式

- **其他 Agent 宿主**：省略 `--agent codex` 以选择宿主，或使用 `--agent '*'` 安装到所有检测到的宿主。
- **本地检出**：在包含目标 skill 的仓库目录执行 `npx skills add . --skill <skill-id> --agent codex`。
- **Arkclaw**：Release 附件 `argus.zip` 仅包含 Argus，仅支持 CN 区域。
- **仓库 Codex 安装器**：`npm run install:codex-skills` 仅安装 Argus，会替换已有 Argus 目标目录。

依赖、安装路径和版本固定方式见[安装总览](docs/zh-CN/install-guides.md)。

## 使用

### Argus：全景图 → 重建数据

示例请求：

> 使用 $argus，将 /data/living-room.jpg 和 /data/hall.jpg 上传到 Realsee 处理，启动任务并报告工作区路径。

输入必须是 JPEG、PNG 或 WebP，RGB8，宽高比严格为 2:1。流程包含三个显式命令：`start`、`status`、`collect`。收集产物包含 `output.zip`、算法 manifest 和经过校验的本地 `result.json` 索引；部分成功时会列出缺失图片。

Argus 需要 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET`、`REALSEE_REGION`（`global` 或 `cn`）。在本地安全配置秘密，上传前取得用户同意。配置方法和 CLI 示例见[凭据与使用指南](docs/zh-CN/usage.md#凭据与上传授权)。

[官方示例全景图](.agents/skills/argus/references/examples.zh-CN.md)需要单独下载，不随 skill 打包。下载示例不等于授权上传。

### Blender：已有资料 → 可编辑场景

示例请求：

> 使用 $realsee-blender-reconstruction，读取 data/ 中的导出资料，重建有证据支持的可编辑 Blender 空间，保存 output/reconstruction_native.blend，并在重新打开后验证几何和材质编辑。

优先完成布局、墙体、地面、顶面、开口与空间连接，再细化用户要求的家具、材质和光照。可按需增加漫游、物理导出和网页预览。

资料准备、运行要求和交付物见 [Blender 指南](.agents/skills/realsee-blender-reconstruction/README.zh-CN.md)。在 Claude Code 中使用上方带插件前缀的 skill 名称。

## 文档导航

### 用户指南

| 主题 | 文档 |
| --- | --- |
| 安装与宿主支持 | [安装总览](docs/zh-CN/install-guides.md) · [Claude Code](docs/zh-CN/claude-plugin.md) · [Codex](docs/zh-CN/codex.md) |
| 工作流与凭据配置 | [使用指南](docs/zh-CN/usage.md) |
| Argus 输入、输出与示例 | [Argus 指南](.agents/skills/argus/README.zh-CN.md) · [示例](.agents/skills/argus/references/examples.zh-CN.md) |
| 原生场景重建与编辑 | [Blender 指南](.agents/skills/realsee-blender-reconstruction/README.zh-CN.md) |
| 问题排查与能力开通 | [支持](SUPPORT.zh-CN.md) · [Argus 排错](.agents/skills/argus/references/troubleshooting.zh-CN.md) |

### 集成与维护

| 主题 | 文档 |
| --- | --- |
| Argus 接口 | [Gateway OpenAPI](.agents/skills/argus/references/argus-gateway-openapi.json) · [算法输入输出](.agents/skills/argus/references/algorithm-io.zh-CN.md) · [输出 Schema](.agents/skills/argus/references/argus-output.schema.json) |
| 仓库结构与 Agent 发现 | [架构](ARCHITECTURE.zh-CN.md) · [机器索引](llms.txt) · [Agent 指南](AGENTS.zh-CN.md) |
| 开发与发布 | [开发指南](docs/zh-CN/development.md) · [贡献指南](CONTRIBUTING.zh-CN.md) · [发布指南](docs/zh-CN/release.md) · [分发清单](docs/zh-CN/public-distribution.md) |
| 安全 | [安全策略](SECURITY.zh-CN.md) |

Argus 产品资料：[官网](https://argus.realsee.ai/) · [Demo](https://h5.realsee.ai/argus) · [研究](https://argus-paper.realsee.ai/) · [开发者平台](https://developer.realsee.ai/)。这些站点介绍完整产品能力，当前可安装的 Argus skill 提供上方全景处理流程。

## 版本

| 来源 | 内容 |
| --- | --- |
| 当前 `main` | Argus 与 Blender 重建两项 skill，以及最新使用指导 |
| 稳定版本 `v2.1.0` | 包含两项 skill；使用 `realsee-developer/skills@v2.1.0` 固定安装版本 |
| 旧版 `v2.0.0` | 仅含 Argus，不含 Blender 重建 |
| 历史版本 `v1.0.2` | 旧方图与单 GLB 工作流，见[迁移说明](.agents/skills/argus/references/migration-v2.zh-CN.md) |

合并到 `main` 不会更新已有 Release 或下载附件。已发布标签与产物以 [GitHub Releases](https://github.com/realsee-developer/skills/releases) 为准；当前 Argus 发布元数据记录在 `release-channel.json`。

## 开发维护

规范源码在 `.agents/skills/`。修改源码后重新生成分发包，不直接编辑 `plugins/realsee-skills/` 或 `arkclaw/argus/` 中的副本。

```bash
npm run rebuild
npm run ci
```

前置条件与专项检查见[开发指南](docs/zh-CN/development.md)。仓库 CI 验证打包和运行时合同，不执行远程 Argus 处理或 Blender 实际重建。

## 许可

本仓库依据 [Realsee SDK License Agreement](LICENSE) 提供源码，不使用 OSI 认可的开源许可证。
