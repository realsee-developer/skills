# 维护者指南

[English](../development.md) | 简体中文

本仓库在 `.agents/skills/` 下维护 Realsee agent skills：Argus 包含 Node.js 运行时与 API 合同；`realsee-blender-reconstruction` 包含本地建模指令与参考资料。

## 要求

- Node.js 22 或更高版本
- npm 10 或更高版本
- 实际验证重建指令需要本地 Blender；本地建模无需 Realsee 凭据
- 不提交 `.env` 文件或生成的私有产物

## 维护者初始化

运行 `npm run setup:local`，安装锁定的 Argus 依赖（禁用生命周期脚本）、重建两种分发并运行 Argus 本地诊断。仓库根目录没有依赖。缺少 Argus 凭据不影响维护，仅在实际运行 Argus 时配置。Skill 使用者应按[安装指南](install-guides.md)接入。

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
npm run test:repo
npm run test:skill
```

编辑时使用聚焦命令：

| 命令 | 用途 |
| --- | --- |
| `npm run validate:ai` | 修改 `llms.txt` 或仓库入口后。 |
| `npm run validate:docs` | 修改双语仓库文档后。 |
| `npm run validate:skills` | 修改 skill metadata、README 或 references 后。 |
| `npm run test:repo` | 修改仓库工具或分发行为后。 |
| `npm run test:skill` | 修改 `argus` 代码后。 |
| `npm run rebuild` | 重新生成并字节校验 Claude plugin 与 CN-only Arkclaw copy。 |
| `npm run doctor` | 默认检查 Argus；使用 `-- --skill realsee-blender-reconstruction` 检查 Blender。结构化诊断见 [Agent 预检](install-guides.md#agent-预检)。 |
| `npm run doctor:live -- --skill argus --channel preview` | 仅检查所需配置是否存在；无副作用的能力探测尚未实现，stable 模式会因缺少该验证而失败。 |

## Skill 工作流

所有 skill 的规范源码在 `.agents/skills/`。Claude 包含两项 skill，Arkclaw 仅包含 Argus。Claude plugin 生成到 `plugins/realsee-skills/`；Arkclaw 包生成到 `arkclaw/argus/`，对运行区域、示例下载和相应说明应用确定性的 CN-only overlay。

修改 `argus` 时：

1. 编辑 `.agents/skills/argus/` 下的文件。
2. 运行 `npm run test:skill`。
3. 运行 `npm run rebuild`。
4. 运行 `npm run ci`。

不要直接编辑两个生成 copy。新增 runtime 行为应通过 `ArgusTaskPort` 与 `ObjectTransferPort` fake 测试，并覆盖输入、生命周期、输出合同与幂等。

修改 Blender 指令时，编辑 `.agents/skills/realsee-blender-reconstruction/` 及双语参考资料，然后运行 `npm run validate:skills`、`npm run rebuild` 和 `npm run ci`。文档检查不能证明建模行为：改变建模流程时，使用合适的本地资料验证受影响的指令，并报告实际验证范围。此纯指令 skill 不要求 npm 运行时或远程服务 fake。

## 配置

Argus 配置使用以下环境变量：

- `REALSEE_APP_KEY`
- `REALSEE_APP_SECRET`
- `REALSEE_REGION`

继承环境变量、已有 `~/.realsee/credentials` 和缺失配置的本地安全设置方式见 [Argus 凭据配置](usage.md)。只有用户明确授权才可在仓库外以 0600 权限保存应用凭据，临时上传令牌和签名 URL 不得持久化。不要提交真实值、账号标识、内部 URL、生成凭证、`output.zip`、解压产物或临时 workspace。
