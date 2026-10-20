# 故障恢复

[English](troubleshooting.md) | [简体中文](troubleshooting.zh-CN.md)

- 缺少凭据：在本地环境或当前目录私有 `.env` 配置 `REALSEE_APP_KEY`、`REALSEE_APP_SECRET` 和区域。此运行时不读取 Argus 凭据文件，Claude 插件也没有 userConfig。
- 区域错误：`REALSEE_REGION` 使用 `global` 或 `cn`。未知时向账号所有者或如视支持确认，不通过 App 下载页推断。
- 无 API 权限：按区域使用 my.realsee.ai 或 my.realsee.cn 注册，再向 developer@realsee.com 申请全景图生成 VR 权限，附区域、UserID、IdentityID。发送邮件需要用户授权。
- manifest 不匹配：确认每个 `scan_list[].id` 对应图片目录中的文件。模板图片 ID 是合成示例，不附带真实图片。
- 任务中断或轮询超时：已有 task code 时运行 `node <skillDir>/scripts/run-panorama-to-vr.mjs --workspace <workspaceRoot> --task-code <taskCode> --json`，不要重新上传。
- 找不到 skill：按[宿主说明](host-differences.zh-CN.md)核对安装目录与调用名称；依赖须安装在实际 skill 目录。

查看 `result.json` 中的 `status`，不要仅凭退出码判断远程成功。没有 VR 链接时如实报告为空。
