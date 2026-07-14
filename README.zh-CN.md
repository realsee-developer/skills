<p align="center">
  <a href="https://argus.realsee.ai/">
    <img src=".agents/skills/argus/assets/brand/argus-logo-color.png" alt="Realsee Argus" width="560">
  </a>
</p>

# Realsee Skills — Argus Agent 与 CLI 工作流

[![CI](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/ci.yml)
[![Release gate](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/release-gate.yml?branch=main&label=release%20gate&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/release-gate.yml)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/codeql.yml?branch=main&label=CodeQL&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/codeql.yml)
[![Latest release](https://img.shields.io/github/v/release/realsee-developer/skills?display_name=tag&style=flat-square)](https://github.com/realsee-developer/skills/releases)
![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933?style=flat-square)

[English](README.md) | 简体中文

Realsee Argus 是全球领先的 3D 视觉基础模型。它可从照片、全景图或稀疏视图中，在毫秒级重建具备度量尺度的 3D 结构，包括位姿、深度、点云和可渲染几何。

Realsee Skills 提供 Argus 的 Agent 与 CLI 工作流。当前 Skill 是 `argus` 2.0：处理 1–99 张严格 2:1 全景图，产出 EXR 深度图、一个合并 GLB 点云、逐图相机位姿、可选内参和经过校验的本地结果索引。

Skill ID 仍为 `argus`。2.0 不包含旧版单图 VGGT fallback；需要 1:1 方图、旧版仅单 GLB 结果或旧 H5 preview 行为时，请固定到 `v1.0.2`。

[Argus 官网](https://argus.realsee.ai/) · [交互 Demo](https://h5.realsee.ai/argus) · [研究主页](https://argus-paper.realsee.ai/) · [开发者平台](https://developer.realsee.ai/)

官方公开证据包括 1.31B 参数模型，以及 Realsee3D 基准的 10K 个完整室内场景、95,962 个房间单元和 299,073 个全景视点。这些是模型与基准数据，不是 Skill 的输入数量上限。

可安装的 Skill 2.0 仍保持明确边界：**1–99 张本地 RGB8 且严格 2:1 的全景图**。官网展示的照片、稀疏视图或其他产品能力不属于本 CLI 的公开接口。

## 凭证

所有安装路径继续使用不变的运行时合同：

| Key | 用途 | 敏感 |
| --- | --- | --- |
| `REALSEE_APP_KEY` | Realsee Open Platform APP_KEY | 是 |
| `REALSEE_APP_SECRET` | Realsee Open Platform APP_SECRET | 是 |
| `REALSEE_REGION` | `global`（`app-gateway.realsee.ai`）或 `cn`（`app-gateway.realsee.cn`） | 否 |

在 [my.realsee.ai](https://my.realsee.ai/?utm_source=github) 或 [my.realsee.cn](https://my.realsee.cn/?utm_source=github) 注册，然后按 [SUPPORT.zh-CN.md](SUPPORT.zh-CN.md) 的渠道申请 Argus Gateway 能力。

## 安装

Claude Code marketplace：

```text
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

Codex：

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
```

任意检测到的 agent host：

```bash
npx skills add realsee-developer/skills --skill argus
npx skills add realsee-developer/skills --skill argus --agent '*'
```

从本地 checkout 安装：

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install
(cd .agents/skills/argus && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
npm run rebuild
```

宿主细节见[安装总览](docs/zh-CN/install-guides.md)、[Claude Code](docs/zh-CN/claude-plugin.md) 与 [Codex](docs/zh-CN/codex.md)。

## 官方示例清单

每种 Skill 安装方式都包含 `examples/manifest.json`，其中列出 CN 和 Global 两组第一方示例的 CDN URL、字节数和 SHA-256。当前发布树和所有生成的 Skill 分发包都不包含全景 JPEG。请把一组示例下载到 Skill 目录外一个尚不存在的绝对路径：

```bash
node <skillDir>/scripts/download-examples.mjs \
  --region cn \
  --output /absolute/example-output
```

请选择与 `REALSEE_REGION` 匹配的区域。只有每个文件都通过 manifest 校验后，下载器才会发布输出目录。之后运行 Argus 属于独立的远程上传，仍须取得用户同意。

## 直接使用 CLI

从多张图片启动：

```bash
node .agents/skills/argus/scripts/run-argus.mjs start \
  --image /absolute/path/a.jpg \
  --image /absolute/path/b.webp \
  --workspace /absolute/workspace-root \
  --yes --json
```

或从一个现成 ZIP 启动：

```bash
node .agents/skills/argus/scripts/run-argus.mjs start \
  --zip /absolute/path/input.zip \
  --workspace /absolute/workspace-root \
  --yes --json
```

记录返回的 `workspace_dir`。每次状态调用只查询一次：

```bash
node .agents/skills/argus/scripts/run-argus.mjs status \
  --workspace /absolute/workspace-root/<run-dir> --json
```

成功后收集：

```bash
node .agents/skills/argus/scripts/run-argus.mjs collect \
  --workspace /absolute/workspace-root/<run-dir> --json
```

不再有 detached poller、`--async` 或 `--resume`。完成后的 collect 可幂等重复调用。

## 输入与输出

输入为 1–99 张 JPEG、PNG 或 WebP RGB8 全景图，严格满足 `width == 2 * height`。建议至少 2048×1024，更低分辨率只产生警告。`--image` 可重复，并与 `--zip` 互斥。ZIP 模式会先安全解压、校验、规范化为 Unicode NFC、排序并重新打包。

远端 `task_status`（`queued`、`processing`、`succeeded`、`failed`）与算法 `result_status`（`success`、`partial`、`error`）相互独立。partial 退出码为 0，但包含醒目警告和非空 `missing_ids`；error 非零退出。

收集器保留 `output.zip`，安全解压，并写入以下经过校验的本地产物矩阵：

| 产物 | 可用性 |
| --- | --- |
| `output.json` | 必需的算法 manifest。 |
| `pointcloud/merged.glb` | 成功重建图片对应的一个合并点云，坐标系为 `right-handed, Y-up`。 |
| `depth/*_depth.exr` | 每张成功图片一份米制浮点深度图。 |
| `pose/*_pose.json` | 每张成功图片一份相机位姿。 |
| `intrinsics/*_intrinsics.json` | 可选；不存在是合法结果。 |
| `result.json` | 状态、路径、警告和 `missing_ids` 的本地索引。 |

真实 Argus 运行会把规范化输入 ZIP 上传到 Realsee 远程服务。上传前必须取得用户同意。不得提交或记录凭证、上传 token、私有结果 URL 或生成产物。

## 合同与迁移

- [Skill README](.agents/skills/argus/README.zh-CN.md)
- [官方品牌素材 manifest](.agents/skills/argus/assets/brand/manifest.json)
- [Gateway OpenAPI](.agents/skills/argus/references/argus-gateway-openapi.json)
- [算法输入输出合同](.agents/skills/argus/references/algorithm-io.zh-CN.md)
- [`output.json` JSON Schema](.agents/skills/argus/references/argus-output.schema.json)
- [从 1.x 迁移](.agents/skills/argus/references/migration-v2.zh-CN.md)
- [机器可读索引](llms.txt)

## 开发

Canonical source 位于 `.agents/skills/argus/`。Claude plugin 与 CN-only Arkclaw 包都由它生成并做字节一致性检查（Arkclaw 仅对运行区域、示例下载和相应说明应用确定性的 CN-only overlay）。

```bash
npm run doctor
npm run test:skill
npm run rebuild
npm run ci
```

详见[架构](ARCHITECTURE.zh-CN.md)、[维护](docs/zh-CN/development.md)、[发布](docs/zh-CN/release.md)和[公开分发](docs/zh-CN/public-distribution.md)。

## License

本仓库采用 [Realsee SDK License Agreement](LICENSE) 以 source-available 方式发布，不使用 OSI 开源许可证。
