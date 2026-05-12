# argus

![Skill argus](https://img.shields.io/badge/skill-realsee--argus-6f42c1?style=flat-square)
![Live tested](https://img.shields.io/badge/live-tested-2ea44f?style=flat-square)
![Upload consent](https://img.shields.io/badge/upload-consent%20required-brown?style=flat-square)

[English](README.md) | 简体中文

`argus` 是一个本地 Skill 包，用于从本地 JPEG 图片或全景图生成 Realsee Argus GLB 输出。

## 安装和使用

当该包增加依赖时，请在包目录中安装依赖：

```bash
npm install
```

同步调用（阻塞直到 GLB 下载完成；Argus 推理可能耗时数分钟）：

```bash
node scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json
```

异步调用（立即返回 `status: in_progress`，detached 子进程在后台轮询并下载，结果写入 workspace 下的 `state.json` 和 `result.json`）：

```bash
node scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json --async
```

从 workspace 目录恢复 / 完成异步任务：

```bash
node scripts/run-argus.mjs --resume --workspace ./workspace/<run-dir> --json
```

输入类型按 JPEG 尺寸自动判定并强制校验：

- **2:1（±0.05）** → 全景图（如 4096×2048）。
- **1:1（±0.05）** → 针孔图（如 1024×1024）。
- 其他比例直接拒掉，错误信息 `Unsupported aspect ratio`，不发生任何上传。

传 `--type panorama` / `--type image` 可强制覆盖自动判型，但仍会按上述比例校验文件。

## 打开结果

`cat ./workspace/<run-dir>/result.json` 显示 `"status": "success"` 之后，主动问用户要哪种预览方式，然后直接调系统 opener：

```bash
case "$(uname -s)" in
  Darwin)               open "<path-or-url>" ;;
  Linux)                xdg-open "<path-or-url>" ;;
  CYGWIN*|MINGW*|MSYS*) start "" "<path-or-url>" ;;
esac
```

按用户选择打开 GLB（`<run-dir>/<task_id>.glb`）和/或 `result.json` 里的 `preview_url`。`status` 不是 `success` 之前不要打开任何东西。

## 配置

配置只从环境变量读取：

- `REALSEE_APP_KEY`
- `REALSEE_APP_SECRET`
- `REALSEE_REGION`
- `REALSEE_POLL_INTERVAL_MS`
- `REALSEE_POLL_MAX_ATTEMPTS`

不要提交真实 secrets、账号标识、内部 URL 或生成凭证。

## 上传同意

真实 Argus 生成会把选中的本地图片文件上传到 Realsee 远程服务。运行任何真实上传命令之前，必须确认用户理解并同意该上传。

## 输出处理

工作流提供持久输出产物时，应将其保存在本地。不要把生成的远程链接视为永久记录。

## Gateway 状态

公开 Gateway 请求边界记录在 `references/argus-gateway-openapi.json`。稳定 live 使用仍要求目标账号或 app 已启用所需 Argus/VGGT 能力。
