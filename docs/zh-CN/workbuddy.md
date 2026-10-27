# 在 WorkBuddy 中使用 Argus

[English](../workbuddy.md) | 简体中文

先从 [WorkBuddy 官网](https://www.workbuddy.cn/)安装客户端并登录。下方命令使用 macOS 等环境提供的 POSIX shell。[WorkBuddy 技能指南](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)介绍了应用的技能页面与本地技能包导入方式。

## 选择安装来源

使用已发布的稳定版时，克隆固定版本源码：

```bash
git clone --branch v2.3.1 --depth 1 https://github.com/realsee-developer/skills.git
cd skills
```

使用本地修改时，在该 checkout 的仓库根目录开始，记录其提交和准备安装的改动。**已发布的 `v2.3.1` 标签不包含**新增的 `check-local.mjs` 和 `inspect-result.mjs`；请使用包含它们的 checkout，或遵循旧版已安装的 `SKILL.md`。

## 安装完整目录

WorkBuddy 从 `~/.workbuddy/skills/` 加载用户技能。使用目录安装方式，不假定 `npx skills` 已提供 WorkBuddy 宿主参数。

在选定的仓库根目录执行：

```bash
(
  set -eu
  argus_target="$HOME/.workbuddy/skills/argus"
  test -f .agents/skills/argus/SKILL.md
  if [ -e "$argus_target" ] || [ -L "$argus_target" ]; then
    echo "Argus is already installed. Follow the update steps below."
    exit 1
  fi
  mkdir -p "$HOME/.workbuddy/skills"
  cp -R .agents/skills/argus "$argus_target"
  cd "$argus_target"
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund
)
```

复制整个目录，保留运行代码、锁文件、引用资料和许可证；只有 `SKILL.md` 无法运行 Argus。

更新前，先把已有 Argus 目录移到技能目录**之外**备份：

```bash
mkdir -p "$HOME/.workbuddy/skill-backups"
argus_backup_dir="$(mktemp -d "$HOME/.workbuddy/skill-backups/argus.XXXXXX")"
mv "$HOME/.workbuddy/skills/argus" "$argus_backup_dir/argus"
```

从目标 checkout 重复安装命令。本地检查通过前保留备份，安装失败时恢复。

## 确认识别与本地前置条件

打开**专家·技能·连接器 → 技能 → 已安装**，确认 `argus` 已启用，再新建任务以读取当前指令。

对于包含本地检查工具的 checkout，让 WorkBuddy 在它自己的 shell 中运行：

```bash
node "$HOME/.workbuddy/skills/argus/scripts/check-local.mjs" --json
```

按已安装的 [SKILL.md](../../.agents/skills/argus/SKILL.md#1-ensure-runtime-dependencies) 补齐缺失的前置条件。凭据在本地配置，不要在对话中粘贴值。

## 执行所需任务

在请求中明确使用 `argus`，或从 `/` 技能菜单中选择。完整运行官方示例时，可以这样描述：

> 使用 Argus 下载与当前凭据区域一致的官方示例，并校验文件摘要。我同意将这组示例上传到 Realsee。请完整重建一次，查询状态到终态，收集结果并报告结论。输入和结果保存在技能目录之外的新工作区。

保留返回的 `workspace_dir`，用于续查或复核。已安装的 [SKILL.md](../../.agents/skills/argus/SKILL.md) 定义了上传授权、完整执行与单步请求、中断恢复，以及[离线复核与交付](../../.agents/skills/argus/SKILL.md#7-verify-and-report-the-collected-result)规则。
