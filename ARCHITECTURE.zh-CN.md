# 架构

[English](ARCHITECTURE.md) | 简体中文

Argus Skill 2.0 使用一个 canonical source、显式持久化生命周期，以及面向不同 agent host 的生成包。

## Source-of-truth 地图

```text
.agents/skills/argus/                 Canonical Skill source
├── SKILL.md                          Agent 生命周期与安全规则
├── README.md / README.zh-CN.md       用户文档
├── package.json / package-lock.json  Node runtime 与锁定依赖
├── scripts/run-argus.mjs             公开 CLI 入口
├── src/                              Runtime 实现
├── test/                             合同、输入、生命周期、产物测试
└── references/
    ├── argus-gateway-openapi.json    Gateway 四路径公开合同
    ├── algorithm-io*.md              双语算法输入输出合同
    ├── argus-output.schema.json      JSON Schema 2020-12 输出联合
    └── migration-v2*.md              双语 1.x 迁移指南

plugins/realsee-skills/               生成的 Claude plugin copy
arkclaw/argus/                        带确定性 CN-only overlay 的 Arkclaw copy
release-channel.json                  发布成熟度与版本元数据
llms.txt                              机器可读仓库索引
```

## 深 runtime 模块

Runtime 只暴露三个生命周期操作：

```text
start   -> 校验 -> 规范化 ZIP -> 上传 -> 提交 -> 持久化 task_code
status  -> 读取 state -> 查询一次 -> 映射 task_status -> 持久化
collect -> 查询一次 -> 原子下载 -> 校验/解压 -> 写结果索引
```

生命周期模块负责不变量、workspace 原子状态、幂等与错误分类。外部细节被隔离在两个可注入 port 后面：

- `ArgusTaskPort`：Gateway 鉴权、上传 token lease、任务提交与任务信息查询。
- `ObjectTransferPort`：流式对象上传与原子结果下载。

生产 adapter 对接 Gateway、AWS Node 或腾讯 COS Node；测试在 port 边界使用 fake，不依赖云 SDK 或 live 服务。

## 输入边界

`--image` 与 `--zip` 最终进入同一个规范化输入 pipeline。调用者给的 ZIP 不会被直接信任或原样上传。Pipeline 安全展开根条目，校验 1–99 张 JPEG/PNG/WebP RGB8 严格 2:1 全景图，把文件名规范化为 UTF-8 NFC，拒绝 stem/case-fold 冲突，按 NFC UTF-8 字节排序，再写出一个确定性的流式 ZIP。

产品容量继续由 Gateway 控制。本地只实施结构和资源保护：条目数、安全路径、实际展开字节、压缩行为与磁盘剩余空间。

## 持久化生命周期

Schema-v2 `state.json` 是一次运行的持久化事实源。它记录 region、phase、脱敏输入摘要、上传回执与 `task_code`；绝不记录 APP 凭证、临时上传凭证、access token、预签名 URL 或 provider 原始错误。

任务提交不自动重试。请求可能已被服务端接受但响应丢失时，phase 变为 `submission_unknown`，阻止其他进程盲目创建重复任务。

`status` 每次只查询一次。不启动 detached 子进程，也没有隐藏轮询。多个进程可以查看同一个 run；collect 通过 lock/原子 transition 保证只有一个进程下载和收尾。

## 产物边界

`collect` 保留原始 `output.zip`，先解压到临时目录，再原子完成。它校验 HTTP 传输长度、Gateway 可选 size/MD5、ZIP CRC、安全路径、解压限制、[输出 Schema](.agents/skills/argus/references/argus-output.schema.json)、引用文件、成功/缺失 ID 集合以及 GLB/EXR magic。

本地 `result.json` 明确分开：

- `task_status`：`queued`、`processing`、`succeeded` 或 `failed`；
- `result_status`：`success`、`partial` 或 `error`。

partial 结果可用且退出码为 0，但一定包含警告和非空 `missing_ids`；error 非零退出。

## Gateway 边界

Gateway 基础地址与凭证/region 合同不变，只替换 Argus 接口：

- `POST /auth/access_token`
- `GET /open/v1/argus/file/token`
- `POST /open/v1/argus/task/submit`
- `GET /open/v1/argus/task/info`

文件 token 响应是在内存中使用的 upload lease。`bucket + region + prefix` 构成 lease locator；只有 locator 不变时，刷新凭证才允许续传。

## 分发流

```text
                         .agents/skills/argus
                           canonical source
                 ┌──────────────┼──────────────┐
                 │              │              │
                 ▼              ▼              ▼
        Claude plugin copy   Codex / npx    Arkclaw copy
        字节一致             直接用 source   canonical bytes +
                                           CN-only overlay
```

`npm run rebuild` 重新生成 Claude 与 Arkclaw 包，并与 canonical bytes 比较。确定性的 Arkclaw overlay 会在 `scripts/run-argus.mjs` 中强制 `REALSEE_REGION=cn`、把 `scripts/download-examples.mjs` 限制为 CN，并让生成后的 Skill、README 与示例指南明确同一限制；其余文件必须与 canonical source 字节级一致。

## 校验与发布

`npm run ci` 依次运行 secret 扫描、双语文档、AI 索引、仓库边界、Skill 校验、分发生成与一致性检查、发布元数据校验和完整 Skill 测试。

`v1.0.2` 保持为冻结的旧版本。2.0 按以下顺序发布：先发布 uploader 0.1.1，再切 `v2.0.0-rc.3`，完成 CN/Global 真机 E2E（含 partial/error 收集），最后把 `v2.0.0` 标记为 stable。两区都通过前，release metadata 保持 preview/development，stable gate 为 pending。

## 生成文件

不要手工修改 `plugins/realsee-skills/**` 或 `arkclaw/argus/**`。修改 `.agents/skills/argus/**` 和窄范围 Arkclaw overlay generator，然后运行 `npm run rebuild`。
