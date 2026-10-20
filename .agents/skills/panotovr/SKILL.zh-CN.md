---
name: panotovr
description: 使用 PanoToVR 将本地等距柱状全景图生成为如视 VR 空间，支持图片目录、manifest 提交、已有任务续查及 VR 链接获取。深度图、点云和相机位姿使用 Argus。
---

# PanoToVR

[English](SKILL.md) | [简体中文](SKILL.zh-CN.md)

PanoToVR 上传全景图、创建远程 VR 任务、轮询并写入 `result.json`。它独立于 Argus 和本地 Blender 建模。

## 执行前

- 获得上传所选文件并创建 VR 任务的授权；同一文件和范围已有明确授权时无需重复询问。选择文件本身不代表同意上传。
- `<skillDir>` 为本文件所在目录，不依赖调用方当前目录。
- 需要 Node.js 22+、npm 10+。运行 `npm ci --prefix <skillDir> --omit=dev --ignore-scripts --no-audit --no-fund` 安装锁定依赖。
- 在本地配置 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET`、`REALSEE_REGION=global|cn`。运行时读取环境变量或当前目录的 `.env`，兼容 `CLAUDE_PLUGIN_OPTION_REALSEE_*`，不读取 Argus 凭据文件。不要在聊天中收集或输出密钥。
- 确认账号区域；未设置时运行时默认 global。全球账号使用 [my.realsee.ai](https://my.realsee.ai/)，中国大陆账号使用 [my.realsee.cn](https://my.realsee.cn/)。向 developer@realsee.com 申请全景图生成 VR API 能力，提供区域、UserID 和 IdentityID；发送邮件需要用户授权。
- workspace 放在安装目录和仓库之外。状态含上传回执，可能包含临时下载地址，应作为私有数据保管。运行时会清除自身进程的代理环境变量。

## 执行

仅图片目录，自动生成 manifest：

```sh
node <skillDir>/scripts/run-panorama-to-vr.mjs --images-dir <imagesDir> --workspace <workspaceRoot> --json
```

已有 manifest，先阅读[输入方式](references/input-modes.zh-CN.md)，参考[合成模板](assets/manifest.example.json)：

```sh
node <skillDir>/scripts/run-panorama-to-vr.mjs --manifest <manifestPath> --images-dir <imagesDir> --workspace <workspaceRoot> --json
```

已有任务续查，不重新打包、上传或提交：

```sh
node <skillDir>/scripts/run-panorama-to-vr.mjs --workspace <workspaceRoot> --task-code <taskCode> --json
```

`--workspace` 始终是任务目录的父级根目录；返回的 `workspace_dir` 是任务子目录。可选 `--project-name`、`--poll-interval-ms`、`--poll-max-attempts`；默认每 30 秒轮询，最多 60 次，也可使用 `REALSEE_POLL_INTERVAL_MS` 和 `REALSEE_POLL_MAX_ATTEMPTS`。

## 结果与恢复

读取返回 workspace 内的 `result.json`，报告 `status`、`task_code`、`project_id`、`vr_url`、`workspace_dir`。远程失败可能退出码为零但 `status: error`，必须检查 JSON。超时不证明远程失败。已有 task code 时续查；提交结果不明确且没有 task code 时，先核实，避免重复创建。链接为空时不得宣称已获得可用 VR 链接。

运行时将 JPEG/PNG/WebP 规范为 JPEG，并检查 manifest 结构和文件匹配；它没有实现 Argus 的 1–99 张、RGB8、严格 2:1 校验。应确认输入为等距柱状全景图，不要宣称已执行这些检查。

按需读取：[API 流程](references/api-workflow.zh-CN.md)、[宿主安装](references/host-differences.zh-CN.md)、[故障恢复](references/troubleshooting.zh-CN.md)。
