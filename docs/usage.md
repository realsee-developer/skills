# Usage Guide

[English](usage.md) | [简体中文](zh-CN/usage.md)

This repository provides installable Realsee skills for agent runtimes.

## Install

Install with the open agent skills CLI:

```bash
npx skills add realsee-developer/skills --skill argus
```

Install for Claude Code:

```bash
npx skills add realsee-developer/skills --skill argus --agent claude-code
```

Install for Codex:

```bash
npx skills add realsee-developer/skills --skill argus --agent codex
```

Install for all detected agents:

```bash
npx skills add realsee-developer/skills --skill argus --agent '*'
```

Install from a local checkout:

```bash
npx skills add . --skill argus
```

## Use `argus`

Synchronous invocation (blocks until the GLB is downloaded; Argus inference can take several minutes):

```bash
node .agents/skills/argus/scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json
```

Asynchronous invocation (returns immediately; detached process polls + downloads):

```bash
node .agents/skills/argus/scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json --async
```

Resume or recover an async run from its workspace directory:

```bash
node .agents/skills/argus/scripts/run-argus.mjs --resume --workspace ./workspace/<run-dir> --json
```

Input type is auto-detected from the JPEG dimensions and strictly enforced: 2:1 (±0.05) → panorama, 1:1 (±0.05) → pinhole image, anything else is rejected before upload. `--type panorama` / `--type image` may be passed to override auto-detection, but the override is still validated against the file's dimensions.

## Skill Files

- Runtime definition: [SKILL.md](../.agents/skills/argus/SKILL.md)
- Skill README: [README.md](../.agents/skills/argus/README.md)
- OpenAPI contract: [argus-gateway-openapi.json](../.agents/skills/argus/references/argus-gateway-openapi.json)
- Machine-readable index: [llms.txt](../llms.txt)

## Upload Safety

Real Argus runs upload the selected local image to Realsee remote services. Confirm user consent before any upload.
