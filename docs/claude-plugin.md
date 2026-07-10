# Claude Code Plugin Install

[English](claude-plugin.md) | [简体中文](zh-CN/claude-plugin.md)

Install the `realsee-skills` plugin from a Claude Code session:

```text
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

The plugin exposes `realsee-skills:argus` and has no install-time configuration or MCP server. The Skill resolves credentials at runtime.

## Development install

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install
npm install --prefix .agents/skills/argus
npm run rebuild
claude --plugin-dir ./plugins/realsee-skills
```

Verify the generated package:

```bash
node plugins/realsee-skills/scripts/validate-plugin.mjs
npm run check:claude-sync
```

## Credentials

The existing runtime precedence remains:

1. inherited `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION`;
2. an existing `~/.realsee/credentials` loaded by the agent;
3. one-field-per-turn collection in chat.

The agent must never echo values or place them in recorded command arguments. Credentials, upload tokens, presigned URLs, and raw provider errors are not persisted in run state.

## Prompt examples

Natural language is sufficient:

```text
Process /path/a.jpg and /path/b.webp with Argus. Start the task and report the run workspace.
Check Argus status once for /workspace/<run-dir>.
Collect /workspace/<run-dir> and list the GLB, EXR depth maps, poses, intrinsics, and missing IDs.
```

Or name the Skill explicitly:

```text
Use realsee-skills:argus on /path/input.zip.
```

## Skill surface

| Action | Command |
| --- | --- |
| Start images | `node <skillDir>/scripts/run-argus.mjs start --image <path>... --workspace <root> --yes --json` |
| Start ZIP | `node <skillDir>/scripts/run-argus.mjs start --zip <path> --workspace <root> --yes --json` |
| Query once | `node <skillDir>/scripts/run-argus.mjs status --workspace <run-dir> --json` |
| Collect terminal result | `node <skillDir>/scripts/run-argus.mjs collect --workspace <run-dir> --json` |

There is no detached poller, `--async`, or `--resume`. The agent controls when to make another status query. A completed collect is idempotent.

The agent must obtain upload consent before start. For `result_status: partial`, it must show a prominent warning and all `missing_ids`, even though the CLI exits 0.

## Release policy

Stable 2.0 installs use `v2.0.0` only after global and CN E2E pass. Users who require the 1.x square or single-GLB workflow pin `v1.0.2`.
