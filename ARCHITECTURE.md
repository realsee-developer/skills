# Architecture

[English](ARCHITECTURE.md) | [简体中文](ARCHITECTURE.zh-CN.md)

Realsee Skills keeps canonical skill sources under `.agents/skills/` and generates host-specific distribution packages. Argus provides a Node.js remote-processing runtime; Blender reconstruction is a local instruction skill.

The additional instruction skill `.agents/skills/realsee-blender-reconstruction/` handles existing exports in local Blender. Claude packaging discovers canonical skill directories and checks byte consistency for all of them; it does not require an npm runtime for instruction-only skills. The Argus lifecycle and Arkclaw overlays below remain Argus-specific.

## Source-of-truth map

```text
.agents/skills/argus/                 Canonical Skill source
├── SKILL.md                          Agent-facing lifecycle and safety rules
├── README.md / README.zh-CN.md       User documentation
├── package.json / package-lock.json  Node runtime and pinned dependencies
├── scripts/run-argus.mjs             Public CLI entrypoint
├── src/                              Runtime implementation
├── test/                             Contract, input, lifecycle, artifact tests
└── references/
    ├── argus-gateway-openapi.json    Four-path public Gateway contract
    ├── algorithm-io*.md              Bilingual algorithm I/O contract
    ├── argus-output.schema.json      JSON Schema 2020-12 output union
    └── migration-v2*.md              Bilingual 1.x migration guide

.agents/skills/realsee-blender-reconstruction/  Canonical local modeling instructions
├── SKILL.md / SKILL.zh-CN.md         Agent workflow
├── README.md / README.zh-CN.md       User documentation
└── references/                      Registration, modeling, performance, acceptance, extensions

plugins/realsee-skills/               Generated Claude plugin copy
arkclaw/argus/                        Generated Arkclaw copy with deterministic CN-only overlays
release-channel.json                  Release maturity and version metadata
llms.txt                              Machine-readable repository index
```

## Deep runtime module

The runtime exposes only three lifecycle operations:

```text
start   -> validate -> normalize ZIP -> upload -> submit -> persist task_code
status  -> load state -> query once -> map task_status -> persist
collect -> query once -> atomic download -> validate/extract -> write result index
```

The lifecycle module owns invariants, atomic workspace state, idempotence, and error classification. External details are behind two injected ports:

- `ArgusTaskPort`: Gateway authentication, upload-token lease, task submission, and task-info query.
- `ObjectTransferPort`: streaming object upload and atomic result download.

Production adapters implement Gateway plus AWS Node or Tencent COS Node. Tests use fakes at the port boundary; lifecycle tests do not require cloud SDKs or live services.

## Input boundary

Both `--image` and `--zip` converge on the same normalized-input pipeline. A supplied ZIP is never trusted or uploaded verbatim. The pipeline safely expands root entries, validates 1–99 JPEG/PNG/WebP RGB8 panoramas with exact 2:1 dimensions, normalizes names to UTF-8 NFC, rejects stem/case-fold collisions, sorts by NFC UTF-8 bytes, and writes one deterministic streaming ZIP.

Product capacity remains Gateway-controlled. Local controls are structural and resource-based: entry count, safe paths, actual expanded bytes, compression behavior, and disk free-space checks.

## Persisted lifecycle

Schema-v2 `state.json` is the durable source of truth for a run. It records region, phase, sanitized input summary, upload receipt, and `task_code`. It never records APP credentials, temporary upload credentials, access tokens, presigned URLs, or raw provider errors.

Task submission has no automatic retry. When a response may have been lost after the server accepted a request, the phase becomes `submission_unknown` so another process cannot blindly create a duplicate task.

`status` performs one query. There is no detached child process and no hidden polling. Multiple processes may inspect the same run, while collection uses a lock/atomic transition so only one process downloads and finalizes.

## Artifact boundary

`collect` retains the original `output.zip` and extracts into a temporary directory before an atomic finalize. It checks HTTP transfer length, optional Gateway size/MD5, ZIP CRC, safe paths, extraction limits, [the output schema](.agents/skills/argus/references/argus-output.schema.json), referenced files, successful/missing ID sets, and GLB/EXR magic.

Local `result.json` deliberately separates:

- `task_status`: `queued`, `processing`, `succeeded`, or `failed`;
- `result_status`: `success`, `partial`, or `error`.

A partial result is usable and exits 0, but always includes a warning and non-empty `missing_ids`. An error exits non-zero.

## Gateway boundary

The Gateway base and credential/region contract are unchanged. Only the Argus interface changed:

- `POST /auth/access_token`
- `GET /open/v1/argus/file/token`
- `POST /open/v1/argus/task/submit`
- `GET /open/v1/argus/task/info`

The file-token response is an in-memory upload lease. `bucket + region + prefix` is the lease locator. A credential refresh may continue an upload only while that locator is unchanged.

## Distribution flow

```text
.agents/skills/argus/                         -> Claude plugin / npx skills / Codex installer
                                             -> Arkclaw (CN-only overlays)
.agents/skills/realsee-blender-reconstruction/ -> Claude plugin / npx skills
```

`npm run rebuild` regenerates Claude and Arkclaw packages and checks them against canonical bytes. Deterministic Arkclaw overlays force `REALSEE_REGION=cn` in `scripts/run-argus.mjs`, restrict `scripts/download-examples.mjs` to CN, and make the generated Skill, README, and example guides state the same limitation. All remaining files must match canonical source byte-for-byte.

## Validation and release

`npm run ci` runs secret scanning, bilingual-doc checks, AI-index checks, repository-boundary checks, Skill validation, distribution regeneration and consistency checks, release metadata validation, repository tests (`test:repo`), and Argus runtime tests (`test:skill`). These checks validate packaging and contracts; they do not execute a Blender reconstruction or a live Argus task.

`release-channel.json` currently records Argus 2.2.0 as stable with a passed stable gate. It records Argus release readiness, not Blender acceptance. `v1.0.2` remains the frozen legacy line; `v2.2.0` packages both skills, while the `v2.0.0` tag contains Argus only. See the [release guide](docs/release.md) for current gate requirements and the historical 2.0 promotion sequence.

## Generated files

Do not edit `plugins/realsee-skills/**` or `arkclaw/argus/**` by hand. Edit the relevant source under `.agents/skills/**`; change the Arkclaw overlay generator only for Argus-specific distribution differences. Then run `npm run rebuild`.
