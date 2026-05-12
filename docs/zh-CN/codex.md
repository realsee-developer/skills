# Codex 安装

[English](../codex.md) | 简体中文

把 `argus` skill 装到 Codex，这样在任何 Codex 提示词里都能引用。

本文件支持两种用法：

1. 在 shell 里自己跑命令。
2. 把 GitHub URL 分享给 Codex，让它在你机器上执行。

要可复现，分享 tagged release（如 `v1.0.0`）的 URL。

## Codex 装了什么

Codex 通过 `$CODEX_HOME` 下的目录发现 canonical skill：

- 源：`.agents/skills/argus`
- 目标：`${CODEX_HOME:-$HOME/.codex}/skills/argus`

本地 clone 安装时是 symlink（源改动自动生效）；`npx skills add ... --agent codex` 安装时是 copy。

## 一键安装（公开）

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
```

Pin 到 release tag：

```bash
npx skills add realsee-developer/skills@v1.0.0 --skill argus --agent codex
```

## 本地 clone 安装

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install
npm install --prefix .agents/skills/argus
CODEX_HOME=$HOME/.codex npm run install:codex-skills
```

Pin 到具体版本：

```bash
VERSION=v1.0.0
git clone --branch "$VERSION" --depth 1 https://github.com/realsee-developer/skills.git
cd skills
npm install
npm install --prefix .agents/skills/argus
CODEX_HOME=$HOME/.codex npm run install:codex-skills
```

## 校验安装

```bash
ls -la "${CODEX_HOME:-$HOME/.codex}/skills/argus"
cat "${CODEX_HOME:-$HOME/.codex}/skills/argus/SKILL.md" | head
```

全面环境检查：

```bash
npm run doctor
```

## 凭证

Skill 在运行时按下面顺序解析凭证（全程由 agent 通过 Bash 完成，没有 helper 脚本）：

1. 当前 shell 里的 `REALSEE_*` 环境变量。
2. `~/.realsee/credentials` —— 可被 shell `source` 的 env 片段。Agent 通过 `[ -f ~/.realsee/credentials ] && set -a && . ~/.realsee/credentials && set +a` 加载。
3. Codex 会话里一字段一轮的 Q&A 收集（详见 SKILL.md "Step 1a"）。

要完全跳过弹问，启动 Codex 前 export：

```bash
export REALSEE_APP_KEY=...
export REALSEE_APP_SECRET=...
export REALSEE_REGION=global   # 或 cn
```

要跨 session 持久化，agent 在征得你同意后用 Bash heredoc 写文件：

```bash
mkdir -p ~/.realsee
umask 077
cat > ~/.realsee/credentials <<'EOF'
REALSEE_APP_KEY=...
REALSEE_APP_SECRET=...
REALSEE_REGION=global
EOF
chmod 600 ~/.realsee/credentials
```

## 第一组提示词

```text
Use $argus on /path/to/photo.jpg (image mode) 并报告 GLB 路径。用 --async，告诉我 workspace dir。
Use $argus on /path/to/pano.jpg (panorama)。后台轮询完成后 resume 一下。
```

## 手动恢复

从 shell 看 async 任务进度 —— 直接读 workspace 的 `result.json`：

```bash
cat <workspace_dir>/result.json
```

恢复卡住的任务：

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/run-argus.mjs" \
  --resume --workspace <workspace_dir> --json
```

## 打开结果

`result.json#status` 为 `success` 后，Codex 应主动问用户要打开**本地 GLB**、**H5 在线预览**、还是两个都打开。征得同意后，直接调系统 opener：

```bash
case "$(uname -s)" in
  Darwin)               open "<path-or-url>" ;;
  Linux)                xdg-open "<path-or-url>" ;;
  CYGWIN*|MINGW*|MSYS*) start "" "<path-or-url>" ;;
esac
```

`result.json#status` 不是 `success` 之前不要打开任何东西。

## 发布策略

- `main` 是集成分支。
- Stable 安装应使用 Git tag 和 GitHub Release（如 `v1.0.0`）。
