# 架构

[English](ARCHITECTURE.md) | 简体中文

本文档梳理 canonical skill 源、生成的 Claude plugin 包，以及三个分发渠道（Claude Code、Codex、`npx skills`）的关系。

## Source-of-Truth 地图

```
.agents/skills/argus/                Canonical skill 源。形状：SKILL.md + 一个脚本。
├── SKILL.md                         Frontmatter + 完整的 agent 流程（凭证 Q&A、尺寸预检、轮询、打开）。
├── README.md / README.zh-CN.md      面向用户文档。
├── package.json                     Skill 内 Node manifest（依赖 @realsee/universal-uploader）。
├── package-lock.json                依赖树锁定。
├── scripts/run-argus.mjs            **唯一**的脚本。Gateway pipeline（auth → upload → trigger → poll → download）。
├── src/                             run-argus.mjs 背后的 runtime 模块（cli、config、gateway、downloader、state…）。
├── test/                            单测 + 可注入假对象测试（不调用真实接口）。
└── references/                      公开 OpenAPI 合同 + 参考文档。

plugins/realsee-skills/              生成的 Claude plugin 包 —— 不要手工改。
├── .claude-plugin/plugin.json       Plugin manifest（无 userConfig，无 MCP server —— 凭证运行时解析）。
├── package.json                     Plugin 内 manifest（精简）。
├── skills/argus/                    源 skill 的拷贝（由 scripts/sync-claude-plugin.mjs 保持同步）。
└── scripts/{validate-plugin,doctor-local-env}.mjs

.claude-plugin/marketplace.json      Marketplace manifest，指向 plugins/realsee-skills。

release-channel.json                 发布状态（channel、version、每 skill 的 state、regions）。
llms.txt                             机器可读仓库索引。
```

## Skill → Plugin → 分发 流程

```
                .agents/skills/argus/                  (单一源)
                            │
              ┌─────────────┼────────────────────┐
              │             │                    │
              ▼             ▼                    ▼
      sync:claude-plugin   npx skills add     install-codex-skills
              │             . --skill argus           │
              ▼                                       ▼
   plugins/realsee-skills/                  $CODEX_HOME/skills/argus
              │                                       │
              ▼                                       │
   /plugin install                                    │
   realsee-skills@                                    │
   realsee-developer-skills                           │
              │                                       │
              └─────────┐                   ┌─────────┘
                        ▼                   ▼
                Claude Code 运行时    Codex 运行时
                (没有安装期配置 —— 两个 runtime 都通过
                 skill 的运行时凭证提示或预设的 shell
                 env 获得 REALSEE_* )
```

两个运行时最终都启动同一个 `scripts/run-argus.mjs`，命中同一份 `src/cli.mjs`。凭证解析在 **script 运行之前**，**完全由 agent 通过 Bash 完成**，按 SKILL.md "Step 1"：

1. 探测 shell env（`printenv REALSEE_*`）。
2. 文件存在就 source：`[ -f ~/.realsee/credentials ] && set -a && . ~/.realsee/credentials && set +a`。文件是可被 shell `source` 的 `KEY=VALUE` 片段，mode 0600。
3. 还缺就一问一答收集（region → APP_KEY → APP_SECRET → 是否保存？）。
4. 用户同意保存的话，agent 用 Bash heredoc 写文件 + `chmod 600`。

直接 shell env 永远覆盖凭证文件。不涉及 plugin `userConfig`、不涉及 MCP bridge，也不涉及 helper 脚本（check-credentials / save-credentials）—— agent 的 Bash tool 替代了所有这些。

## CLI 执行模式

`scripts/run-argus.mjs` → `src/cli.mjs` 支持三种模式：

| 模式 | flag | 行为 |
| --- | --- | --- |
| 同步 | _(默认)_ | Auth → upload-token → upload → trigger → poll → download → 写 `result.json`。阻塞直到全程完成（数分钟）。 |
| 异步 | `--async` | Auth → upload-token → upload → trigger → 写 `state.json` + spawn detached 子进程轮询。立即返回 `{status: in_progress, background_poll_pid}`。 |
| 恢复 | `--resume --workspace <dir>` | 读 `state.json` 接着 poll → download → 写 `result.json`。用于 detached 子进程，以及人工恢复。 |

Claude Code / Codex 宿主调用 skill 时应优先使用 async，避免会话因 Argus 推理而卡住。

## 构建与校验流程

`npm run ci`（也在 `.github/workflows/ci.yml` 跑）按顺序：

1. `scan:secrets` —— 扫 token、签名 URL、AWS Authorization 头、腾讯 COS tmpSecret 等模式。
2. `validate:docs` —— 双语文档（英文 / 简体中文）覆盖检查。
3. `validate:ai` —— `llms.txt` 必含的入口字符串校验。
4. `validate:repo-boundary` —— 拒绝 home 目录绝对路径（macOS / Linux）、内部 hostname 等私有泄露。完整 deny list 见 `scripts/validate-repo-boundary.mjs`。
5. `validate:skills` —— `.agents/skills/` 下每个 skill 的 SKILL.md / README 配对一致。
6. `rebuild` —— 重新生成 `plugins/realsee-skills/`，并通过 `check:claude-sync` 比对字节级一致。
7. `validate:channel-metadata` —— `release-channel.json` 形状和 id 一致性。
8. `test:skill` —— 跑所有 `.agents/skills/argus/test/*.test.mjs`（`node --test`）。

发布门禁（`scripts/release-gate.mjs`）跑同一套链，外加 `--channel stable` 时校验 `references/argus-gateway-openapi.json` 是公开 Realsee Argus/VGGT 合同、无内部证据文本。

## 发布渠道

`release-channel.json` 携带机器可读状态：

- `channel` —— feature 分支上为 `development`；切 release tag 时变为 `preview` / `stable`。
- `state` —— 每 skill 的成熟度。两 region e2e 通过后，`argus` 标为 `stable`。
- `stable_gate` —— `release:gate --channel stable` 通过后变 `passed`。

GitHub workflows 接入：

- `.github/workflows/ci.yml` —— 每次 push 到 `main` 或 PR 时跑 `npm run ci`。
- `.github/workflows/release-gate.yml` —— `main`、`test/**`、`stable/**`、手动 dispatch 时跑发布门禁。
- `.github/workflows/release.yml` —— tag push `v*` 时跑 stable 门禁并创建 GitHub release。
- `.github/workflows/codeql.yml` —— 每周 + push/PR 静态安全分析。

## 不要修改

- `plugins/realsee-skills/**` —— 生成产物。改 `.agents/skills/argus/`，然后 `npm run rebuild`。
- `node_modules/**`、`workspace/**`、`*.glb`、`.env`，以及 `validate-repo-boundary` deny list 上的任何路径。
