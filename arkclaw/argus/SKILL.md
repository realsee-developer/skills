---
name: argus
description: 调用 Realsee Argus / VGGT,把本地的 JPEG 单图(1:1)或全景图(2:1)转成 Realsee Argus GLB。当用户希望从本地图片生成 Argus GLB、或提到 Realsee Argus / VGGT 重建时使用本技能。
compatibility: 需要 Node.js 与到 app-gateway.realsee.cn 的网络访问。
metadata:
  version: "1.0.0"
  documentation: README.md
  region: cn
---

# argus(arkclaw 版)

把本地 JPEG(单图 1:1 或全景 2:1)上传到 Realsee Argus / VGGT,生成 GLB。**本版本仅支持 CN 环境**(`app-gateway.realsee.cn`)。

技能整体走 Realsee Gateway 链路(鉴权 → 取上传 token → 分片上传 → 触发任务 → 轮询 → 下载)。唯一的脚本是 `scripts/run-argus.mjs`;其余流程(收集凭证、校验输入、轮询、打开结果)都由你 — agent — 通过 Bash 工具按本文件指引执行。

`<skillDir>` 指本 `SKILL.md` 所在目录;在 Bash 调用里,根据你调用脚本时使用的路径推导出来。

---

## 演示样例

如果用户想先看效果再决定怎么用,直接用下面的样例跑一遍即可(无需用户提供图片)。两组样例都托管在 Realsee 官方 CDN(`vr-public.realsee-cdn.cn`),可直接下载。

**样例 A — 全景(2:1)**

- 输入图:`https://vr-public.realsee-cdn.cn/release/web/argus/pano-v2/example1/photo.d188e5b1.jpg`
- 期望产出 GLB(参考):`https://vr-public.realsee-cdn.cn/release/web/argus/pano-v2/example1/scene.e74c193b.glb`

**样例 B — 单图(1:1)**

- 输入图:`https://vr-public.realsee-cdn.cn/release/web/argus/pinhole-v2/example3/photo.9cbad3a3.jpg`
- 期望产出 GLB(参考):`https://vr-public.realsee-cdn.cn/release/web/argus/pinhole-v2/example3/scene.b77ac8a2.glb`

把样例图拉到本地工作区后,按下方步骤 1~5 跑一次完整链路即可。例如(全景样例):

```bash
mkdir -p ./argus-demo && cd ./argus-demo
curl -L -o pano-sample.jpg "https://vr-public.realsee-cdn.cn/release/web/argus/pano-v2/example1/photo.d188e5b1.jpg"
# 接下来按 Step 1 准备凭证,Step 2 校验比例(2:1),Step 3 上传运行。
```

跑完后,把脚本返回的 `output_glb_path` 与官方的"期望产出 GLB"放在一起,可以让用户直观对比 Argus 的输出。

---

## Step 1 — 准备凭证

CN 环境只需要两个值放进环境变量:`REALSEE_APP_KEY`、`REALSEE_APP_SECRET`。区域固定 `cn`(`app-gateway.realsee.cn`),脚本会自动注入,你**无需**询问用户区域。

**重要:不要执行任何会把凭证值打印到 stdout 的命令。** 比如 `printenv REALSEE_APP_KEY` 会把值打到 stdout,被 Bash 工具捕获、写进 Claude 会话记录。检测存在性时把 stdout 重定向到 `/dev/null`,只看退出码,或用 `[ -n "$VAR" ]` 比较空值。

凭证解析顺序:

1. **当前 shell 环境已有?** 只看退出码:
   ```bash
   printenv REALSEE_APP_KEY REALSEE_APP_SECRET >/dev/null \
     && echo present || echo missing
   ```
   输出 `present` → 跳到 Step 2。

2. **`~/.realsee/credentials` 里?** 文件是 shell 可 source 的 env 片段(每行 `KEY=value`):
   ```bash
   [ -f ~/.realsee/credentials ] && set -a && . ~/.realsee/credentials && set +a; \
     [ -n "$REALSEE_APP_KEY" ] && [ -n "$REALSEE_APP_SECRET" ] \
     && echo present || echo missing
   ```
   输出 `present` → 跳到 Step 2。

   **如果 `.` 报 `command not found:`(行格式像 `appKey: ...`)**,说明文件是旧版本格式 — `rm -f ~/.realsee/credentials` 删掉,走 Step 1a 让用户重新填一次。本技能只支持 `KEY=value` 一种格式,不维护迁移路径。

3. **都没有,通过一题一轮的 Q&A 向用户收集。** 见 Step 1a。

### Step 1a — Q&A 流程(一次问一项)

**硬性约束:**

