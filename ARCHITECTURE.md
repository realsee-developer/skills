# Architecture

[English](ARCHITECTURE.md) | [简体中文](ARCHITECTURE.zh-CN.md)

This document maps the canonical skill source, the generated Claude plugin package, and the three distribution channels (Claude Code, Codex, `npx skills`).

## Source-of-Truth Map

```
.agents/skills/argus/                Canonical skill source. Shape: SKILL.md + one script.
├── SKILL.md                         Frontmatter + the full agent-driven flow (credentials Q&A, dimension precheck, poll, open).
├── README.md / README.zh-CN.md      End-user docs.
├── package.json                     Skill-local Node manifest (dependency: @realsee/universal-uploader).
├── package-lock.json                Pinned dep tree.
├── scripts/run-argus.mjs            The ONLY script. Gateway pipeline (auth → upload → trigger → poll → download).
├── src/                             Runtime modules backing run-argus.mjs (cli, config, gateway, downloader, state, …).
├── test/                            Unit + injectable-fake tests (no live calls).
└── references/                      Public OpenAPI contract + reference docs.

plugins/realsee-skills/              Generated Claude plugin package — DO NOT edit by hand.
├── .claude-plugin/plugin.json       Plugin manifest (no userConfig, no MCP server — credentials resolved at runtime).
├── package.json                     Slimmed plugin-local manifest.
├── skills/argus/                    Copy of source skill (kept in sync by scripts/sync-claude-plugin.mjs).
└── scripts/{validate-plugin,doctor-local-env}.mjs

.claude-plugin/marketplace.json      Marketplace manifest. Points at plugins/realsee-skills.

release-channel.json                 Release state (channel, version, per-skill state, regions).
llms.txt                             Machine-readable repository index.
```

## Skill → Plugin → Distribution Flow

```
                .agents/skills/argus/                  (source of truth)
                            │
              ┌─────────────┼────────────────────┐
              │             │                    │
              ▼             ▼                    ▼
      sync:claude-plugin   npx skills add     install-codex-skills
              │             . --skill argus           │
              ▼                                       ▼
   plugins/realsee-skills/                  $CODEX_HOME/skills/argus
              │                                       │
              ▼                                       │
   /plugin install                                    │
   realsee-skills@                                    │
   realsee-developer-skills                           │
              │                                       │
              └─────────┐                   ┌─────────┘
                        ▼                   ▼
                Claude Code runtime    Codex runtime
                (no install-time configuration — both runtimes
                 receive REALSEE_* via the skill's runtime
                 credential prompt or pre-set shell env)
```

Both runtimes ultimately spawn the same `scripts/run-argus.mjs` against the same `src/cli.mjs`. Credential resolution happens **before** the script runs and is **performed entirely by the agent via Bash**, following SKILL.md "Step 1":

1. Probe shell env (`printenv REALSEE_*`).
2. Source the on-disk credentials file if present: `[ -f ~/.realsee/credentials ] && set -a && . ~/.realsee/credentials && set +a`. The file is a shell-sourceable `KEY=VALUE` fragment with mode 0600.
3. Otherwise, the agent asks the user one field per turn (region → APP_KEY → APP_SECRET → save?).
4. If the user consents to save, the agent writes the file with a Bash heredoc + `chmod 600`.

Direct shell env always wins over the credentials file. No plugin `userConfig`, no MCP bridge, and no helper scripts (check-credentials / save-credentials) are involved — the agent's Bash tool replaces all of that.

## CLI Execution Modes

The runtime entrypoint (`scripts/run-argus.mjs` → `src/cli.mjs`) supports three modes:

| Mode | Flag | Behavior |
| --- | --- | --- |
| Synchronous | _(default)_ | Auth → upload-token → upload → trigger → poll → download → write `result.json`. Blocks for the full duration (minutes). |
| Asynchronous | `--async` | Auth → upload-token → upload → trigger → write `state.json` + spawn detached poller. Returns `{status: in_progress, background_poll_pid}` immediately. |
| Resume | `--resume --workspace <dir>` | Reads `state.json` and continues poll → download → `result.json`. Used by the detached poller and for manual recovery. |

The async pattern is what the Claude Code / Codex hosts should prefer when invoking the skill, so the chat thread is not blocked on Argus inference.

## Build & Validation Pipeline

`npm run ci` (also run by `.github/workflows/ci.yml`) chains:

1. `scan:secrets` — pattern scan for tokens, signed URLs, AWS Authorization headers, Tencent COS tmpSecret keys.
2. `validate:docs` — bilingual docs (English / 简体中文) coverage check.
3. `validate:ai` — assert `llms.txt` includes every required entrypoint string.
4. `validate:repo-boundary` — reject absolute home-directory paths (macOS / Linux), internal hostnames, and other private leakage. See the deny list in `scripts/validate-repo-boundary.mjs`.
5. `validate:skills` — verify each skill under `.agents/skills/` has a coherent SKILL.md / README pair.
6. `rebuild` — regenerate `plugins/realsee-skills/` and assert byte-equality with `.agents/skills/argus/` via `check:claude-sync`.
7. `validate:channel-metadata` — assert `release-channel.json` shape and id consistency.
8. `test:skill` — run all `.agents/skills/argus/test/*.test.mjs` with `node --test`.

The release gate (`scripts/release-gate.mjs`) runs the same chain plus, for the `--channel stable` mode, also validates that `references/argus-gateway-openapi.json` is the public Realsee Argus/VGGT contract and free of internal evidence text.

## Release Channels

`release-channel.json` carries machine-readable state:

- `channel` — `development` while on a feature branch; `preview` / `stable` when a release tag is cut.
- `state` — per-skill maturity. `argus` is `stable` once both global + cn e2e have been verified.
- `stable_gate` — `passed` once `release:gate --channel stable` succeeds.

GitHub workflows wired in:

- `.github/workflows/ci.yml` — runs `npm run ci` on every push to `main` and every PR.
- `.github/workflows/release-gate.yml` — runs the release gate on `main`, `test/**`, `stable/**`, and manual dispatch.
- `.github/workflows/release.yml` — on tag push `v*`, runs the stable gate and creates the GitHub release.
- `.github/workflows/codeql.yml` — weekly + push/PR static security analysis.

## What Not to Edit

- `plugins/realsee-skills/**` — generated. Edit `.agents/skills/argus/` instead and run `npm run rebuild`.
- `node_modules/**`, `workspace/**`, `*.glb`, `.env`, anything matching the `validate-repo-boundary` deny list.
