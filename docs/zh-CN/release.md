# 发布指南

[English](../release.md) | 简体中文

发布就绪状态由 `release-channel.json` 和 `scripts/release-gate.mjs` 控制。

## 通道

仓库当前把 `argus` 标记为 stable skill：

- `channel`: 发布版本为 `stable`（`development` 仅用于活跃构建分支）
- `state`: `stable`
- `stable_gate`: `passed`

Preview release 校验仓库健康状态和 skill 行为。Stable release 还会校验公开 Gateway OpenAPI 合同。

## Preview Gate

运行：

```bash
npm run release:gate -- --channel preview --tag manual-preview-check
```

Preview gate 运行与 `npm run ci` 相同的命令序列。

## Stable Gate

运行：

```bash
npm run release:gate -- --channel stable --tag v0.0.0
```

Stable gate 要求：

- `.agents/skills/argus/references/argus-gateway-openapi.json` 中存在公开 Gateway OpenAPI 合同
- skill tests 和仓库校验通过

不要在公开合同未更新、live capability 未在公开仓库外完成验证前把 skill 推进到 stable。

## GitHub Workflow

`.github/workflows/release-gate.yml` 会在以下场景运行 release gate：

- push 到 `main`
- push 到 `test/**`
- push 到 `stable/**`
- 指向 `main` 的 pull request
- 手动 workflow dispatch

手动 dispatch 接受 `preview` 或 `stable` 的 `channel`，以及一个验证 `tag`。
