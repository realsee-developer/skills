# 安装指南总览

[English](../install-guides.md) | 简体中文

为你的 AI 宿主选择对应的安装路径。所有路径产出同一个 skill —— `argus` —— 把本地 JPEG 图片或全景图转成 Realsee Argus GLB。

## 推荐入口

最快的公开安装路径：

```bash
npx skills add realsee-developer/skills
```

`npx skills` 自动检测机器上所有支持的宿主（Claude Code、Codex），并装到每一个。要按宿主指定 pin 版本，看下表。

## 宿主对照

| 宿主 | 一键安装 | 装好后的 skill 句柄 | 详细指南 |
| --- | --- | --- | --- |
| Claude Code | `/plugin marketplace add realsee-developer/skills` 然后 `/plugin install realsee-skills@realsee-developer-skills` | `realsee-skills:argus`（或自然语言 prompt） | [docs/claude-plugin.md](claude-plugin.md) |
| Codex | `npx skills add realsee-developer/skills --skill argus --agent codex` | Codex 提示词中的 `$argus` | [docs/codex.md](codex.md) |
| 所有检测到的宿主 | `npx skills add realsee-developer/skills --skill argus --agent '*'` | 按宿主对应（见上方） | 本文件 |

## 与 agent 分享的推荐方式

每份宿主指南支持两种用法：

1. 在 shell 里自己跑命令。
2. 把 GitHub 文件 URL 分享给 AI agent，让它在你机器上安装。

要可复现，照下面三步：

1. 在 tagged release（例如 `v1.0.0`）上打开指南。
2. 复制对应文件的 GitHub URL。
3. 粘给目标 agent，比如：

```text
打开这个 GitHub 指南并在我机器上执行。
使用 URL 里的 tag 版本，校验安装，并报告缺哪些凭证。
```

## 每条路径都需要的凭证

| Key | 敏感 | 用途 |
| --- | --- | --- |
| `REALSEE_APP_KEY` | ✅ | Realsee Open Platform APP_KEY |
| `REALSEE_APP_SECRET` | ✅ | Realsee Open Platform APP_SECRET |
| `REALSEE_REGION` | — | `global`（app-gateway.realsee.ai）或 `cn`（app-gateway.realsee.cn） |

Claude Code 通过 plugin 配置框提示输入，把敏感字段存进系统 keychain。Codex 与 `npx skills` 从用户 shell（或 `.env`）读取。

还没有凭证？见 [SUPPORT.md](../../SUPPORT.md) 的注册与申请流程。

## 安装之后

- 直接使用 CLI（不依赖宿主）：见根 README 的 [直接使用 CLI](../../README.zh-CN.md#直接使用-cli不依赖任何宿主) 节。
- 异步模式（被 chat 宿主调用时推荐，避免会话被几分钟的 Argus 推理卡住）：带 `--async`，之后直接 `cat <run-dir>/result.json` 读结果。
- 卡住的异步任务恢复：`node .agents/skills/argus/scripts/run-argus.mjs --resume --workspace <run-dir> --json`。
- 结果落盘后打开预览：经用户同意后调系统自带 opener —— macOS `open <path-or-url>`、Linux `xdg-open`、Windows `start "" <path-or-url>`。详见 SKILL.md "Step 5"。
