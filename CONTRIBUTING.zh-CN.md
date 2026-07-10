# 维护者贡献指南

[English](CONTRIBUTING.md) | 简体中文

Realsee Skills 用于公开受支持的 skill 能力。外部 pull request 不是路线图或产品功能开发的主要路径。本指南面向维护者和范围明确的修复。

## 开始之前

1. 阅读 `.agents/skills/` 下相关 skill 的 README。
2. 检查 `release-channel.json` 中的当前 skill 状态。
3. 避免提交生成产物、凭证、账号标识、私有 URL、`.env` 文件、下载的 Argus 压缩包、解压产物或临时 workspace 文件。

## 维护者开发流程

1. 用尽可能小的改动解决问题。
2. 当命令行为、配置、发布门禁或 skill 使用方式变化时，同步更新文档。
3. 编辑时运行聚焦校验。
4. 打开 pull request 或推送发布分支前运行 `npm run ci`。

如果修改 `argus` 源文件，运行：

```bash
npm run test:skill
npm run rebuild
npm run ci
```

如果只是修改文档，运行：

```bash
npm run validate:docs
npm run ci
```

## Pull Request 检查项

- 改动只解决一个明确问题。
- 文档反映新增或变更的行为。
- 已运行测试或校验命令，并在 PR 中列出结果。
- 没有提交 secrets 或私有生成产物。
- 修改 source skill 文件时，Claude plugin 副本已重建。

## 新 Skill 包

新的 skill 包由 Realsee 维护者在能力、API 合同和发布门禁获批后加入。新的 skill 包应包含：

- 带准确 frontmatter 的 `SKILL.md`
- skill `README.md`
- 对 upload、gateway、download 路径可注入假对象的测试
- 涉及远程服务时的外部 API 合同引用
- 对上传本地文件流程的明确同意说明
