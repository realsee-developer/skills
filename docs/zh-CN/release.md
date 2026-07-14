# 发布指南

[English](../release.md) | 简体中文

发布就绪状态记录在 `release-channel.json`，由 `scripts/release-gate.mjs` 强制。

## 版本线

- `v1.0.2` 是冻结的旧版本，支持方图和旧版单 GLB 工作流。不要增加可变或含义模糊的 `v1.0` tag。
- `v2.0.0` 保持 Skill ID 为 `argus`，使用多全景 ZIP 接口，不提供 1.x fallback。

实现阶段 metadata 保持 `channel: development`、`state: preview`、`stable_gate: pending`。不能只因本地测试通过就把 2.0 标记 stable。

## 门禁

Preview：

```bash
npm run release:gate -- --channel preview --tag v2.0.0-rc.3
```

Stable：

```bash
npm run release:gate -- --channel stable --tag v2.0.0
```

两个门禁都会运行仓库检查、Claude/Arkclaw 生成与字节一致性，以及完整 Skill 测试。Stable 还要求公开的 Gateway 四路径 OpenAPI 合同。

## 必须顺序

1. 保持现有 `v1.0.2` tag 不变。
2. 发布并验证 `@realsee/universal-uploader@0.1.1`。
3. 切 `v2.0.0-rc.3`，在 CN 与 global 各跑真实多图 E2E。
4. 两区都验证上传、任务完成、success/partial/error 收集与结果下载。
5. 把发布 metadata 改成 stable/passed，发布 `v2.0.0`。
6. 验证双语迁移指南，以及 Claude、Codex、`npx skills`、CN-only Arkclaw 的全新安装。

Uploader 发布门禁必须通过单测、类型检查、构建、`npm pack` 安装烟测和生产依赖 audit，并且没有 high/critical 漏洞。

## Live 验证记录

不要把凭证、签名 URL、私有 task locator 或生成产物作为证据提交。只在公开仓库之外记录脱敏通过/失败结果。Stable 必须有 AWS/global 与腾讯 COS/CN 真机运行，本地 fake 不能替代。

## Tag

所有 stable 条件满足后：

```bash
git tag -a v2.0.0 -m "v2.0.0"
git push origin v2.0.0
```

Release workflow 会先跑 stable gate，再创建 GitHub release。
