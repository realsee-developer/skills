# 发布指南

[English](../release.md) | 简体中文

发布就绪状态记录在 `release-channel.json`，由 `scripts/release-gate.mjs` 强制检查。当前元数据记录版本 `2.2.0`、通道 `stable`，以及 Argus 的 `state: stable` / `stable_gate: passed`；未单独声明 Blender 的发布状态。

## 版本线

- `v1.0.2` 是冻结的旧版本，支持方图和旧版单 GLB 工作流。不要增加可变或含义模糊的 `v1.0` tag。
- `v2.0.0` 保持 Skill ID 为 `argus`，使用多全景 ZIP 接口，不提供 1.x 回退。该 tag 不含 `realsee-blender-reconstruction`。
- `v2.2.0` 打包两项 skill，沿用 Argus 2.0 API 与产物合同，并继承已有 Argus stable 状态；本次打包与指南发布不宣称新增远程 E2E 运行或实际 Blender 重建验收。

## 2.2.0 更新

新增 skill 直接发现、按 skill 输出 JSON 的本地诊断、可执行的前置条件修复建议、锁定依赖的维护者初始化，以及同步的双语接入说明。Argus 远程 API 不变。`v2.1.0` 仍是首个包含两项 skill 的稳定分发版本。

## 当前门禁

检查当前记录的稳定版本：

```bash
npm run release:gate -- --channel stable --tag v2.2.0
```

Preview 门禁要求预发布 tag 的基础版本与元数据版本相同，完整 tag 等于 `skills.argus.next_release_candidate`；元数据还须为 `channel: development`、`state: preview`、`stable_gate: pending`。当前 stable 元数据没有待发布候选，因此不能通过 preview 门禁。仅在获得授权的发布变更中选择并记录下一候选版本。

两个门禁都会执行秘密扫描、文档与 AI 索引校验、仓库边界与 skill 校验、分发重建、生成文件干净检查、烟测、工作区干净检查、通道元数据校验、`test:repo`、`test:skill` 和 Argus 生产依赖审计。相比 `npm run ci`，发布门禁额外检查生成文件和工作区是否干净、运行烟测并审计生产依赖。应在已安装依赖的干净检出中执行；门禁会重新生成分发文件。

Stable 还要求公开 Gateway OpenAPI 合同（四项必需操作、必需 schema 和两个区域基础地址）、匹配的稳定版本与 tag、`stable/stable/passed` 元数据、CN/global 两个区域，且不存在 `next_release_candidate`。元数据记录维护者对真实两区 E2E 的批准；门禁本身不会执行这些远程运行。

## 首次 2.0 推进的历史步骤

首次 2.0 推进使用 `@realsee/universal-uploader@0.1.1`，随后以 `v2.0.0-rc.3` 在 CN 和 global 验证真实多图流程，最终设置 stable/passed 元数据并发布 `v2.0.0`。这些是历史发布步骤，不是重新创建或覆盖既有 tag 的指令。

发布 uploader 时，验证单测、类型检查、构建、`npm pack` 安装烟测，以及不存在 high/critical 漏洞的生产依赖审计。推进 Argus 发布时，针对选定候选版本验证上传、任务完成、success/partial/error 收集、结果下载、双语迁移指南和受支持宿主的全新安装。见[分发检查清单](public-distribution.md)。

## 真实验证与发布

不要把凭证、签名 URL、私有任务定位信息或生成产物作为证据提交。只在公开仓库之外记录脱敏通过/失败结果。将 Argus preview 推进为 stable 要求真实 AWS/global 与腾讯 COS/CN 验证；本地模拟不能替代。v2.2.0 是打包与指南发布，沿用已稳定的远程合同并继承已有状态，不是新一轮 preview 到 stable 的推进。运行前须取得上传授权。

发布需要明确授权和新的已批准 tag；保留既有 tag。Release workflow 会分类推送的 tag，执行对应 preview 或 stable 门禁，然后从全新检出重建、检查生成文件已提交、构建并验证 Arkclaw ZIP，最后创建 GitHub release。
