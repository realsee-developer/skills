# Agent Guide

[English](AGENTS.md) | [简体中文](AGENTS.zh-CN.md)

This repository is optimized for agents and automation that help users inspect, install, package, or run Realsee skills.

## Repository Intent

- Audience: users, agent runtimes, and maintainers.
- Primary capability: `argus`, which processes 1–99 local 2:1 panoramas into depth maps, a merged GLB point cloud, camera poses, optional intrinsics, and a validated result index.
- Distribution model: source-available capability packaging.

## Safe Operating Rules

- Treat Argus runs as remote uploads. Confirm user consent before any upload.
- Do not commit secrets, generated credentials, account identifiers, private URLs, downloaded Argus archives or extracted artifacts, `.env` files, or temporary workspaces.
- Keep public docs bilingual. English uses default paths. Simplified Chinese uses `docs/zh-CN/`, `README.zh-CN.md`, or same-directory `*.zh-CN.md` files.
- Edit source skill files under `.agents/skills/`.
- Run `npm run rebuild` after source skill changes.
- Do not reintroduce internal evidence files, live scorecards, private source references, internal process docs, or local absolute paths.

## Common Commands

```bash
npm run install:codex-skills
npm run doctor
npm run validate:ai
npm run rebuild
npm run test:skill
npm run ci
```

## AI Index

- Use [`llms.txt`](llms.txt) for the compact machine-readable repository map.
- Use [`docs/usage.md`](docs/usage.md) for the user-facing skill usage guide.
