# 维护者指南

[English](../development.md) | 简体中文

本仓库是 Realsee agent skills 的 Node.js 工作区。Argus 2.0 runtime 代码与 canonical contracts 位于 `.agents/skills/argus/`。

## 要求

- Node.js 22 或更高版本
- npm 10 或更高版本
- 不提交 `.env` 文件或生成的私有产物

## 本地检查

发布或更新受保护分支前运行完整门禁：

```bash
npm run ci
```

门禁会运行：

```bash
npm run scan:secrets
npm run validate:docs
npm run validate:ai
npm run validate:repo-boundary
npm run validate:skills
npm run rebuild
npm run validate:channel-metadata
npm run test:skill
```

编辑时使用聚焦命令：

| 命令 | 用途 |
| --- | --- |
| `npm run validate:ai` | 修改 `llms.txt` 或仓库入口后。 |
| `npm run validate:docs` | 修改双语仓库文档后。 |
| `npm run validate:skills` | 修改 skill metadata、README 或 references 后。 |
| `npm run test:skill` | 修改 `argus` 代码后。 |
| `npm run rebuild` | 重新生成并字节校验 Claude plugin 与 CN-only Arkclaw copy。 |
| `npm run doctor` | 通过 `doctor:local` 检查本地前置条件。 |
| `npm run doctor:live` | 检查 live Argus 前置条件和环境。 |

## Skill 工作流

单一事实源是 `.agents/skills/argus/`。Claude plugin 生成到 `plugins/realsee-skills/`；Arkclaw 包生成到 `arkclaw/argus/`，对运行区域、示例下载和相应说明应用确定性的 CN-only overlay。

修改 `argus` 时：

1. 编辑 `.agents/skills/argus/` 下的文件。
2. 运行 `npm run test:skill`。
3. 运行 `npm run rebuild`。
4. 运行 `npm run ci`。

不要直接编辑两个生成 copy。新增 runtime 行为应通过 `ArgusTaskPort` 与 `ObjectTransferPort` fake 测试，并覆盖输入、生命周期、输出合同与幂等。

## 配置

公开文档只使用这些环境变量名：

- `REALSEE_APP_KEY`
- `REALSEE_APP_SECRET`
- `REALSEE_REGION`

继续支持现有 agent-driven `~/.realsee/credentials` 加载流程。不要提交真实值、账号标识、内部 URL、生成凭证、`output.zip`、解压产物或临时 workspace。
