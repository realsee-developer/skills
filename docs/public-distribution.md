# Public Distribution Checklist

[English](public-distribution.md) | [简体中文](zh-CN/public-distribution.md)

Run through this checklist before cutting a public release tag.

## 1. Repository Hygiene

- [ ] `npm run ci` is green locally on a clean clone (`npm ci` + `npm install --prefix .agents/skills/argus`).
- [ ] `npm run release:gate -- --channel stable --tag <next>` passes.
- [ ] `git status` is clean; no committed `.env`, `node_modules/`, `workspace/`, `*.glb`, or generated runtime artifacts.
- [ ] No absolute home-directory paths, internal hostnames, or other denied substrings in tracked files. Run `npm run validate:repo-boundary`; the full deny list lives in `scripts/validate-repo-boundary.mjs`.

## 2. Skill State

- [ ] `release-channel.json#skills.argus.state` reflects current maturity (`preview` or `stable`).
- [ ] `release-channel.json#skills.argus.stable_gate` is `passed` when promoting to stable.
- [ ] `release-channel.json#version` matches the planned tag (e.g. `1.0.0` for `v1.0.0`).
- [ ] `package.json#version` and `.agents/skills/argus/package.json#version` match `release-channel.json#version`.

## 3. Generated Artifacts

- [ ] `npm run rebuild` regenerates `plugins/realsee-skills/` and `check:claude-sync` is byte-identical to `.agents/skills/argus/`.
- [ ] `plugins/realsee-skills/.claude-plugin/plugin.json` carries the expected `$schema`, `name`, and `description`. It must NOT declare `userConfig` — credentials are resolved at runtime by the skill, not at install time.
- [ ] `plugins/realsee-skills/.mcp.json` does NOT exist — the skill runs via Bash, not via an MCP server.
- [ ] `.claude-plugin/marketplace.json` plugin entry points at `./plugins/realsee-skills`.

## 4. Docs

- [ ] English + Simplified Chinese pairs exist for every user-facing doc (`README.md` / `README.zh-CN.md`, `AGENTS.md` / `AGENTS.zh-CN.md`, `docs/*.md` / `docs/zh-CN/*.md`, `SUPPORT.md` / `SUPPORT.zh-CN.md`, `ARCHITECTURE.md` / `ARCHITECTURE.zh-CN.md`).
- [ ] `llms.txt` references every install command, doc path, and validation script (`scripts/validate-ai-index.mjs` enforces this).
- [ ] Install examples reference `vX.Y.Z` tags when used for pinned installs.

## 5. Real-World Verification

- [ ] Argus e2e is green for `REALSEE_REGION=global` (AWS adaptor).
- [ ] Argus e2e is green for `REALSEE_REGION=cn` (Tencent COS adaptor).
- [ ] Async + resume flow verified: `--async` returns `status: in_progress`, the detached poller writes `result.json`, and `--resume` continues a paused run.
- [ ] Smoke test for the three install paths: `claude --plugin-dir ./plugins/realsee-skills`, `npm run install:codex-skills`, `npx skills add . --skill argus`.

## 6. Security Surface

- [ ] No credentials in tracked files (`scripts/scan-secrets.mjs` enforces this).
- [ ] OpenAPI contract at `.agents/skills/argus/references/argus-gateway-openapi.json` is the public Realsee Argus/VGGT contract — no internal evidence text (`scripts/release-gate.mjs#validatePublicGatewayOpenApi`).
- [ ] CodeQL workflow has no open alerts.

## 7. Tag & Release

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

- [ ] `.github/workflows/release.yml` ran successfully on the tag (it runs the stable gate then `gh release create --generate-notes --latest`).
- [ ] GitHub Release exists with auto-generated notes; manually edit if needed.

## 8. Post-Release

- [ ] Test install from the release tag on a fresh machine:
  - `npx skills add realsee-developer/skills@vX.Y.Z`
  - Or `/plugin marketplace add realsee-developer/skills` in Claude Code.
- [ ] Update any external pointers (docs sites, share-links, demos) to the new tag.
