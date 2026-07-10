# Support And Feedback Guide

[English](community.md) | [简体中文](zh-CN/community.md)

This repository is primarily published so users can inspect, install, and run Realsee skill capabilities. It is not intended as a broad community development forum.

## Reporting Bugs

Use the bug report issue template and include:

- Skill name, usually `argus`
- Command that failed
- Lifecycle command that failed (`start`, `status`, or `collect`)
- Sanitized error output
- Operating system, Node.js version, and npm version

Never include `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, generated credentials, internal URLs, account identifiers, or private result links.

## Capability Feedback

Use the capability request template when a supported workflow is missing a public capability, unclear documentation, or a runtime behavior blocks integration. Include:

- User workflow
- Expected input and output
- Whether remote upload is required
- Any relevant public API references or capability documentation
- Whether the issue is about local lifecycle state, live usage, artifact validation, or installation

## Pull Requests

Pull requests are not the primary collaboration path for this repository. Maintainers may still use pull requests for controlled updates to skill packaging, documentation, and release checks.

Maintainer pull requests should run:

```bash
npm run ci
```

If a command cannot be run locally, explain why in the pull request.
