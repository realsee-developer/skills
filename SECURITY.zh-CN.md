# 安全政策

[English](SECURITY.md) | 简体中文

## 报告安全问题

请不要为漏洞、泄露凭证、私有端点或账号相关数据创建公开 issue。

如需报告安全问题，请通过仓库维护者联系路径，或在 `realsee-developer/skills` 启用后使用 GitHub 私有安全报告功能。

报告中请包含：

- 问题的简短描述
- 受影响的 skill 或脚本
- 不暴露 secrets 的复现步骤
- 已知影响

## Secret 处理

不要提交：

- `REALSEE_APP_KEY`
- `REALSEE_APP_SECRET`
- 生成的上传凭证
- 内部 URL
- 账号标识
- 私有结果 URL
- 下载的 `output.zip`、解压后的 Argus 产物或临时 workspace

仓库包含 `npm run scan:secrets`，但自动扫描不能替代提交前的人工审查。

Argus 配置先读取继承的环境变量，再读取已有本地凭据文件。缺少配置时使用本地 shell 或安全凭据界面，不要要求在聊天中提供秘密。只有用户明确授权后，才能在仓库外的 `~/.realsee/credentials` 中以 0600 权限保存应用凭据。不得持久化临时令牌或签名 URL。配置流程见[使用指南](docs/zh-CN/usage.md)。

Argus 上传须获得针对所选输入和范围的授权；仅选择文件不等于同意上传。在范围未变时复用既有授权。Blender 重建使用本地导出且不需要 Argus 凭据；公开报告中不要附带私有源数据或生成场景。

## 支持版本

当前发布状态记录在 `release-channel.json`（Argus 2.2.0 为 stable）。除非维护者另行记录稳定分支策略，安全修复面向当前 `main` 分支。
