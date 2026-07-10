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

## 支持版本

仓库处于开发阶段。除非维护者另行记录稳定分支策略，安全修复面向当前 `main` 分支。
