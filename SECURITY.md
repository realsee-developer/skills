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
- Downloaded `output.zip`, extracted Argus artifacts, or temporary workspaces

The repository includes `npm run scan:secrets`, but automated scanning is not a substitute for reviewing changes before commit.

Resolve Argus configuration from the inherited environment, then an existing local credentials file. If configuration is missing, use a local shell or secure credential interface; do not request secrets in chat. Persist application credentials only with explicit user authorization, outside the repository in `~/.realsee/credentials` with mode 0600. Never persist temporary tokens or signed URLs. See [usage](docs/usage.md) for the configuration flow.

Argus uploads require consent for the selected input and scope; selecting files alone is not upload consent. Reuse existing consent while that scope remains unchanged. Blender reconstruction uses local exports and requires no Argus credentials; keep private source exports and generated scenes out of public reports.

## Supported Versions

Current release status is recorded in `release-channel.json` (Argus 2.1.0 is stable). Security fixes target the current `main` branch unless maintainers document a stable branch policy.
