# argus

![Skill argus](https://img.shields.io/badge/skill-realsee--argus-6f42c1?style=flat-square)
![Live tested](https://img.shields.io/badge/live-tested-2ea44f?style=flat-square)
![Upload consent](https://img.shields.io/badge/upload-consent%20required-brown?style=flat-square)

[English](README.md) | [简体中文](README.zh-CN.md)

`argus` is a local Skill package for generating Realsee Argus GLB output from a local JPEG image or panorama.

## Install and Use

Install dependencies from this package directory when dependencies are added:

```bash
npm install
```

Synchronous invocation (blocks until the GLB is downloaded; Argus inference can take several minutes):

```bash
node scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json
```

Asynchronous invocation (returns immediately with `status: in_progress`; a detached process polls + downloads and writes `state.json` + `result.json` under the workspace):

```bash
node scripts/run-argus.mjs --image /absolute/path/input.jpg --workspace ./workspace --yes --json --async
```

Resume or recover an async run from its workspace directory:

```bash
node scripts/run-argus.mjs --resume --workspace ./workspace/<run-dir> --json
```

Input type is auto-detected from the JPEG dimensions and strictly enforced:

- **2:1 (±0.05)** → panorama (e.g. 4096×2048).
- **1:1 (±0.05)** → pinhole image (e.g. 1024×1024).
- Anything else is rejected with `Unsupported aspect ratio` before any remote upload.

`--type panorama` / `--type image` may be passed to override auto-detection, but the override is still validated against the file's dimensions.

## Open The Result

After `cat ./workspace/<run-dir>/result.json` reports `"status": "success"`, ask the user which preview path they want and invoke the OS opener directly:

```bash
case "$(uname -s)" in
  Darwin)               open "<path-or-url>" ;;
  Linux)                xdg-open "<path-or-url>" ;;
  CYGWIN*|MINGW*|MSYS*) start "" "<path-or-url>" ;;
esac
```

Open the GLB (`<run-dir>/<task_id>.glb`) and/or the `preview_url` from `result.json` depending on the user's choice. Do not open anything until `status === "success"`.

## Configuration

Configuration is read from environment variables only:

- `REALSEE_APP_KEY`
- `REALSEE_APP_SECRET`
- `REALSEE_REGION`
- `REALSEE_POLL_INTERVAL_MS`
- `REALSEE_POLL_MAX_ATTEMPTS`

Do not commit real secrets, account identifiers, internal URLs, or generated credentials.

## Upload Consent

Real Argus generation uploads the selected local image file to Realsee remote services. Before running any command that performs a real upload, confirm that the user understands and consents to that upload.

## Output Handling

Store durable output artifacts locally when the workflow provides them. Do not treat generated remote links as permanent records.

## Gateway Status

The public Gateway request boundary is recorded in `references/argus-gateway-openapi.json`. Stable live usage still requires the target account or app to have the required Argus/VGGT capability enabled.
