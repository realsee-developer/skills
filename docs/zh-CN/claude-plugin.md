# Claude Code Plugin 安装

[English](../claude-plugin.md) | 简体中文

在 Claude Code 会话内安装 `realsee-skills` plugin：

```text
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

生成的 Plugin 暴露 `realsee-skills:argus` 和 `realsee-skills:realsee-blender-reconstruction`，没有安装期配置或 MCP server。Argus 在运行时解析凭证，本地 Blender 建模无需 Realsee 凭据，使用方式见 [Blender 工作流](../../.agents/skills/realsee-blender-reconstruction/README.zh-CN.md)。下文配置仍仅适用于 Argus。

官方背景资料见 [Argus 官网](https://argus.realsee.ai/)、[交互 Demo](https://h5.realsee.ai/argus)、[研究主页](https://argus-paper.realsee.ai/)和 [Realsee Developer Platform](https://developer.realsee.ai/)。Agent 不能据此推断更广的照片能力：本 Skill 2.0 只接受 1–99 张本地 RGB8 且严格 2:1 的全景图。

Plugin 包含 `examples/manifest.json`，但不包含全景 JPEG。需要官方示例时，请选择与 `REALSEE_REGION` 一致的区域和 Skill 目录外一个尚不存在的绝对路径，再运行 `node <skillDir>/scripts/download-examples.mjs --region <cn|global> --output <absolute-dir>`。命令校验每个 manifest 字节数与 SHA-256 后才发布目录。运行已下载文件仍须另行取得上传同意，并使用对应区域的 Gateway。

## 开发安装

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
(cd .agents/skills/argus && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
npm run rebuild
claude --plugin-dir ./plugins/realsee-skills
```

校验生成包：

```bash
node plugins/realsee-skills/scripts/validate-plugin.mjs
npm run check:claude-sync
```

## 凭据与授权

仅 Argus 需要凭据。按[使用指南](usage.md#凭据与上传授权)检查环境变量、加载已有凭据文件，并通过本地 shell 或安全界面补齐缺失配置。仅在明确授权后以 0600 权限在仓库外保存应用凭据；上传 token 与签名 URL 不得持久化。文件选择不等于上传同意，同一输入和范围复用已有授权。

## 提示词示例

自然语言即可：

```text
用 Argus 处理 /path/a.jpg 和 /path/b.webp，启动任务并报告 run workspace。
把 global 示例下载并校验到 /absolute/examples，再取得上传同意并用 Argus 处理。
查询一次 /workspace/<run-dir> 的 Argus 状态。
收集 /workspace/<run-dir>，列出 GLB、EXR 深度图、位姿、内参和缺失 ID。
```

也可以显式指定 Skill：

```text
Use realsee-skills:argus on /path/input.zip.
Use realsee-skills:realsee-blender-reconstruction with data/ to save output/reconstruction_native.blend.
```

## Argus 调用面

| 动作 | 命令 |
| --- | --- |
| 下载官方示例 | `node <skillDir>/scripts/download-examples.mjs --region <cn\|global> --output <absolute-dir>` |
| 从图片启动 | `node <skillDir>/scripts/run-argus.mjs start --image <path>... --workspace <root> --yes --json` |
| 从 ZIP 启动 | `node <skillDir>/scripts/run-argus.mjs start --zip <path> --workspace <root> --yes --json` |
| 查询一次 | `node <skillDir>/scripts/run-argus.mjs status --workspace <run-dir> --json` |
| 收集终态 | `node <skillDir>/scripts/run-argus.mjs collect --workspace <run-dir> --json` |

不再有 detached poller、`--async` 或 `--resume`。Agent 决定何时再次查询状态。完成后的 collect 可幂等重复调用。

Start 前必须取得上传同意。`result_status: partial` 时，即使 CLI 退出码为 0，也必须醒目显示警告和全部 `missing_ids`。

## 发布策略

`main` 为集成分支，当前发布通道以 `release-channel.json` 为准，门禁见[发布指南](release.md)。`v2.2.0` 包含两项 skill，旧版 `v2.0.0` 标签仅包含 Argus。需要 1.x 方图或单 GLB 工作流时固定 `v1.0.2`。
