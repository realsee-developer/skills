# PanoToVR

[English](README.md) | [简体中文](README.zh-CN.md)

将本地全景图生成为如视 VR 空间，返回任务编号、项目编号、VR 链接和本地结果目录。支持自动生成或提供 manifest，也可用已有 task code 续查。

从 v2.3.0 或更新版本安装 PanoToVR（v2.2.0 不含此 skill）。本地检出可将仓库来源替换为 `.`：

```sh
npx skills add realsee-developer/skills@v2.4.0 --skill panotovr --agent codex
```

需要 Node.js 22+、npm 10+、对应区域的应用凭据及全景图生成 VR API 权限。依赖安装和命令见 [Skill 指南](SKILL.zh-CN.md)。Claude 本地生成插件使用 `realsee-skills:panotovr`；专用 Codex 安装器和 Arkclaw 包仍仅包含 Argus。

上传前需获得授权。工作目录可能含临时上传地址，不要提交或公开。仅附带[合成 manifest 模板](assets/manifest.example.json)，不含真实图片或运行产物。深度、点云、位姿需求使用 Argus；可编辑场景使用 Blender 重建。
