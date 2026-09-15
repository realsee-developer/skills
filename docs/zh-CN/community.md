# 支持与反馈指南

[English](../community.md) | 简体中文

本仓库主要用于让用户检查、安装和运行 Realsee skill 能力。它不是开放式社区产品开发论坛。

## 报告 Bug

使用 `Bug report` issue 模板，附 skill 名称、安装的修订版本、宿主、操作系统、复现步骤和脱敏错误。具体要求见[支持指南](../../SUPPORT.zh-CN.md)：Argus 报告需要生命周期及 Node.js/npm 环境；Blender 报告需要 Blender/集成版本、输入导出类型、失败步骤及预期和实际交付物。

不要包含 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET`、生成凭证、内部 URL、账号标识或私有结果链接。

## 能力反馈

当受支持工作流缺少公开能力、文档不清晰或 runtime 行为阻塞集成时，使用 `Capability request` 模板。请包含：

- 用户工作流
- 期望输入和输出
- 是否需要远程上传
- 相关公开 API 参考或能力文档
- 问题涉及Argus 生命周期状态或真实运行、Blender 重建、产物校验还是安装

## Pull Requests

Pull requests 不是本仓库的主要协作路径。维护者仍可使用 pull requests 对 skill packaging、文档和 release checks 做受控更新。

维护者 pull requests 应运行：

```bash
npm run ci
```

如果某个命令无法在本地运行，请在 pull request 中说明原因。
