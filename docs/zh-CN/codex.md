# Codex 安装

[English](../codex.md) | 简体中文

按需要安装一项或两项 skill 到 Codex：

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
npx skills add realsee-developer/skills --skill realsee-blender-reconstruction --agent codex
```

`$argus` 用于远程全景处理，`$realsee-blender-reconstruction` 用于已有本地资料的可编辑场景重建。Blender 需要本地可运行的 Blender，无需 Argus 凭据；运行要求见[安装总览](install-guides.md)。

产品背景见 [Argus 官网](https://argus.realsee.ai/)、[交互 Demo](https://h5.realsee.ai/argus)、[研究主页](https://argus-paper.realsee.ai/)和 [Realsee Developer Platform](https://developer.realsee.ai/)。Codex 必须遵循已安装 Skill 的合同，不能从这些页面推断额外能力：Skill 2.0 只接受 1–99 张本地 RGB8 且严格 2:1 的全景图。

固定 stable 2.0 版本：

```bash
npx skills add realsee-developer/skills@v2.0.0 --skill argus --agent codex
```

只有旧 1:1 方图或旧单 GLB 行为才改用 `@v1.0.2`。

## 本地 checkout

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm ci
(cd .agents/skills/argus && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
CODEX_HOME=$HOME/.codex npm run install:codex-skills
npx skills add . --skill realsee-blender-reconstruction --agent codex
```

`npm run install:codex-skills` 只安装 Argus，并替换目标目录后安装锁定依赖；Blender 使用上面的 `npx skills` 命令单独安装。

Codex 从 `${CODEX_HOME:-$HOME/.codex}/skills/argus` 发现 Skill。校验：

```bash
ls -la "${CODEX_HOME:-$HOME/.codex}/skills/argus"
head "${CODEX_HOME:-$HOME/.codex}/skills/argus/SKILL.md"
```

安装目录包含 `examples/manifest.json`，但不包含全景 JPEG。需要官方示例时，Codex 应询问区域和 Skill 目录外一个尚不存在的绝对输出路径，再运行 `node <skillDir>/scripts/download-examples.mjs --region <cn|global> --output <absolute-dir>`。命令会校验 manifest 中每个字节数与 SHA-256 后再发布目录。之后实际运行 Argus 仍须另行取得上传同意，并使用对应区域的 Gateway。

## 凭据与授权

仅 Argus 需要凭据。按[使用指南](usage.md#凭据与上传授权)检查环境变量、加载已有凭据文件，并通过本地 shell 或安全界面补齐缺失配置。仅在明确授权后以 0600 权限在仓库外保存应用凭据；上传 token 与签名 URL 不得持久化。文件选择不等于上传同意，同一输入和范围复用已有授权。

## 提示词示例

```text
使用 $realsee-blender-reconstruction 读取 data/，重建可编辑空间并保存 output/reconstruction_native.blend。
Use $argus 从 /path/a.jpg 和 /path/b.webp 启动批次，并报告 run workspace。
Use $argus 把 CN 示例下载并校验到 /absolute/examples，再取得上传同意后启动它们。
Use $argus 查询一次 /workspace/<run-dir> 状态。
Use $argus 收集 /workspace/<run-dir>，报告 result_status、missing_ids 和本地产物。
```

Codex 应调用显式生命周期：

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/download-examples.mjs" \
  --region cn --output /absolute/examples

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

`main` 为集成分支，当前发布通道以 `release-channel.json` 为准，门禁见[发布指南](release.md)。`v2.0.0` 包含 Argus，不包含 Blender skill；Blender 使用当前仓库或已核对的本地 checkout。需要 1.x 方图或单 GLB 工作流时固定 `v1.0.2`。