- **一次只问一项。** 不要在一条消息里同时问 APP_KEY 和 APP_SECRET。问一个,等回复,再问下一个。
- **绝不要回显凭证值。** 用户给了 `APP_KEY` 之后,后续回复不要再原样重复它,称作"你刚才提供的 APP_KEY"即可。
- **绝不要把凭证写到 Bash 命令行里。** 不要 `--flag` 形式,也不要 env-prefix(`REALSEE_APP_KEY=... node ...`)— Bash 工具会把整条命令(包括 env-prefix)记入 Claude 会话记录和 JSONL 会话文件。命令行里的凭证 = 永久日志里的凭证泄漏。**唯一安全的写法**是 `set -a; . ~/.realsee/credentials; set +a; node ...` — 值在磁盘上(权限 0600),通过 `source` 注入子进程 env,绝不在命令行出现。
- **去除前后空白。** 用户粘贴常带尾部空白,使用前 trim 一下。

**顺序:**

1. **APP_KEY(一次,一句话):**
   > "请粘贴你的 `REALSEE_APP_KEY`。"

2. **APP_SECRET(下一轮,一句话):**
   > "现在请粘贴你的 `REALSEE_APP_SECRET`。"

3. **是否保存?** 在支持 `AskUserQuestion` 的宿主上优先用选项形式:
   - `保存(推荐)` — 写入 `~/.realsee/credentials`(权限 0600),下次免问。
   - `仅本次使用` — 仅本次会话生效。
   
   不支持选项交互的宿主就纯文本问 yes/no。

4. **始终先落盘。** 即使用户选了`仅本次使用`,也要把值写到磁盘文件里 — 否则把它们传给 `run-argus.mjs` 的唯一办法就是命令行,会泄漏到记录里。处理方式:
   - 选了`保存(推荐)` → 写一次,留着。
   - 选了`仅本次使用` → 写一次,跑完后等 `result.json` 落到 `success` 或 `error`,再 `rm -f ~/.realsee/credentials` 删除。

   用 Bash heredoc + `chmod 600` 写入。Heredoc 会把值在记录里出现**恰好一次**(无法避免 — 用户在 chat 里输入时已经在记录里了)。后续每一次 Bash 调用都必须用 `source` 加载,不要再回显:
   ```bash
   mkdir -p ~/.realsee
   umask 077
   cat > ~/.realsee/credentials <<'EOF'
   REALSEE_APP_KEY=<value>
   REALSEE_APP_SECRET=<value>
   REALSEE_REGION=cn
   EOF
   chmod 600 ~/.realsee/credentials
   ```
   用 `ls -l ~/.realsee/credentials` 校验权限是 `-rw-------`。

