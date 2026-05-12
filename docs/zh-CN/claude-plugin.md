# Claude Code Plugin 安装

[English](../claude-plugin.md) | 简体中文

把 `realsee-skills` plugin（skill: `argus`）装到 Claude Code，有三种方式。

本文件支持两种用法：

1. 在 Claude Code 会话 / shell 里自己跑命令。
2. 把 GitHub URL 分享给 Claude Code，让它在你机器上执行。

要可复现，分享 tagged release（如 `v1.0.0`）的 URL。

## Claude Code 装了什么

- Marketplace 名：`realsee-developer-skills`
- Plugin 名：`realsee-skills`
- Skill 句柄：`realsee-skills:argus`
- 落盘路径：`~/.claude/plugins/marketplaces/realsee-developer-skills/plugins/realsee-skills`

Plugin 只带一个 skill，**没有安装期配置项**。凭证在 skill 首次运行时通过对话交互式收集。

## 一键安装（公开 marketplace）

在 Claude Code 会话内：

```
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

不会弹任何配置框。第一次让 agent 跑 `argus` 时，它会在对话里问你 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET` 和 `REALSEE_REGION`（`global` 对应 `app-gateway.realsee.ai`，`cn` 对应 `app-gateway.realsee.cn`），然后再问你要不要把它们写入 `~/.realsee/credentials` 以便下次复用。

## 开发安装（本地 clone）

需要迭代源 skill 或测试未发布的 commit 时用：

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install
npm install --prefix .agents/skills/argus
npm run rebuild
claude --plugin-dir ./plugins/realsee-skills
```

Pin 到具体版本：

```bash
VERSION=v1.0.0
git clone --branch "$VERSION" --depth 1 https://github.com/realsee-developer/skills.git
cd skills
npm install
npm install --prefix .agents/skills/argus
npm run rebuild
claude --plugin-dir ./plugins/realsee-skills
```

启动前 shell 里 export 凭证，可以跳过对话提问：

```bash
export REALSEE_APP_KEY=...
export REALSEE_APP_SECRET=...
export REALSEE_REGION=global   # 或 cn
claude --plugin-dir ./plugins/realsee-skills
```

## 校验安装

```bash
claude plugin validate ./plugins/realsee-skills
ls -la ./plugins/realsee-skills/skills/argus
```

从 marketplace 装好后，在 Claude Code 内：

```
/plugin list
```

## 第一组提示词

Skill 由 Claude 按 SKILL.md description 自动匹配，自然语言即可：

```
把 /path/to/photo.jpg 转成 Realsee Argus GLB（单图模式）。用 --async 并报告 workspace dir 和 task id。
从 /path/to/pano.jpg 生成 Argus GLB（全景）。后台轮询完成后 resume 一下。
```

要显式 pin skill：

```
Use realsee-skills:argus on /path/to/photo.jpg.
```

## 凭证行为

- 凭证在**运行时**解析，不在安装期。Agent 按 SKILL.md "Step 1" 走：
  1. 探测 shell env（`printenv REALSEE_APP_KEY REALSEE_APP_SECRET REALSEE_REGION`）。
  2. 缺则 `source ~/.realsee/credentials`（这是个可以被 shell `source` 的 env 片段）：`[ -f ~/.realsee/credentials ] && set -a && . ~/.realsee/credentials && set +a`。
  3. 再缺，对话里一问一答收集（region 菜单 → APP_KEY → APP_SECRET → 是否保存？）。
- 保存是**可选项**。征得同意后，agent 用 Bash heredoc 写文件 + `chmod 600`。启动 `claude` 之前 shell 里 `export REALSEE_*` 永远覆盖文件值。
- 敏感字段绝不落 `settings.json`，也绝不落对话记录（SKILL.md 明确禁止 agent 回显凭证）。

## Skill 调用

Plugin 只带一个脚本，其他都是 agent 按 SKILL.md 走 Bash：

| 动作 | 方式 |
| --- | --- |
| 生成（异步） | `node <skillDir>/scripts/run-argus.mjs --image <path> --type <image\|panorama> --workspace <dir> --yes --json --async`（前置 `REALSEE_*` env） |
| 查状态 | `cat <workspace_dir>/result.json`，5–10 秒一次直到 `status !== "in_progress"` |
| 续传断点 | `node <skillDir>/scripts/run-argus.mjs --resume --workspace <workspace_dir> --json` |
| 打开结果 | `open <path-or-url>`（macOS）/ `xdg-open`（Linux）/ `start "" <path-or-url>`（Windows） |
| 持久化凭证 | Bash heredoc 写 `~/.realsee/credentials` + `chmod 600`（征得用户同意后）|
| JPEG 比例预检 | `sips -g pixelWidth -g pixelHeight`（macOS）/ `identify -format '%w %h'`（ImageMagick）/ 纯 node 兜底 |

`SKILL.md` 指示 agent 在上传前、持久化凭证前、打开结果前都向用户确认。

## 在 Claude Code 之外手动恢复

Claude Code 起的 async 任务想从 shell 看进度：

```bash
cat <workspace_dir>/result.json
```

后台轮询挂了，手动恢复：

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node .agents/skills/argus/scripts/run-argus.mjs --resume --workspace <workspace_dir> --json
```

## 打开结果

`result.json#status === "success"` 后，Claude Code 应主动问用户要打开**本地 GLB**、**H5 在线预览**、还是两个都打开。征得同意后：

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
- `release-channel.json` 携带机器可读的成熟度（`state`、`stable_gate`）。
