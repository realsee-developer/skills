# Codex 安装

[English](../codex.md) | 简体中文

把 canonical `argus` Skill 安装到 Codex：

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
```

Stable 2.0 发布后可固定版本：

```bash
npx skills add realsee-developer/skills@v2.0.0 --skill argus --agent codex
```

只有旧 1:1 方图或旧单 GLB 行为才改用 `@v1.0.2`。

## 本地 checkout

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install
(cd .agents/skills/argus && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
CODEX_HOME=$HOME/.codex npm run install:codex-skills
```

Codex 从 `${CODEX_HOME:-$HOME/.codex}/skills/argus` 发现 Skill。校验：

```bash
ls -la "${CODEX_HOME:-$HOME/.codex}/skills/argus"
head "${CODEX_HOME:-$HOME/.codex}/skills/argus/SKILL.md"
```

## 凭证

继续使用原有运行时合同：

1. 继承的 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET`、`REALSEE_REGION`；
2. 由 agent 加载现有 `~/.realsee/credentials`；
3. 在 Codex 会话中一字段一轮收集。

不要打印值，也不要放进会被记录的命令参数。要跳过提问，可在启动 Codex 前 export 环境变量。

## 提示词示例

```text
Use $argus 从 /path/a.jpg 和 /path/b.webp 启动批次，并报告 run workspace。
Use $argus 查询一次 /workspace/<run-dir> 状态。
Use $argus 收集 /workspace/<run-dir>，报告 result_status、missing_ids 和本地产物。
```

Codex 应调用显式生命周期：

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/run-argus.mjs" start \
  --image /absolute/a.jpg --image /absolute/b.webp \
  --workspace /absolute/workspace --yes --json

node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/run-argus.mjs" status \
  --workspace /absolute/workspace/<run-dir> --json

node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/run-argus.mjs" collect \
  --workspace /absolute/workspace/<run-dir> --json
```

不再有 detached poller 或 resume flag。完成后的 collect 可幂等重复调用。即使 `partial` 退出码为 0，Codex 也必须醒目标出它和非空 `missing_ids`。

## 发布策略

`main` 是集成分支，stable 安装使用 Git tag。2.0 只有在 uploader 0.1.0 以及 global/CN 真机 E2E 都通过后才推进 stable。
