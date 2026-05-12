# Security Policy

[English](SECURITY.md) | [简体中文](SECURITY.zh-CN.md)

## Reporting Security Issues

Do not open public issues for vulnerabilities, leaked credentials, private endpoints, or account-specific data.

Report security concerns through the repository maintainer contact path or the private security reporting feature on GitHub if it is enabled for `realsee-developer/skills`.

Include:

- A short description of the issue
- Affected skill or script
- Reproduction steps that do not expose secrets
- Any known impact

## Secret Handling

Never commit:

- `REALSEE_APP_KEY`
- `REALSEE_APP_SECRET`
- Generated upload credentials
- Internal URLs
- Account identifiers
- Private result URLs
- Downloaded GLB files or temporary workspaces

The repository includes `npm run scan:secrets`, but automated scanning is not a substitute for reviewing changes before commit.

## Supported Versions

The repository is in development. Security fixes target the current `main` branch unless maintainers document a stable branch policy.
