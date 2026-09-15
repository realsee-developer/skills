# 安装指南总览

[English](../install-guides.md) | 简体中文

本仓库提供两项 skill：`argus` 将全景图上传到 Realsee 进行远程处理；`realsee-blender-reconstruction` 将已有本地导出重建为可编辑 Blender 场景。规范源码位于 `.agents/skills/`。

## 宿主对照

| 宿主 | 安装 | Skill 句柄 | 指南 |
| --- | --- | --- | --- |
| Claude Code | `/plugin marketplace add realsee-developer/skills`，然后 `/plugin install realsee-skills@realsee-developer-skills` | `realsee-skills:argus`, `realsee-skills:realsee-blender-reconstruction` | [Claude Code](claude-plugin.md) |
| Codex | `npx skills add realsee-developer/skills --skill argus --agent codex` | `$argus`, `$realsee-blender-reconstruction` | [Codex](codex.md) |
| 所有检测到的宿主 | `npx skills add realsee-developer/skills --skill argus --agent '*'` | 按宿主确定 | 本指南 |
| Arkclaw | 发布的 Arkclaw ZIP | `argus` | 仅 CN |

只装到当前宿主：

```bash
npx skills add realsee-developer/skills --skill argus
```

表中 `npx skills` 命令安装 Argus；安装 Blender 时将 `--skill argus` 替换为 `--skill realsee-blender-reconstruction`。Claude 当前插件包含两项 skill；Arkclaw 与 `npm run install:codex-skills` 只安装 Argus。

## 运行要求

Argus 需要 POSIX shell、Node.js 22+、npm 10+、npm registry 与区域 Gateway 网络访问，以及启用 Argus 的应用凭据。首次运行前，agent 按已安装 `SKILL.md` 使用锁文件补齐运行依赖。Blender skill 需要可运行的本地 Blender 和已有扫描导出、点云、CAD 或全景等资料；本地重建无需 Realsee 凭据。

## 可复现版本

Argus 可固定到 `v2.0.0`。该标签不包含 Blender skill；Blender 请使用当前仓库版本或固定到已核对包含它的本地 checkout。

```bash
npx skills add realsee-developer/skills@v2.0.0 --skill argus
```

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
