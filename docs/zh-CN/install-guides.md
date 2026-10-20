# 安装指南总览

[English](../install-guides.md) | 简体中文

2.3.1 包含 [PanoToVR](../../.agents/skills/panotovr/README.zh-CN.md)，将本地全景图生成如视 VR 空间和链接；与 Argus 的重建数据输出独立。使用 `npx skills add realsee-developer/skills@v2.3.1 --skill panotovr --agent codex` 安装，或用 `.` 从本地检出安装。PanoToVR 从 `v2.3.0` 起提供。生成的本地 Claude 插件包含 `realsee-skills:panotovr`。依赖安装、环境凭据与续查遵循其 SKILL.md；专用 Codex 安装器、Arkclaw 和现有 doctor 支持范围不变。下文生命周期和凭据文件机制仅针对 Argus。

原有两项 skill：`argus` 将全景图上传到 Realsee 进行远程处理；`realsee-blender-reconstruction` 将已有本地导出重建为可编辑 Blender 场景。规范源码位于 `.agents/skills/`。

## 宿主对照

| 宿主 | 安装 | Skill 句柄 | 指南 |
| --- | --- | --- | --- |
| Claude Code | `/plugin marketplace add realsee-developer/skills`，然后 `/plugin install realsee-skills@realsee-developer-skills` | `realsee-skills:argus`, `realsee-skills:panotovr`, `realsee-skills:realsee-blender-reconstruction` | [Claude Code](claude-plugin.md) |
| Codex | `npx skills add realsee-developer/skills@v2.3.1 --skill argus --agent codex` | `$argus`, `$panotovr`, `$realsee-blender-reconstruction` | [Codex](codex.md) |
| 所有检测到的宿主 | `npx skills add realsee-developer/skills@v2.3.1 --skill argus --agent '*'` | 按宿主确定 | 本指南 |
| Arkclaw | 发布的 Arkclaw ZIP | `argus` | 仅 CN |

只装到当前宿主：

```bash
npx skills add realsee-developer/skills@v2.3.1 --skill argus
npx skills add realsee-developer/skills@v2.3.1 --skill realsee-blender-reconstruction
npx skills add realsee-developer/skills@v2.3.1 --skill panotovr
```

表中 `npx skills` 命令安装 Argus；安装 Blender 时将 `--skill argus` 替换为 `--skill realsee-blender-reconstruction`。Claude 本地生成插件还包含 PanoToVR；Arkclaw 与 `npm run install:codex-skills` 只安装 Argus。

## 运行要求

Argus 需要 POSIX shell、Node.js 22+、npm 10+、npm registry 与区域 Gateway 网络访问，以及启用 Argus 的应用凭据。首次运行前，agent 按已安装 `SKILL.md` 使用锁文件补齐运行依赖。Blender skill 需要可运行的本地 Blender 和已有扫描导出、点云、CAD 或全景等资料；本地重建无需 Realsee 凭据。

## 可复现版本

三项 skill 均可固定到 `v2.3.1`。旧版 `v2.0.0` 标签仅包含 Argus。

只有旧 1:1 方图、旧版单 GLB 输出或旧 preview 行为才固定 `v1.0.2`：

```bash
npx skills add realsee-developer/skills@v1.0.2 --skill argus
```

## 凭证

仅 Argus 需要应用凭据；Arkclaw 固定区域为 `cn`。环境变量、已有凭据文件、安全配置与上传授权流程统一见[使用指南](usage.md#凭据与上传授权)。目标账号没有 Argus 能力时见 [SUPPORT.zh-CN.md](../../SUPPORT.zh-CN.md)。

## 安装之后

Blender 的调用与交付要求见[使用指南](usage.md)。Argus 在依赖和凭据就绪、已取得上传同意后调用：

```bash
node <skillDir>/scripts/run-argus.mjs start --image /absolute/a.jpg --workspace /absolute/workspace --yes --json
node <skillDir>/scripts/run-argus.mjs status --workspace /absolute/workspace/<run-dir> --json
node <skillDir>/scripts/run-argus.mjs collect --workspace /absolute/workspace/<run-dir> --json
```

不再有 detached 后台 poller。持久产物是本地 `output.zip`、经过校验的解压目录和 `result.json`。

## Agent 预检

通过 [llms.txt](../../llms.txt) 选择 skill，再读取对应 `SKILL.md` 和当前任务所需的参考资料。使用对应宿主的所选 skill 安装命令；仓库初始化面向维护者。

在包含这些脚本的本地仓库中运行：

```bash
node scripts/doctor-local.mjs --skill argus --json
node scripts/doctor-local.mjs --skill realsee-blender-reconstruction --json
```

按任务选择一条命令。Blender 不在 PATH 中时，添加 `--blender /path/to/blender`。已安装的 skill 若不带仓库脚本，按其自身 `SKILL.md` 检查前置条件。

JSON 对象包含 `schema_version: 1`、`skill`、`status` 和 `checks`。每项检查包含 `id`、`status`（`pass`、`warn` 或 `fail`）、`message`，未完成项还有可执行的 `next_step`。总体 `ready` 表示本地检查通过；`needs_configuration` 表示缺少 Argus 环境变量；`blocked` 表示前置条件或参数检查失败。只有 `blocked` 以退出码 1 结束，退出码为 0 时仍需检查 `status`。机器读取时直接运行 Node，避免 npm 自身日志混入输出。

诊断不会安装、上传或读取凭据文件内容，也不能证明远端服务可用、输入有效或建模质量达标。发现已有凭据文件时，仅提示在本地解析。Argus 检查 Node、npm、运行依赖及环境配置；Blender 独立检查其可执行程序，不依赖 Argus。凭据解析与同范围上传授权复用见[使用指南](usage.md)。
