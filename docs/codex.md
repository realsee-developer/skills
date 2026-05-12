# Codex Install

[English](codex.md) | [简体中文](zh-CN/codex.md)

Install the `argus` skill into Codex so it can be referenced from any Codex prompt.

This file works in two modes:

1. Run the commands yourself in a shell.
2. Share the GitHub URL with Codex and ask it to follow the guide on your machine.

For reproducible installs, share the URL on a tagged release (e.g. `v1.0.0`).

## What Codex Installs

Codex discovers the canonical skill through a directory under `$CODEX_HOME`:

- source: `.agents/skills/argus`
- target: `${CODEX_HOME:-$HOME/.codex}/skills/argus`

Symlinked when installed from a local clone (source edits flow through automatically); copied when installed via `npx skills add ... --agent codex`.

## One-Line Install (public)

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
```

Pin to a release tag:

```bash
npx skills add realsee-developer/skills@v1.0.0 --skill argus --agent codex
```

## Local-Clone Install

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install
npm install --prefix .agents/skills/argus
CODEX_HOME=$HOME/.codex npm run install:codex-skills
```

For a pinned revision:

```bash
VERSION=v1.0.0
git clone --branch "$VERSION" --depth 1 https://github.com/realsee-developer/skills.git
cd skills
npm install
npm install --prefix .agents/skills/argus
CODEX_HOME=$HOME/.codex npm run install:codex-skills
```

## Verify the Install

```bash
ls -la "${CODEX_HOME:-$HOME/.codex}/skills/argus"
cat "${CODEX_HOME:-$HOME/.codex}/skills/argus/SKILL.md" | head
```

Optional broader environment check:

```bash
npm run doctor
```

## Credentials

The skill resolves credentials at runtime via the following precedence (agent-driven through Bash, no helper script):

1. `REALSEE_*` environment variables set in the current shell.
2. `~/.realsee/credentials` — a shell-sourceable env fragment. The agent loads it with `[ -f ~/.realsee/credentials ] && set -a && . ~/.realsee/credentials && set +a`.
3. Interactive Q&A in the Codex session — one field per turn (see SKILL.md "Step 1a").

To skip the prompt entirely, export the values before launching Codex:

```bash
export REALSEE_APP_KEY=...
export REALSEE_APP_SECRET=...
export REALSEE_REGION=global   # or cn
```

To persist them across sessions, the agent (with your explicit consent) writes the file via a Bash heredoc:

```bash
mkdir -p ~/.realsee
umask 077
cat > ~/.realsee/credentials <<'EOF'
REALSEE_APP_KEY=...
REALSEE_APP_SECRET=...
REALSEE_REGION=global
EOF
chmod 600 ~/.realsee/credentials
```

## First Prompts to Try

```text
Use $argus on /path/to/photo.jpg (image mode) and report the GLB path. Use --async and tell me the workspace dir.
Use $argus on /path/to/pano.jpg (panorama). Resume once the background poll finishes.
```

## Manual Recovery

Check on an async run from a shell — just read the workspace's `result.json`:

```bash
cat <workspace_dir>/result.json
```

Resume a stalled run — `source` the credentials file so secrets never appear in the command line:

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/run-argus.mjs" \
  --resume --workspace <workspace_dir> --json
```

## Open The Result

Once `result.json#status` is `success`, Codex should ask the user whether to open the local GLB, the H5 preview, or both. With user consent, invoke the OS opener directly:

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
