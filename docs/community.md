# Support And Feedback Guide

[English](community.md) | [简体中文](zh-CN/community.md)

This repository is primarily published so users can inspect, install, and run Realsee skill capabilities. It is not intended as a broad community development forum.

## Reporting Bugs

Use the `Bug report` issue template. Include the skill name, installed revision, host, OS, reproduction steps, and sanitized errors. Follow [Support](../SUPPORT.md) for skill-specific details: Argus reports need lifecycle and Node.js/npm context; Blender reports need Blender/integration versions, input export types, failed steps, and expected versus actual deliverables.

Never include `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, generated credentials, internal URLs, account identifiers, or private result links.

## Capability Feedback

Use the `Capability request` template when a supported workflow is missing a public capability, unclear documentation, or a runtime behavior blocks integration. Include:

- User workflow
- Expected input and output
- Whether remote upload is required
- Any relevant public API references or capability documentation
- Whether the issue is about Argus lifecycle state or live usage, Blender reconstruction, artifact validation, or installation

## Pull Requests

Pull requests are not the primary collaboration path for this repository. Maintainers may still use pull requests for controlled updates to skill packaging, documentation, and release checks.

Maintainer pull requests should run:

```bash
npm run ci
```

If a command cannot be run locally, explain why in the pull request.
