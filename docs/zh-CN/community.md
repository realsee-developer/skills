# 支持与反馈指南

[English](../community.md) | 简体中文

本仓库主要用于让用户检查、安装和运行 Realsee skill 能力。它不是开放式社区产品开发论坛。

## 报告 Bug

使用 bug report issue template，并包含：

- Skill 名称，通常是 `argus`
- 失败的命令
- 是否使用了 `--async` 或 `--resume`
- 已脱敏的错误输出
- 操作系统、Node.js 版本和 npm 版本

不要包含 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET`、生成凭证、内部 URL、账号标识或私有结果链接。

## 能力反馈

当受支持工作流缺少公开能力、文档不清晰或 runtime 行为阻塞集成时，使用 capability request template。请包含：

- 用户工作流
- 期望输入和输出
- 是否需要远程上传
- 相关公开 API 参考或能力文档
- 问题涉及本地 async mode、live usage、安装还是 agent runtime

## Pull Requests

Pull requests 不是本仓库的主要协作路径。维护者仍可使用 pull requests 对 skill packaging、文档和 release checks 做受控更新。

维护者 pull requests 应运行：

```bash
npm run ci
```

如果某个命令无法在本地运行，请在 pull request 中说明原因。
