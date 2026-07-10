# 从 Argus Skill 1.x 迁移到 2.0

[English](migration-v2.md) | 简体中文

Argus Skill 2.0 保持 Skill ID 为 `argus`，但完整替换 1.x 的 VGGT 工作流。现有 `v1.0.2` 作为冻结的旧版本保留，不新增含义模糊的 `v1.0` 别名。

## 需要旧行为时固定 1.x

下列场景继续使用 `v1.0.2`：

- 输入一张 1:1 方图；
- 使用旧版单图 VGGT 接口；
- 把单个下载的 GLB 视为全部产物；
- 使用旧 H5 preview URL；
- 依赖 1.x 的 `state.json` 或 `result.json` 行为。

Pin 安装示例：

```bash
npx skills add realsee-developer/skills@v1.0.2 --skill argus
```

2.0 不迁移 1.x workspace，也不提供 1.x fallback。

## 输入变化

| 1.x | 2.0 |
| --- | --- |
| 一张 JPEG，1:1 方图或 2:1 全景图 | 1–99 张 JPEG/PNG/WebP 全景图，严格 2:1、RGB8 |
| 直接上传图片 | 每个任务上传一个规范化 ZIP |
| 单个 `--image`，可选 `--type` | 重复 `--image`，或传一个互斥的 `--zip` |

单张 2:1 全景图仍然可以作为一图批次。

## 生命周期变化

用显式命令替代同步、`--async` 和 `--resume`：

```bash
node scripts/run-argus.mjs start --image /absolute/a.jpg --workspace /absolute/workspace --yes --json
node scripts/run-argus.mjs status --workspace /absolute/workspace/<run-dir> --json
node scripts/run-argus.mjs collect --workspace /absolute/workspace/<run-dir> --json
```

`start` 提交成功即返回，`status` 每次只查询一次，`collect` 只在远端终态下载并校验结果。不再启动 detached poller。

## 输出变化

持久产物是原始 `output.zip`、安全解压目录和本地 `result.json` 索引。压缩包可包含 EXR 深度图、一个合并 GLB、逐图位姿、可选内参和 `output.json`。

远端 `task_status` 与算法 `result_status` 必须分开读取。算法结果为 `partial` 时命令成功退出，但必须处理醒目警告和 `missing_ids`；`error` 非零退出。

