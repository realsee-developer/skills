# Troubleshooting

[English](troubleshooting.md) | [简体中文](troubleshooting.zh-CN.md)

## Missing credentials

Symptoms:

- `Missing REALSEE_APP_KEY or REALSEE_APP_SECRET`

Fix:

- Export the variables in your shell
- Or configure a private `.env` in the current working directory
- In Claude Code, pass credentials through the process environment
- If `REALSEE_REGION=cn`, register at [my.realsee.cn](https://my.realsee.cn/?utm_source=github)
- If `REALSEE_REGION=global`, register at [my.realsee.ai](https://my.realsee.ai/?utm_source=github)
- If the region is not known yet, do not use [h5.realsee.com/vrapplink](https://h5.realsee.com/vrapplink) to infer it. That page is for downloading the Realsee app. Confirm the account region with the account owner or Realsee support first.
- Then email [developer@realsee.com](mailto:developer@realsee.com?subject=Panorama%20Image%20to%20VR%20API%20Capability%20Request&body=Account%20region%3A%20%0AUserID%3A%20%0AIdentityID%3A%20%0A) to request the official `全景图生成 VR` API capability
- Include your account region, `UserID`, and `IdentityID` in the request email

## Invalid region

Symptoms:

- `Invalid REALSEE_REGION`

Fix:

- Use `global` for overseas or `cn` for mainland China

## Manifest mismatch

Symptoms:

- Missing image for `scan_list[].id`

Fix:

- Make sure every `id` in `manifest.json` resolves to an actual file in `--images-dir`

## Resume polling

If the initial run already submitted a task but the session ended:

```bash
node <skillDir>/scripts/run-panorama-to-vr.mjs \
  --workspace ./workspace \
  --task-code your_task_code \
  --json
```

This skips manifest preparation and upload, then resumes polling.

## Install path confusion

Symptoms:

- the host cannot find `panotovr`
- the command exists in one host but not another

Fix:

- Codex: verify the installed directory under `${CODEX_HOME:-$HOME/.codex}/skills`
- Claude Code: verify the plugin directory and namespaced skill
- Gemini CLI: point the host at the canonical `SKILL.md` or remove the conflicting global link
