# 安装指南总览

[English](../install-guides.md) | 简体中文

所有安装路径使用同一份 canonical `argus` Skill 2.0 source，以及显式 `start` / `status` / `collect` 生命周期。

## 宿主对照

| 宿主 | 安装 | Skill 句柄 | 指南 |
| --- | --- | --- | --- |
| Claude Code | `/plugin marketplace add realsee-developer/skills`，然后 `/plugin install realsee-skills@realsee-developer-skills` | `realsee-skills:argus` | [Claude Code](claude-plugin.md) |
| Codex | `npx skills add realsee-developer/skills --skill argus --agent codex` | `$argus` | [Codex](codex.md) |
| 所有检测到的宿主 | `npx skills add realsee-developer/skills --skill argus --agent '*'` | 按宿主确定 | 本指南 |
| Arkclaw | 发布的 Arkclaw ZIP | `argus` | 仅 CN |

只装到当前宿主：

```bash
npx skills add realsee-developer/skills --skill argus
```

## 可复现版本

需要可复现安装时使用 release tag：

```bash
npx skills add realsee-developer/skills@v2.0.0 --skill argus
```

只有旧 1:1 方图、旧版单 GLB 输出或旧 preview 行为才固定 `v1.0.2`：

```bash
npx skills add realsee-developer/skills@v1.0.2 --skill argus
```

## 凭证

所有宿主使用 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET`、`REALSEE_REGION`（`global` 或 `cn`）。现有 Skill 流程先检查继承的 shell 环境，再由 agent 加载 `~/.realsee/credentials`，最后一字段一轮询问。Arkclaw 固定 region 为 `cn`。

不要打印凭证，也不要把它们放进会被记录的命令参数。目标账号没有 Argus 能力时见 [SUPPORT.zh-CN.md](../../SUPPORT.zh-CN.md)。

## 安装之后

宿主调用：

```bash
node <skillDir>/scripts/run-argus.mjs start --image /absolute/a.jpg --workspace /absolute/workspace --yes --json
node <skillDir>/scripts/run-argus.mjs status --workspace /absolute/workspace/<run-dir> --json
node <skillDir>/scripts/run-argus.mjs collect --workspace /absolute/workspace/<run-dir> --json
```

不再有 detached 后台 poller。持久产物是本地 `output.zip`、经过校验的解压目录和 `result.json`。
