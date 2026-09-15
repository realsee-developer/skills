# Support

[English](SUPPORT.md) | [简体中文](SUPPORT.zh-CN.md)

Use this file to find the fastest channel for your situation.

## Bug Reports & Repository Issues

Open a GitHub issue at [realsee-developer/skills/issues](https://github.com/realsee-developer/skills/issues):

- **Bug** — runtime failures, install issues, or doc errors. Use the `Bug report` template and identify `argus` or `realsee-blender-reconstruction`, the installed revision, host, OS, reproduction steps, and sanitized error output.
  - **Argus**: include the lifecycle command (`start`, `status`, or `collect`), `node --version`, `npm --version`, and relevant `result.json` / `state.json` fields. Redact task codes, object paths, credentials, and private URLs.
  - **Blender**: include the Blender version, available local integration, input export types, failed reconstruction or validation step, and expected versus actual deliverables. Use sanitized descriptions or non-private examples; Argus lifecycle files and credentials are not required.
- **Feature request** — use the `Capability request` template. Explain whether it affects the Argus runtime, Blender reconstruction guidance, skill packaging, or installation.

Do **not** include `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, generated credentials, internal URLs, account identifiers, or private result links in any public issue.

## Realsee Open Platform / API Capability

Blender reconstruction does not require Argus Gateway access or credentials. GitHub issues cannot grant Argus Gateway access. For account and capability questions:

- Register an account: [my.realsee.ai](https://my.realsee.ai/?utm_source=github) (global) / [my.realsee.cn](https://my.realsee.cn/?utm_source=github) (cn).
- Request API capability: email [developer@realsee.com](mailto:developer@realsee.com?subject=Argus%20API%20Capability%20Request) with your account region, `UserID`, and `IdentityID`.

## Security

Report potential vulnerabilities privately. See [SECURITY.md](SECURITY.md) / [SECURITY.zh-CN.md](SECURITY.zh-CN.md).

## Host-Specific Install Help

- Claude Code plugin install: [docs/claude-plugin.md](docs/claude-plugin.md)
- Codex install: [docs/codex.md](docs/codex.md)
- Cross-host overview: [docs/install-guides.md](docs/install-guides.md)
