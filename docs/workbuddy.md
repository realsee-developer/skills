# Argus in WorkBuddy

[English](workbuddy.md) | [简体中文](zh-CN/workbuddy.md)

Install and sign in to WorkBuddy from its [official site](https://www.workbuddy.cn/). The commands below use a POSIX shell, as available on macOS. WorkBuddy's [skill guide](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market) covers the app's skills page and local package import.

## Choose the source

For the published stable skill, clone the versioned source:

```bash
git clone --branch v2.3.1 --depth 1 https://github.com/realsee-developer/skills.git
cd skills
```

For local changes, use that checkout's repository root and record its commit and intended modifications. The new `check-local.mjs` and `inspect-result.mjs` tools are **not in the published `v2.3.1` tag**; use a checkout containing them or follow the older installed `SKILL.md`.

## Install the complete directory

WorkBuddy loads user skills from `~/.workbuddy/skills/`. Use directory installation rather than assuming an `npx skills` WorkBuddy agent flag exists.

From the selected repository root, run:

```bash
(
  set -eu
  argus_target="$HOME/.workbuddy/skills/argus"
  test -f .agents/skills/argus/SKILL.md
  if [ -e "$argus_target" ] || [ -L "$argus_target" ]; then
    echo "Argus is already installed. Follow the update steps below."
    exit 1
  fi
  mkdir -p "$HOME/.workbuddy/skills"
  cp -R .agents/skills/argus "$argus_target"
  cd "$argus_target"
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund
)
```

Copy the whole directory, including runtime code, lockfile, references, and license; `SKILL.md` alone cannot run Argus.

For an update, first move the existing Argus directory to a backup **outside** the skills directory:

```bash
mkdir -p "$HOME/.workbuddy/skill-backups"
argus_backup_dir="$(mktemp -d "$HOME/.workbuddy/skill-backups/argus.XXXXXX")"
mv "$HOME/.workbuddy/skills/argus" "$argus_backup_dir/argus"
```

Repeat the installation block from the desired checkout. Keep the backup until local checks pass; restore it if installation fails.

## Confirm discovery and local prerequisites

Open **Experts · Skills · Connectors → Skills → Installed**, confirm `argus` is enabled, then start a new task to load its current instructions.

For a checkout containing the local-check tool, ask WorkBuddy to run it in its own shell:

```bash
node "$HOME/.workbuddy/skills/argus/scripts/check-local.mjs" --json
```

Follow the installed [SKILL.md](../.agents/skills/argus/SKILL.md#1-ensure-runtime-dependencies) to resolve any missing prerequisites. Configure credentials locally, without pasting values into the conversation.

## Run the task you requested

Invoke `argus` by name, or select it from the `/` skill picker. For a complete official-example run, a request can be:

> Use Argus to download the official examples for my configured region and verify their checksums. I authorize uploading that example set to Realsee. Run one complete reconstruction, query its status until terminal, collect the results, and report the outcome. Keep inputs and results in a new workspace outside the skill directory.

Keep the returned `workspace_dir` for continuing or reviewing the task. The installed [SKILL.md](../.agents/skills/argus/SKILL.md) defines consent, complete versus single-step execution, interrupted-task recovery, and [offline verification and delivery](../.agents/skills/argus/SKILL.md#7-verify-and-report-the-collected-result).
