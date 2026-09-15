# 支持

[English](SUPPORT.md) | 简体中文

用本文件找到最适合你场景的求助渠道。

## Bug 反馈与仓库 issue

到 [realsee-developer/skills/issues](https://github.com/realsee-developer/skills/issues) 提 issue：

- **Bug** —— 运行错误、安装问题或文档错误。使用 `Bug report` 模板，注明 `argus` 或 `realsee-blender-reconstruction`、安装的修订版本、宿主、操作系统、复现步骤和脱敏错误输出。
  - **Argus**：附生命周期命令（`start`、`status` 或 `collect`）、`node --version`、`npm --version` 和相关 `result.json` / `state.json` 字段。脱敏任务代码、对象路径、凭据和私有 URL。
  - **Blender**：附 Blender 版本、可用本地集成、输入导出类型、失败的重建或验收步骤，以及预期和实际交付物。使用脱敏描述或非私有示例；无需 Argus 生命周期文件或凭据。
- **Feature request** —— 用 `Capability request` 模板。说明影响的是 Argus runtime、Blender 重建指南、skill 打包，还是安装路径。

**不要**在公开 issue 中包含 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET`、生成凭证、内部 URL、账号标识或私有结果链接。

## Realsee 开放平台 / API 能力

Blender 重建不需要 Argus Gateway 接入或凭据。GitHub issue 不能授予 Argus Gateway 接入。账号与能力相关问题：

- 注册账号：[my.realsee.ai](https://my.realsee.ai/?utm_source=github)（global）/ [my.realsee.cn](https://my.realsee.cn/?utm_source=github)（cn）。
- 申请 API 能力：邮件 [developer@realsee.com](mailto:developer@realsee.com?subject=Argus%20API%20Capability%20Request)，附账号 region、`如视ID`、`组织账号`。

## 安全

私下报告潜在漏洞。见 [SECURITY.zh-CN.md](SECURITY.zh-CN.md) / [SECURITY.md](SECURITY.md)。

## 各宿主安装帮助

- Claude Code plugin 安装：[docs/zh-CN/claude-plugin.md](docs/zh-CN/claude-plugin.md)
- Codex 安装：[docs/zh-CN/codex.md](docs/zh-CN/codex.md)
- 跨宿主总览：[docs/zh-CN/install-guides.md](docs/zh-CN/install-guides.md)
