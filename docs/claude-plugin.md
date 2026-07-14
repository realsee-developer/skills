# Claude Code Plugin Install

[English](claude-plugin.md) | [简体中文](zh-CN/claude-plugin.md)

Install the `realsee-skills` plugin from a Claude Code session:

```text
/plugin marketplace add realsee-developer/skills
/plugin install realsee-skills@realsee-developer-skills
```

The plugin exposes `realsee-skills:argus` and has no install-time configuration or MCP server. The Skill resolves credentials at runtime.

Official context is available at [Argus](https://argus.realsee.ai/), the [interactive demo](https://h5.realsee.ai/argus), the [research site](https://argus-paper.realsee.ai/), and the [Realsee Developer Platform](https://developer.realsee.ai/). The agent must not infer broader photo support from those pages: this Skill 2.0 accepts only 1–99 local RGB8 panoramas with exact 2:1 dimensions.

It carries `examples/manifest.json`, but no panorama JPEGs. To use official samples, choose the region matching `REALSEE_REGION` and a new absolute directory outside the installed Skill, then run `node <skillDir>/scripts/download-examples.mjs --region <cn|global> --output <absolute-dir>`. The command verifies each manifest byte length and SHA-256 before publishing the directory. Running the downloaded files still requires separate upload consent and uses the corresponding regional Gateway.

## Development install

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
npm install
(cd .agents/skills/argus && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
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
Download and verify the global example set to /absolute/examples, then obtain upload consent and process it with Argus.
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
| Download official examples | `node <skillDir>/scripts/download-examples.mjs --region <cn\|global> --output <absolute-dir>` |
| Start images | `node <skillDir>/scripts/run-argus.mjs start --image <path>... --workspace <root> --yes --json` |
| Start ZIP | `node <skillDir>/scripts/run-argus.mjs start --zip <path> --workspace <root> --yes --json` |
| Query once | `node <skillDir>/scripts/run-argus.mjs status --workspace <run-dir> --json` |
| Collect terminal result | `node <skillDir>/scripts/run-argus.mjs collect --workspace <run-dir> --json` |

There is no detached poller, `--async`, or `--resume`. The agent controls when to make another status query. A completed collect is idempotent.

The agent must obtain upload consent before start. For `result_status: partial`, it must show a prominent warning and all `missing_ids`, even though the CLI exits 0.

## Release policy

Stable 2.0 installs use `v2.0.0` only after global and CN E2E pass. Users who require the 1.x square or single-GLB workflow pin `v1.0.2`.
