# 公开分发检查清单

[English](../public-distribution.md) | 简体中文

切公开 release tag 之前过一遍这份清单。

## 1. 仓库卫生

- [ ] 在干净 clone 上 `npm run ci` 通过（`npm ci` + `npm install --prefix .agents/skills/argus`）。
- [ ] `npm run release:gate -- --channel stable --tag <next>` 通过。
- [ ] `git status` 干净；没有提交的 `.env`、`node_modules/`、`workspace/`、`*.glb` 或生成的 runtime 产物。
- [ ] 被跟踪文件里没有 home 目录绝对路径、内部 hostname 或其他禁词。跑 `npm run validate:repo-boundary`；完整 deny list 见 `scripts/validate-repo-boundary.mjs`。

## 2. Skill 状态

- [ ] `release-channel.json#skills.argus.state` 反映当前成熟度（`preview` 或 `stable`）。
- [ ] 升 stable 时 `release-channel.json#skills.argus.stable_gate` 为 `passed`。
- [ ] `release-channel.json#version` 与计划 tag 匹配（如 `v1.0.0` 对应 `1.0.0`）。
- [ ] `package.json#version` 和 `.agents/skills/argus/package.json#version` 与 `release-channel.json#version` 一致。

## 3. 生成产物

- [ ] `npm run rebuild` 重新生成 `plugins/realsee-skills/`，`check:claude-sync` 与 `.agents/skills/argus/` 字节级一致。
- [ ] `plugins/realsee-skills/.claude-plugin/plugin.json` 包含预期的 `$schema`、`name`、`description`。**不应**声明 `userConfig` —— 凭证在运行时由 skill 解析，不在安装期。
- [ ] `plugins/realsee-skills/.mcp.json` 不存在 —— skill 走 Bash，不走 MCP server。
- [ ] `.claude-plugin/marketplace.json` 的 plugin 条目指向 `./plugins/realsee-skills`。

## 4. 文档

- [ ] 每份面向用户的文档有英文 + 简体中文配对（`README.md` / `README.zh-CN.md`、`AGENTS.md` / `AGENTS.zh-CN.md`、`docs/*.md` / `docs/zh-CN/*.md`、`SUPPORT.md` / `SUPPORT.zh-CN.md`、`ARCHITECTURE.md` / `ARCHITECTURE.zh-CN.md`）。
- [ ] `llms.txt` 引用了每条安装命令、文档路径和校验脚本（`scripts/validate-ai-index.mjs` 强制）。
- [ ] Pin 安装的示例引用了 `vX.Y.Z` tag。

## 5. 真机验证

- [ ] `REALSEE_REGION=global`（AWS adaptor）Argus e2e 通过。
- [ ] `REALSEE_REGION=cn`（腾讯 COS adaptor）Argus e2e 通过。
- [ ] async + resume 流验证：`--async` 返回 `status: in_progress`，detached 子进程写 `result.json`，`--resume` 续传暂停的任务。
- [ ] 三条安装路径 smoke：`claude --plugin-dir ./plugins/realsee-skills`、`npm run install:codex-skills`、`npx skills add . --skill argus`。

## 6. 安全面

- [ ] 被跟踪文件无凭证（`scripts/scan-secrets.mjs` 强制）。
- [ ] OpenAPI 合同 `.agents/skills/argus/references/argus-gateway-openapi.json` 是公开 Realsee Argus/VGGT 合同 —— 无内部证据文本（`scripts/release-gate.mjs#validatePublicGatewayOpenApi`）。
- [ ] CodeQL workflow 无未解决告警。

## 7. 打 tag 与发布

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

- [ ] `.github/workflows/release.yml` 在 tag 上成功跑完（跑 stable 门禁后 `gh release create --generate-notes --latest`）。
- [ ] GitHub Release 已生成自动 release notes；如需可手动微调。

## 8. 发布后

- [ ] 在干净机器上从 release tag 测试安装：
  - `npx skills add realsee-developer/skills@vX.Y.Z`
  - 或在 Claude Code 内 `/plugin marketplace add realsee-developer/skills`。
- [ ] 更新所有外部指针（文档站、分享链接、demo）到新 tag。