**用户还没有 `APP_KEY` / `APP_SECRET` 怎么办?** 引导用户先到 [my.realsee.cn](https://my.realsee.cn) 注册账号,然后邮件 developer@realsee.com 申请 Argus VGGT API 能力,邮件附上账号 region(填 `cn`)、**如视ID**、**组织账号**。审核通过后,Realsee 会通过邮件下发 `APP_KEY` / `APP_SECRET`。

---

## Step 2 — 校验输入图

Argus 对宽高比的要求是严格的:

- **2:1(±0.05)** → 全景图(例如 `4096×2048`、`8192×4096`)。上传字段:`panoImage.jpg`。
- **1:1(±0.05)** → 单图(例如 `1024×1024`、`2048×2048`)。上传字段:`pinholeImage.jpg`。

脚本服务端会做一道防御性校验;**你也要在客户端先预检**,让用户拿到快速反馈。一次 Bash 调用读出 JPEG 尺寸即可。跨平台多选一:

```bash
# macOS:
sips -g pixelWidth -g pixelHeight "<path>" 2>/dev/null

# ImageMagick(Linux / macOS Homebrew):
identify -format '%w %h\n' "<path>" 2>/dev/null

# 纯 Node 兜底(默认可用):
node -e "
  const fs = require('fs');
  const buf = fs.readFileSync(process.argv[1]);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) { console.error('Not JPEG'); process.exit(1); }
  let off = 2;
  while (off < buf.length) {
    if (buf[off] !== 0xff) break;
    const marker = buf[off + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      console.log(buf.readUInt16BE(off + 7), buf.readUInt16BE(off + 5));
      process.exit(0);
    }
    off += 2 + buf.readUInt16BE(off + 2);
  }
  process.exit(1);
" "<path>"
```

算 `ratio = width / height`:

- `0.95 ≤ ratio ≤ 1.05` → 判为 `image`,继续。
- `1.95 ≤ ratio ≤ 2.05` → 判为 `panorama`,继续。
- 其它 → **停下**。告诉用户:"识别到 `<W>×<H>`(ratio `<r>`),Argus 只接受 2:1 全景或 1:1 单图,请裁剪或缩放后重试。" 不要上传。

上传前用一句话告诉用户判定结果,例如:"识别为全景图(4096×2048)。"

---

## Step 3 — 运行

**不要再问一次确认。** 如果用户在调用技能时已经指了具体路径(例如 "用 argus 处理 /path/to/photo.jpg"),或者已经回答过你的"选哪张图"问题,那就是上传同意。再问"确认上传?"只是噪音。

两种情形:

- **用户已经给了路径。** 直接走。Step 2 判完类型后说一句:"识别为 `<image|panorama>`(`<W>×<H>`),正在上传到 Argus(cn 区域)。" 然后跑。
- **用户没给路径。** 选图的那一问就是同意点。一次问完:"想把哪张图上传到 Realsee Argus 生成 GLB?(图片会离开你的设备,由 Argus 处理。)" 拿到路径 → 跑 Step 2 → 直接跑,不再问第二次。

用一次 Bash 调用从磁盘加载凭证并运行。凭证不出现在命令行 — 它们在 0600 权限的 env 片段文件里,`source` 把它们注入子进程 env:

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node <skillDir>/scripts/run-argus.mjs \
  --image "<abs-path>" \
  --type <image|panorama> \
  --workspace "<workspace-parent>" \
  --yes --json --async
```

- `--type` 必须和 Step 2 的判定结果一致。
- `--async` 立即返回;后台进程负责轮询并落 `result.json`。默认用 `--async`,避免会话卡在 Argus 推理上。
- 需要单次调用拿结果就去掉 `--async`,改同步。

**反模式 — 不要这么做。** 下面的写法每次都会把 `APP_SECRET` 永久写进 Claude 会话记录和 JSONL 文件:
```bash
# 错误:env-prefix 会原样进入 Bash 命令记录。
REALSEE_APP_KEY="..." REALSEE_APP_SECRET="..." \
  node <skillDir>/scripts/run-argus.mjs ...
```
永远先 `source` 再调。

**遇到 `Cannot find module '@realsee/universal-uploader'`?** 解压目录里没有 `node_modules`。在解压后的目录跑一次 `npm install`,然后重试。

stdout 上的那一行 JSON 是进行中状态:

```json
{
  "status": "in_progress",
  "workspace_dir": "...",
  "input_image_id": "...",
  "vggt_type": "pinhole" | "pano",
  "background_poll_pid": 12345,
  ...
}
```

记下 `workspace_dir` — Step 4 / 5 都依赖它。

---

## Step 4 — 轮询直到完成

后台进程在 `workspace_dir` 下写 `result.json`。直接读:

```bash
cat "<workspace_dir>/result.json" 2>/dev/null || echo '{"status":"in_progress"}'
```

每 5~10 秒一次,解析 JSON。`.status` 不再是 `"in_progress"` 就停。Argus 推理一般几秒到几分钟。

后台轮询挂掉(很少见)的话,从 workspace 续跑 — 同样的 `source` 后再调:

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node <skillDir>/scripts/run-argus.mjs --resume --workspace "<workspace_dir>" --json
```

---

## Step 5 — 汇报并打开结果

`status === "success"` 时,payload 包含:

- `task_id` — Argus 任务 id。
- `output_glb_path` — 下载好的 `.glb` 的绝对路径。
- `preview_url` — CN H5 预览链接,形如 `https://h5.realsee.cn/argus/{image|panorama}/task/{task_id}`,有效期 7 天。
- `download.bytes` — 文件大小。
- `elapsed_ms` — 总耗时。

把这些汇总告诉用户,然后问一句:**"打开本地 GLB / 浏览器打开 H5 预览 / 两个都打开 / 都不打开?"**

用户选了"打开"就调用系统默认 opener。按平台选,不要混用:

```bash
case "$(uname -s)" in
  Darwin)            open "<path-or-url>" ;;
  Linux)             xdg-open "<path-or-url>" ;;
  CYGWIN*|MINGW*|MSYS*) start "" "<path-or-url>" ;;
  *)                 echo "Unsupported platform: $(uname -s)" >&2 ;;
esac
```

按用户的选择打开 GLB 和/或预览 URL。

`status === "error"` 时把 payload 里的 `error` 转给用户,问要不要重试(再跑 Step 3)或者升级反馈。

---

## 其它配置(很少用)

- `REALSEE_POLL_INTERVAL_MS`(默认 5000)— `run-argus.mjs` 内部轮询间隔(毫秒)。
- `REALSEE_POLL_MAX_ATTEMPTS`(默认 120)— 整体轮询次数上限。

两者也可以通过 `--poll-interval-ms` / `--poll-max-attempts` 参数传入。
