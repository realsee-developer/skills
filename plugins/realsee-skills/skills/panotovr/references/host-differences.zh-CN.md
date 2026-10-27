# 宿主安装

[English](host-differences.md) | [简体中文](host-differences.zh-CN.md)

从本地检出运行 `npx skills add . --skill panotovr --agent codex`，或选择 npx skills 支持的其他宿主。Codex 使用 `$panotovr`，运行时路径以安装后的 skill 目录为准。

Claude Code 先在仓库运行 `npm run rebuild`，再运行 `claude --plugin-dir ./plugins/realsee-skills`，调用 `realsee-skills:panotovr`。插件没有凭据 userConfig，使用进程环境或当前目录的私有 `.env`。仍兼容旧 `CLAUDE_PLUGIN_OPTION_REALSEE_*` 变量。

按 SKILL.md 在安装后的 skill 目录安装依赖；仅安装仓库根依赖不足以运行 PanoToVR。仓库专用 Codex 安装器和 Arkclaw ZIP 仅包含 Argus。PanoToVR 从 v2.3.0 起提供；固定版本安装时将 `.` 替换为 `realsee-developer/skills@v2.4.0`。
