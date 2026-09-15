# Realsee Blender 空间重建

简体中文 | [English](README.md)

把本地 Realsee 扫描导出重建为可编辑 Blender 空间的 agent 工作流。先还原结构和区域连接，再按要求完成家具、材质和灯光。这是指令型 skill：agent 读取你的证据并实际执行适合该场景的 Blender 操作，不是固定参数的一键重建 CLI。

默认以快速反馈推进整体空间：先搭出所有要求区域，再改善主要形状与外观，最后细化有用细节。复用组件、局部修改已保存场景、保持预览低成本。参见[快速流程与来源教程](references/fast-workflow.zh-CN.md)及[自动化技巧](references/automation-performance.zh-CN.md)。

## 使用

在本仓库的本地检出目录安装：

```sh
npx skills add . --skill realsee-blender-reconstruction --agent codex
```

在能访问本地文件、执行 Blender 的 agent 中打开建模项目，将导出资料放到 `data/` 并保留模型/贴图目录结构，然后发送：

> 使用 $realsee-blender-reconstruction，读取 data/ 中的 Realsee 导出资料，把有证据的整个空间重建为可编辑原生 Blender 场景。优先完成墙、地面、顶面、门窗和区域连接，尽早展示完整空间预览，再按观看与编辑用途细化。保存为 output/reconstruction_native.blend。对照来源检查，再重开临时副本，实际验证几何和材质编辑。

后续可以继续：

> 制作经过各连通区域的漫游，保留可编辑相机动画，并交付能播放的视频。

> 同时加入物理材质与碰撞/刚体行为，再导出和验证 USDZ 副本。

## 环境与范围

需要本地 Blender、能读文件和执行命令的 agent，以及带纹理扫描、点云、CAD 或全景等来源证据。使用已有本地导出不需要 Realsee API Key 或远程上传。额外解析器与编码器取决于实际格式和目标产物；只有全景且无可靠尺度时不能声称实测米制重建。

skill 适配用户选择的项目，不携带原案例扫描、模型、贴图、尺寸、凭据或机器路径。不会自动运行 Argus、发布网站或购买/上传生成资产。执行细节见[工作流](SKILL.zh-CN.md)。

方法提炼自公开的 [Realsee × Astra × Blender 参考项目](https://github.com/realsee-developer/realsee-astra-blender)，建模重点与验证方法适用于具备相应本地能力的 agent，不要求特定模型名称。本 skill 新编写的指令沿用仓库[许可](LICENSE)；来源项目代码和第三方场景素材保持各自条款，未打包在此。
