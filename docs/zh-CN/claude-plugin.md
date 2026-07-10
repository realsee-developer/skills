# Claude Code Plugin 安装

[English](../claude-plugin.md) | 简体中文

在 Claude Code 会话内安装 `realsee-skills` plugin：

```text
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

Plugin 暴露 `realsee-skills:argus`，没有安装期配置或 MCP server。Skill 在运行时解析凭证。

## 开发安装

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install
(cd .agents/skills/argus && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
npm run rebuild
claude --plugin-dir ./plugins/realsee-skills
```

校验生成包：

```bash
node plugins/realsee-skills/scripts/validate-plugin.mjs
npm run check:claude-sync
```

## 凭证

继续使用原有运行时优先级：

1. 继承的 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET`、`REALSEE_REGION`；
2. 由 agent 加载现有 `~/.realsee/credentials`；
3. 在对话中一字段一轮收集。

Agent 不得回显值，也不得把它们放进会被记录的命令参数。凭证、上传 token、预签名 URL 和 provider 原始错误不写入 run state。

## 提示词示例

自然语言即可：

```text
用 Argus 处理 /path/a.jpg 和 /path/b.webp，启动任务并报告 run workspace。
查询一次 /workspace/<run-dir> 的 Argus 状态。
收集 /workspace/<run-dir>，列出 GLB、EXR 深度图、位姿、内参和缺失 ID。
```

也可以显式指定 Skill：

```text
Use realsee-skills:argus on /path/input.zip.
```

## Skill 调用面

| 动作 | 命令 |
| --- | --- |
| 从图片启动 | `node <skillDir>/scripts/run-argus.mjs start --image <path>... --workspace <root> --yes --json` |
| 从 ZIP 启动 | `node <skillDir>/scripts/run-argus.mjs start --zip <path> --workspace <root> --yes --json` |
| 查询一次 | `node <skillDir>/scripts/run-argus.mjs status --workspace <run-dir> --json` |
| 收集终态 | `node <skillDir>/scripts/run-argus.mjs collect --workspace <run-dir> --json` |

不再有 detached poller、`--async` 或 `--resume`。Agent 决定何时再次查询状态。完成后的 collect 可幂等重复调用。

Start 前必须取得上传同意。`result_status: partial` 时，即使 CLI 退出码为 0，也必须醒目显示警告和全部 `missing_ids`。

## 发布策略

Global 与 CN E2E 都通过后，stable 2.0 安装使用 `v2.0.0`。需要 1.x 方图或单 GLB 工作流的用户固定 `v1.0.2`。
