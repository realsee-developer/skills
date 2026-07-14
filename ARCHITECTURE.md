# Architecture

[English](ARCHITECTURE.md) | [简体中文](ARCHITECTURE.zh-CN.md)

Argus Skill 2.0 has one canonical source, an explicit persisted lifecycle, and generated packages for each supported agent host.

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
                         .agents/skills/argus
                           canonical source
                 ┌──────────────┼──────────────┐
                 │              │              │
                 ▼              ▼              ▼
        Claude plugin copy   Codex / npx    Arkclaw copy
        byte-identical       direct source  canonical bytes +
                                           CN-only overlays
```

`npm run rebuild` regenerates Claude and Arkclaw packages and checks them against canonical bytes. Deterministic Arkclaw overlays force `REALSEE_REGION=cn` in `scripts/run-argus.mjs`, restrict `scripts/download-examples.mjs` to CN, and make the generated Skill, README, and example guides state the same limitation. All remaining files must match canonical source byte-for-byte.

## Validation and release

`npm run ci` runs secret scanning, bilingual-doc checks, AI-index checks, repository-boundary checks, Skill validation, distribution regeneration and consistency checks, release metadata validation, and the full Skill test suite.

Version `v1.0.2` remains the frozen legacy line. Version 2.0 follows this promotion order: publish uploader 0.1.1, cut `v2.0.0-rc.3`, complete real CN and global E2E (including partial/error collection), then mark `v2.0.0` stable. Until both regions pass, release metadata remains preview/development with a pending stable gate.

## Generated files

Do not edit `plugins/realsee-skills/**` or `arkclaw/argus/**` by hand. Edit `.agents/skills/argus/**` and the narrow Arkclaw overlay generator, then run `npm run rebuild`.
