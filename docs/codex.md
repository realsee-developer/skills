# Codex Install

[English](codex.md) | [简体中文](zh-CN/codex.md)

Install either or both skills into Codex as needed:

```bash
npx skills add realsee-developer/skills@v2.1.0 --skill argus --agent codex
npx skills add realsee-developer/skills@v2.1.0 --skill realsee-blender-reconstruction --agent codex
```

`$argus` runs remote panorama processing; `$realsee-blender-reconstruction` builds editable scenes from existing local inputs. Blender requires a working local Blender installation and no Argus credentials; see [installation requirements](install-guides.md).

For product context, see [Argus](https://argus.realsee.ai/), its [interactive demo](https://h5.realsee.ai/argus), [research site](https://argus-paper.realsee.ai/), and the [Realsee Developer Platform](https://developer.realsee.ai/). Codex must follow the installed Skill contract rather than infer broader capabilities from those pages: Skill 2.0 accepts only 1–99 local RGB8 panoramas with exact 2:1 dimensions.

The commands above pin stable `v2.1.0`. Use `@v1.0.2` instead only for legacy square 1:1 or single-GLB behavior.

## Local checkout

```bash
git clone https://github.com/realsee-developer/skills.git
cd skills
(cd .agents/skills/argus && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
CODEX_HOME=$HOME/.codex npm run install:codex-skills
npx skills add . --skill realsee-blender-reconstruction --agent codex
```

`npm run install:codex-skills` installs only Argus, replacing its target directory and installing locked dependencies; install Blender separately with the `npx skills` command above.

Codex discovers the Skill at `${CODEX_HOME:-$HOME/.codex}/skills/argus`. Verify:

```bash
ls -la "${CODEX_HOME:-$HOME/.codex}/skills/argus"
head "${CODEX_HOME:-$HOME/.codex}/skills/argus/SKILL.md"
```

The install includes `examples/manifest.json`, but no panorama JPEGs. To use official samples, Codex should ask for the region and a new absolute output directory outside the installed Skill, then run `node <skillDir>/scripts/download-examples.mjs --region <cn|global> --output <absolute-dir>`. The command verifies every manifest byte length and SHA-256 before publishing the directory. A later Argus run still requires separate upload consent and uses the corresponding regional Gateway.

## Credentials and consent

Only Argus needs credentials. Follow the [usage guide](usage.md#credentials-and-upload-consent) to check environment variables, load an existing credential file, and configure missing values through a local shell or secure interface. Persist app credentials outside the repository with mode 0600 only when explicitly authorized; never persist upload tokens or signed URLs. File selection is not upload consent; reuse consent for the same input and scope.

## Prompt examples

```text
Use $realsee-blender-reconstruction with data/ to reconstruct an editable space and save output/reconstruction_native.blend.
Use $argus to start a batch from /path/a.jpg and /path/b.webp. Report the run workspace.
Use $argus to download and verify the CN examples to /absolute/examples, then ask for upload consent before starting them.
Use $argus to check the status of /workspace/<run-dir> once.
Use $argus to collect /workspace/<run-dir>, then report result_status, missing_ids, and local artifacts.
```

Codex should invoke the explicit lifecycle:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/download-examples.mjs" \
  --region cn --output /absolute/examples

node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/run-argus.mjs" start \
  --image /absolute/a.jpg --image /absolute/b.webp \
  --workspace /absolute/workspace --yes --json

node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/run-argus.mjs" status \
  --workspace /absolute/workspace/<run-dir> --json

node "${CODEX_HOME:-$HOME/.codex}/skills/argus/scripts/run-argus.mjs" collect \
  --workspace /absolute/workspace/<run-dir> --json
```

There is no detached poller or resume flag. A completed collect is idempotent. Codex must highlight `partial` and its non-empty `missing_ids`, even though that command exits 0.

## Release policy

`main` is the integration branch. `release-channel.json` defines the current channel; see the [release guide](release.md) for gates. `v2.1.0` includes both skills; the older `v2.0.0` tag contains only Argus. Pin `v1.0.2` for the legacy square or single-GLB workflow.
