# Agent 指南

[English](AGENTS.md) | 简体中文

本仓库优先支持 agents 和自动化帮助用户检查、安装、打包或运行 Realsee skills。

## 仓库定位

- 受众：用户、agent runtimes 和维护者。
- 主要能力：`argus`，从本地 JPEG 图片或全景图生成 Realsee Argus GLB 输出。
- 分发模型：source-available 能力打包。

## 安全操作规则

- Argus 运行视为远程上传。任何上传前都必须确认用户同意。
- 不要提交 secrets、生成凭证、账号标识、私有 URL、下载的 GLB 文件、`.env` 文件或临时 workspace。
- 公开文档保持双语。英文使用默认路径。简体中文使用 `docs/zh-CN/`、`README.zh-CN.md` 或同目录 `*.zh-CN.md` 文件。
- 编辑 `.agents/skills/` 下的 source skill 文件。
- 修改 source skill 后运行 `npm run rebuild`。
- 不要重新引入内部证据文件、live scorecards、私有来源引用、内部过程文档或本地绝对路径。

## 常用命令

```bash
npm run install:codex-skills
npm run doctor
npm run validate:ai
npm run rebuild
npm run test:skill
npm run ci
```

## AI 索引

- 使用 [`llms.txt`](llms.txt) 查看紧凑的机器可读仓库地图。
- 使用 [`docs/zh-CN/usage.md`](docs/zh-CN/usage.md) 查看面向用户的 skill 使用指南。
