# Realsee Skills

[![CI](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/ci.yml)
[![Release gate](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/release-gate.yml?branch=main&label=release%20gate&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/release-gate.yml)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/realsee-developer/skills/codeql.yml?branch=main&label=CodeQL&style=flat-square)](https://github.com/realsee-developer/skills/actions/workflows/codeql.yml)
[![Latest release](https://img.shields.io/github/v/release/realsee-developer/skills?display_name=tag&style=flat-square)](https://github.com/realsee-developer/skills/releases)
![Agent skills](https://img.shields.io/badge/agent-skills-0b7285?style=flat-square)
![Claude Code](https://img.shields.io/badge/Claude%20Code-supported-555?style=flat-square)
![Codex](https://img.shields.io/badge/Codex-supported-555?style=flat-square)
![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933?style=flat-square)

[English](README.md) | 简体中文

Realsee Skills 提供可安装的 Realsee agent skills。用户和 agent runtimes 可以安装这些 skills，从本地输入生成 Realsee 输出。

当前 skill 是 `argus`。它可以从本地 JPEG 图片或全景图生成 Realsee Argus GLB 输出。

## 凭证

三种安装方式都需要以下三个值：

| Key | 用途 | 敏感 |
| --- | --- | --- |
| `REALSEE_APP_KEY` | Realsee Open Platform APP_KEY | ✅ |
| `REALSEE_APP_SECRET` | Realsee Open Platform APP_SECRET | ✅ |
| `REALSEE_REGION` | `global`（app-gateway.realsee.ai）或 `cn`（app-gateway.realsee.cn） | — |

到 [my.realsee.ai](https://my.realsee.ai/?utm_source=github)（global）或 [my.realsee.cn](https://my.realsee.cn/?utm_source=github)（cn）注册账号，然后邮件 [developer@realsee.com](mailto:developer@realsee.com?subject=Argus%20VGGT%20API%20Capability%20Request) 申请 Argus VGGT API 能力，邮件附上账号 region、`UserID`、`IdentityID`。

## 安装与使用 — Claude Code

**一键安装**（在 Claude Code 会话内）：

```
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

Claude Code 会弹出 plugin 配置框让你填 `REALSEE_APP_KEY` / `REALSEE_APP_SECRET` / `REALSEE_REGION`。两个敏感字段进系统 keychain，不写入 `settings.json`。

**使用** —— 用自然语言描述任务即可，Claude 会根据 `SKILL.md` 的 description 自动选 skill：

```
把 /path/to/photo.jpg 转成 Realsee Argus GLB（单图模式）。
从 /path/to/pano.jpg 生成 Argus GLB（全景，2:1 宽高比）。
```

需要显式 handle 时使用 plugin 命名空间 `realsee-skills:argus`。

从 clone 安装（开发模式）：

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install && npm run rebuild
claude --plugin-dir ./plugins/realsee-skills
```

## 安装与使用 — Codex

**一键安装**（宿主机）：

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
```

它会把 `.agents/skills/argus/` 拷到 `$CODEX_HOME/skills/argus`（默认 `$HOME/.codex/skills/argus`）。

**使用** —— 先 export 凭证，然后在 Codex 提示词中引用 skill：

```bash
export REALSEE_APP_KEY=...
export REALSEE_APP_SECRET=...
export REALSEE_REGION=global   # 或 cn
```

```
Use $argus on /path/to/photo.jpg (image mode) 并返回 GLB 路径。
```

从 clone 安装（可自定义 `CODEX_HOME` 位置）：

```bash
CODEX_HOME=$HOME/.codex npm run install:codex-skills
```

## 安装与使用 — `npx skills`（任意检测到的宿主）

**一键安装**到当前激活的 agent：

```bash
npx skills add realsee-developer/skills --skill argus
```

一次性装到所有检测到的宿主：

```bash
npx skills add realsee-developer/skills --skill argus --agent '*'
```

或指定具体宿主：

```bash
npx skills add realsee-developer/skills --skill argus --agent claude-code
npx skills add realsee-developer/skills --skill argus --agent codex
```

只列出 skills，不安装：

```bash
npx skills add realsee-developer/skills --list
```

从本地 checkout 安装：

```bash
npx skills add . --skill argus
```

**使用** —— 装完后按对应宿主的方式调用（见上面的 Claude Code / Codex 节）。

## 直接使用 CLI（不依赖任何宿主）

同步调用（阻塞直到 GLB 下载完成；Argus 推理可能耗时数分钟）：

```bash
node .agents/skills/argus/scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json
```

异步调用（立即返回 `status: in_progress`，detached 子进程在后台轮询并下载）：

```bash
node .agents/skills/argus/scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json --async
```

从 workspace 目录恢复 / 完成异步任务：

```bash
node .agents/skills/argus/scripts/run-argus.mjs --resume --workspace ./workspace/<run-dir> --json
```

输入类型按 JPEG 尺寸自动判定并强制校验：2:1（±0.05）→ 全景图，1:1（±0.05）→ 针孔图，其他比例直接拒掉，不发生任何上传。传 `--type panorama` / `--type image` 可强制覆盖自动判型，但仍会按上述比例校验文件。

Argus 生成会把选中的本地图片上传到 Realsee 远程服务。任何上传前都必须确认用户同意。

## 打开结果

Skill 不再附带 opener 脚本。直接读 workspace 下的 `result.json`：

```bash
cat ./workspace/<run-dir>/result.json
```

`result.json#status` 为 `success` 后，主动问用户**是要打开本地 GLB**、**用浏览器看 H5 在线预览**、还是**两个都打开**。然后用系统自带的 opener（详见 SKILL.md "Step 5"）：

```bash
case "$(uname -s)" in
  Darwin)               open "<path-or-url>" ;;
  Linux)                xdg-open "<path-or-url>" ;;
  CYGWIN*|MINGW*|MSYS*) start "" "<path-or-url>" ;;
esac
```

`result.json#status` 不是 `success` 之前不要打开任何东西。

## Agent Runtime 文件

| 文件 | 用途 |
| --- | --- |
| [`llms.txt`](llms.txt) | 机器可读仓库地图。 |
| [`AGENTS.zh-CN.md`](AGENTS.zh-CN.md) | 自动化安全操作规则。 |
| [`SKILL.md`](.agents/skills/argus/SKILL.md) | Runtime 面向的 skill 定义。 |
| [`README.zh-CN.md`](.agents/skills/argus/README.zh-CN.md) | Skill 用户文档。 |
| [`argus-gateway-openapi.json`](.agents/skills/argus/references/argus-gateway-openapi.json) | Skill 使用的公开 Gateway 合同。 |

## Skill

| Skill | 状态 | 说明 |
| --- | --- | --- |
| [`argus`](.agents/skills/argus/README.zh-CN.md) | Stable | 从本地 JPEG 图片或全景图生成 Realsee Argus GLB 输出。 |

发布元数据位于 [`release-channel.json`](release-channel.json)。

## 本地检查

检查本地前置条件：

```bash
npm run doctor
```

运行 skill tests：

```bash
npm run test:skill
```

## 贡献

Source skill 文件位于 `.agents/skills/`。`plugins/realsee-skills/` 下的 Claude plugin 包由 source skill 文件生成。

修改 source skill 文件后运行：

```bash
npm run rebuild
npm run ci
```

文档：

- [Architecture](ARCHITECTURE.md) / [架构](ARCHITECTURE.zh-CN.md)
- [Install guide overview](docs/install-guides.md) / [安装指南总览](docs/zh-CN/install-guides.md)
- [Claude Code install](docs/claude-plugin.md) / [Claude Code 安装](docs/zh-CN/claude-plugin.md)
- [Codex install](docs/codex.md) / [Codex 安装](docs/zh-CN/codex.md)
- [Usage guide](docs/usage.md) / [使用指南](docs/zh-CN/usage.md)
- [Maintainer guide](docs/development.md) / [维护者指南](docs/zh-CN/development.md)
- [Release guide](docs/release.md) / [发布指南](docs/zh-CN/release.md)
- [Public distribution checklist](docs/public-distribution.md) / [公开分发检查清单](docs/zh-CN/public-distribution.md)
- [Support](SUPPORT.md) / [支持](SUPPORT.zh-CN.md)
- [Community guide](docs/community.md) / [社区指南](docs/zh-CN/community.md)
- [Contribution guide](CONTRIBUTING.md) / [贡献指南](CONTRIBUTING.zh-CN.md)
- [Security policy](SECURITY.md) / [安全政策](SECURITY.zh-CN.md)
- [License](LICENSE)

## License

本仓库采用 [Realsee SDK License Agreement](LICENSE) 以 source-available 方式发布，不使用 OSI 开源许可证。
