# Install Guide Overview

[English](install-guides.md) | [简体中文](zh-CN/install-guides.md)

Pick the right install path for your AI host. Every path produces the same skill — `argus` — that turns a local JPEG image or panorama into a Realsee Argus GLB output.

## Recommended Install Entry

For the fastest public install path, start with:

```bash
npx skills add realsee-developer/skills
```

`npx skills` auto-detects every supported host on the machine (Claude Code, Codex) and installs into each one. For per-host pinned installs, follow the table below.

## Host Matrix

| Host | One-line install | Skill handle after install | Detailed guide |
| --- | --- | --- | --- |
| Claude Code | `/plugin marketplace add realsee-developer/skills` then `/plugin install realsee-skills@realsee-developer-skills` | `realsee-skills:argus` (or natural-language prompt) | [docs/claude-plugin.md](claude-plugin.md) |
| Codex | `npx skills add realsee-developer/skills --skill argus --agent codex` | `$argus` in Codex prompts | [docs/codex.md](codex.md) |
| Any detected host | `npx skills add realsee-developer/skills --skill argus --agent '*'` | Per-host handle (above) | This file |

## Recommended Way to Share with an Agent

Each per-host guide works in two modes:

1. Open the guide in a shell and run the commands yourself.
2. Share the GitHub file URL with an AI agent and ask it to install on your machine.

For reproducible installs:

1. Open the guide on a tagged GitHub release such as `v1.0.0`.
2. Copy the GitHub URL of that file.
3. Paste it to the target agent with a request such as:

```text
Open this GitHub guide and follow it on my machine.
Use the tagged revision in the URL, verify the install, and report any missing credentials.
```

## Credentials Required by Every Path

| Key | Sensitive | Purpose |
| --- | --- | --- |
| `REALSEE_APP_KEY` | ✅ | Realsee Open Platform APP_KEY |
| `REALSEE_APP_SECRET` | ✅ | Realsee Open Platform APP_SECRET |
| `REALSEE_REGION` | — | `global` (app-gateway.realsee.ai) or `cn` (app-gateway.realsee.cn) |

Claude Code prompts for these via the plugin config dialog and stores sensitive values in the system keychain. Codex and `npx skills` read them from the user's shell environment (or `.env`).

If you do not have credentials yet, see [SUPPORT.md](../SUPPORT.md) for the registration and capability-request flow.

## After Install

- Direct CLI use (no host required): see the [Use](../README.md#direct-cli-use-no-host-required) section in the root README.
- Async mode (recommended when invoked by a chat host so it does not block on minutes-long Argus inference): pass `--async` and read `<run-dir>/result.json` directly (`cat <run-dir>/result.json`).
- Recovery from a stalled async run: `node .agents/skills/argus/scripts/run-argus.mjs --resume --workspace <run-dir> --json`.
- Open the result once it lands: with user consent, run the OS opener — `open <path-or-url>` on macOS, `xdg-open` on Linux, `start "" <path-or-url>` on Windows. See SKILL.md "Step 5" for the per-platform pattern.
