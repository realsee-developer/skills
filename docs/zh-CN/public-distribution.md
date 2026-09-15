# 公开分发检查清单

[English](../public-distribution.md) | 简体中文

计划变更分发或发布时使用此清单。当前 Argus 元数据为 `2.2.0` / stable / passed；首次 2.0 推进属于历史。门禁条件见[发布指南](release.md)。下列 Argus 专属运行时和真实运行检查不适用于纯指令型 Blender skill。

真实 E2E 推进项适用于将 Argus preview 推进为 stable。2.2.0 沿用已有稳定远程合同与状态，不得将继承的验证记录报告为本次新运行。Uploader 发布检查适用于发布 uploader 本身。

## 仓库与版本

- [ ] `v1.0.2` 保持不变，不存在 `v1.0` 别名。
- [ ] 根包、Argus runtime 包、plugin 包与 `release-channel.json` 版本一致。
- [ ] 新 preview 的 tag 与 `next_release_candidate` 和元数据版本匹配；两区真实 E2E 通过前，元数据保持 development/preview/pending。
- [ ] 干净 clone 上 `npm run ci` 与目标 release gate 通过。
- [ ] Git status 不含凭证、`.env`、workspace、输出 ZIP 或解压产物。

## Canonical 分发

- [ ] `npm run rebuild` 同时生成 `plugins/realsee-skills/` 与 `arkclaw/argus/`。
- [ ] Claude plugin 包含 `argus` 和 `realsee-blender-reconstruction`，文件与 `.agents/skills/` 下各自规范目录字节一致。
- [ ] Arkclaw 除运行区域、示例下载器和相应生成说明所需的确定性 CN-only overlay 外，均为 canonical bytes。
- [ ] 专用 Codex 安装器与 Arkclaw 包仅支持 Argus；`npx skills add . --skill argus` 和 `npx skills add . --skill realsee-blender-reconstruction` 分别解析对应规范 skill。
- [ ] 按版本安装的示例仅指定实际包含该 skill 的 tag；`v2.2.0` 包含两项 skill，`v2.0.0` 不包含 Blender。
- [ ] Plugin manifest 没有 `userConfig` 或 MCP server。

## Argus 合同与文档

- [ ] Gateway OpenAPI 恰好包含四个公开 method 和两个基础地址。
- [ ] 双语算法 I/O 对 auto ID、`missing_ids`、`error`、可选法线、固定 `right-handed, Y-up`、stable EXR-only 深度描述一致。
- [ ] JSON Schema 2020-12 判别 success/partial/error，并要求 partial 的 `missing_ids` 非空且唯一。
- [ ] 双语使用与迁移文档说明方图/单 GLB 用户固定 `v1.0.2`。
- [ ] 文档不再把 detached polling、`--async`、`--resume` 或 2.0 H5 preview 描述成支持能力。

## Argus runtime 验证

- [ ] 输入测试覆盖 1、99、100 张；JPEG/PNG/WebP；非法 ratio/RGB8；重复名；嵌套/损坏/Zip Slip/Bomb。
- [ ] Gateway 测试覆盖路径、method、envelope、状态映射和两个 region base。
- [ ] 生命周期测试覆盖上传中断/lease 变化、submission-unknown、processing/failure、重复/并发 collect、下载中断、URL 过期。
- [ ] 产物测试覆盖 success/partial/error、ID 一致性、非法路径、无效 GLB/EXR、缺 pose/depth、可选 intrinsics 和原子恢复。
- [ ] `start`、`status`、`collect` 返回文档规定的 JSON 与退出码。

## Uploader 发布检查

- [ ] `@realsee/universal-uploader@0.1.1` 已发布且可安装。
- [ ] 单测、类型检查、构建、`npm pack` smoke 与 GitLab CI 通过。
- [ ] 生产依赖 audit 没有 high 或 critical。
- [ ] Argus 只安装 AWS Node 和腾讯 COS Node adapter 依赖，不传递安装浏览器 COS、OSS 或 uploader CLI 依赖。

## 真实 E2E 与推进

- [ ] 选定的 Argus 候选版本在 global/AWS 完成真实多图运行。
- [ ] 选定的 Argus 候选版本在 CN/腾讯 COS 完成真实多图运行。
- [ ] 两区都验证下载以及 success、partial、error 处理。
- [ ] 上述通过后才为选定版本记录 stable/passed 元数据、移除 `next_release_candidate`，并在发布新 tag 前取得授权。
- [ ] 通过 Claude plugin、仅支持 Argus 的 Codex 安装器、每项 skill 的 `npx skills` 与 CN-only Arkclaw 做全新安装测试。
- [ ] Blender 指南变更须对照规范 skill 审核输入前提、本地工具要求、可编辑交付物和适用验收项；未执行真实重建时不得声称已验证。
