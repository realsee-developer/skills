# Claude Code Plugin Install

[English](claude-plugin.md) | [简体中文](zh-CN/claude-plugin.md)

Install the `realsee-skills` plugin (skill: `argus`) into Claude Code in one of three ways.

This file works in two modes:

1. Run the commands yourself in a Claude Code session / shell.
2. Share the GitHub URL with Claude Code and ask it to follow the guide on your machine.

For reproducible installs, share the URL on a tagged release (e.g. `v1.0.0`).

## What Claude Code Installs

- Marketplace name: `realsee-developer-skills`
- Plugin name: `realsee-skills`
- Skill handle: `realsee-skills:argus`
- Plugin source on disk: `~/.claude/plugins/marketplaces/realsee-developer-skills/plugins/realsee-skills`

The plugin ships a single skill and **no install-time configuration**. Credentials are collected interactively the first time the skill runs.

## One-Line Install (from the public marketplace)

In any Claude Code session:

```
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

No configuration dialog appears. The first time you ask the agent to run `argus`, it will prompt you for `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION` (`global` for `app-gateway.realsee.ai` or `cn` for `app-gateway.realsee.cn`), then ask whether to persist them to `~/.realsee/credentials` for future sessions.

## Development Install (from a local clone)

Use this when you want to iterate on the canonical skill source or test an unreleased commit.

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install
npm install --prefix .agents/skills/argus
npm run rebuild
claude --plugin-dir ./plugins/realsee-skills
```

For a pinned revision:

```bash
VERSION=v1.0.0
git clone --branch "$VERSION" --depth 1 https://github.com/realsee-developer/skills.git
cd skills
npm install
npm install --prefix .agents/skills/argus
npm run rebuild
claude --plugin-dir ./plugins/realsee-skills
```

You can pre-set credentials in the shell so the agent skips the prompt:

```bash
export REALSEE_APP_KEY=...
export REALSEE_APP_SECRET=...
export REALSEE_REGION=global   # or cn
claude --plugin-dir ./plugins/realsee-skills
```

## Verify the Install

```bash
claude plugin validate ./plugins/realsee-skills
ls -la ./plugins/realsee-skills/skills/argus
```

Or, after installing from the marketplace, list the plugin from within Claude Code:

```
/plugin list
```

## First Prompts to Try

Skills are picked up by Claude based on the SKILL.md description, so natural-language prompts work:

```
Turn /path/to/photo.jpg into a Realsee Argus GLB (image mode). Use --async and report the workspace dir + task id.
Generate an Argus GLB from /path/to/pano.jpg (panorama). Resume once the background poll finishes.
```

To pin the skill explicitly:

```
Use realsee-skills:argus on /path/to/photo.jpg.
```

## Credential Behavior

- Credentials are resolved at **runtime**, not at install time. The agent follows SKILL.md "Step 1":
  1. Probe shell env (`printenv REALSEE_APP_KEY REALSEE_APP_SECRET REALSEE_REGION`).
  2. If missing, source `~/.realsee/credentials` (a shell-sourceable env fragment): `[ -f ~/.realsee/credentials ] && set -a && . ~/.realsee/credentials && set +a`.
  3. Otherwise, collect from you via one-question-per-turn Q&A (region picker → APP_KEY → APP_SECRET → save?).
- The save step is **opt-in**. With your consent, the agent writes the file via a Bash heredoc + `chmod 600`. Direct shell `export REALSEE_*` always overrides the file.
- Sensitive values never land in `settings.json` or the conversation transcript (SKILL.md instructs the agent to never echo a value back).

## Skill Surface

The plugin ships exactly one script. The agent drives everything else via Bash following SKILL.md:

| Action | How |
| --- | --- |
| Generate (async) | `node <skillDir>/scripts/run-argus.mjs --image <path> --type <image\|panorama> --workspace <dir> --yes --json --async` (with `REALSEE_*` env-prefix) |
| Poll status | `cat <workspace_dir>/result.json` every 5–10 s until `status !== "in_progress"` |
| Resume an interrupted run | `node <skillDir>/scripts/run-argus.mjs --resume --workspace <workspace_dir> --json` |
| Open the result | `open <path-or-url>` (macOS) / `xdg-open` (Linux) / `start "" <path-or-url>` (Windows) |
| Persist credentials | Bash heredoc to `~/.realsee/credentials` with `chmod 600` (after explicit user consent) |
| JPEG aspect ratio precheck | `sips -g pixelWidth -g pixelHeight` (macOS) / `identify -format '%w %h'` (ImageMagick) / pure-node fallback |

The skill's `SKILL.md` instructs the agent to obtain user consent before any upload, before persisting credentials, and before opening the result.

## Manual Recovery Outside Claude Code

If a Claude Code-spawned async run is in progress and you want to check on it from a shell:

```bash
cat <workspace_dir>/result.json
```

If the background poller died, resume it manually:

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node .agents/skills/argus/scripts/run-argus.mjs --resume --workspace <workspace_dir> --json
```

## Open The Result

Once `result.json#status === "success"`, Claude Code should ask the user whether to open the local GLB, the H5 preview URL, or both. With the user's consent:

```bash
case "$(uname -s)" in
  Darwin)               open "<path-or-url>" ;;
  Linux)                xdg-open "<path-or-url>" ;;
  CYGWIN*|MINGW*|MSYS*) start "" "<path-or-url>" ;;
esac
```

Do not open anything until `result.json#status` is `success`.

## Release Policy

- `main` is the integration branch.
- Stable installs should use a Git tag and GitHub Release such as `v1.0.0`.
- `release-channel.json` carries the machine-readable maturity (`state`, `stable_gate`).
