# argus — arkclaw 版

Realsee Argus / VGGT skill 的 **arkclaw 分发版本**。把本地 JPEG 单图(1:1)或全景图(2:1)上传到 Realsee Argus,生成 GLB。

- **仅支持 CN 环境** — Gateway 固定 `app-gateway.realsee.cn`,无需区域选择。
- **独立维护**,不与主仓库的 `.agents/skills/argus/` 联动。

## 前置条件

- Node.js ≥ 22、npm ≥ 10
- 到 `app-gateway.realsee.cn` 的网络访问
- 一对 Realsee Argus VGGT 的 API 凭证:`APP_KEY` / `APP_SECRET`
  - 在 [my.realsee.cn](https://my.realsee.cn) 注册账号,然后邮件 [developer@realsee.com](mailto:developer@realsee.com?subject=Argus%20VGGT%20API%20Capability%20Request) 申请 Argus VGGT API 能力,邮件附上账号 region(填 `cn`)、**如视ID**、**组织账号**。
  - 审核通过后通过邮件下发凭证。

## 安装

把 zip 解压到本地任意目录,然后:

```bash
cd <解压目录>
npm install
```

## 使用

完整的 agent 使用流程见 `SKILL.md`。直接命令行:

```bash
# 1. 凭证写入磁盘(只做一次,权限 0600)
mkdir -p ~/.realsee && umask 077
cat > ~/.realsee/credentials <<'EOF'
REALSEE_APP_KEY=<your-app-key>
REALSEE_APP_SECRET=<your-app-secret>
REALSEE_REGION=cn
EOF
chmod 600 ~/.realsee/credentials

# 2. 运行
set -a; . ~/.realsee/credentials; set +a; \
  node scripts/run-argus.mjs \
  --image /absolute/path/input.jpg \
  --type panorama \
  --workspace ./workspace \
  --yes --json --async
```

## 演示样例

CDN 上的两组样例可直接拉来跑:

| 类型 | 输入 JPEG | 期望产出 GLB |
| --- | --- | --- |
| 全景(2:1) | `https://vr-public.realsee-cdn.cn/release/web/argus/pano-v2/example1/photo.d188e5b1.jpg` | `https://vr-public.realsee-cdn.cn/release/web/argus/pano-v2/example1/scene.e74c193b.glb` |
| 单图(1:1) | `https://vr-public.realsee-cdn.cn/release/web/argus/pinhole-v2/example3/photo.9cbad3a3.jpg` | `https://vr-public.realsee-cdn.cn/release/web/argus/pinhole-v2/example3/scene.b77ac8a2.glb` |

## 参考

- 技能流程与文案规则:[SKILL.md](SKILL.md)
- Gateway 流程细节:[references/api-workflow.md](references/api-workflow.md)
- 排障:[references/troubleshooting.md](references/troubleshooting.md)
- Gateway OpenAPI 契约:[references/argus-gateway-openapi.json](references/argus-gateway-openapi.json)
