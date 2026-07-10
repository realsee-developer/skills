# Argus Gateway Workflow

[English](api-workflow.md) | [简体中文](api-workflow.zh-CN.md)

This document records the public Gateway workflow used by Argus Skill 2.x. The machine-readable contract is [argus-gateway-openapi.json](argus-gateway-openapi.json).

## 1. Preflight and normalization

Before any network request, the Skill:

- resolves `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION`;
- confirms upload consent;
- validates 1–99 JPEG, PNG, or WebP RGB8 panoramas with exact 2:1 dimensions;
- safely expands a supplied ZIP when necessary, then normalizes and repacks all input into one deterministic ZIP;
- records only non-secret input metadata in schema-v2 `state.json`.

The Gateway bases remain:

- `global`: `https://app-gateway.realsee.ai`
- `cn`: `https://app-gateway.realsee.cn`

## 2. Start

`start` performs exactly four remote operations:

1. `POST /auth/access_token`
2. `GET /open/v1/argus/file/token`
3. stream one normalized ZIP to object storage
4. `POST /open/v1/argus/task/submit` with one uploaded object path in `private_cos_keys` and `title`

The upload lease locator is `bucket + region + prefix`. Upload credentials may refresh in memory but must never be written to state. `start` persists the returned `task_code` atomically, then returns immediately.

Task submission is not idempotent and is never retried automatically. If the request may have reached the server but its response is unavailable, the state becomes `submission_unknown`. A caller must not blindly submit again.

## 3. Status

`status` makes one `GET /open/v1/argus/task/info?task_code=...` request and maps the numeric Gateway state as follows:

| Gateway | Local `task_status` |
| --- | --- |
| `0` | `queued` |
| `1` | `processing` |
| `2` | `succeeded` |
| `3` | `failed` |

It does not poll in the background. The agent or caller decides when to invoke it again. Temporary result URLs are used in memory only and are never persisted in `state.json` or `result.json`.

## 4. Collect

`collect` performs one task-info query. For a successful remote task it downloads `output.zip` atomically, checks transfer length and any Gateway-provided size or MD5, validates ZIP CRC and safe extraction limits, retains the original archive, and safely extracts it.

The collector then validates [argus-output.schema.json](argus-output.schema.json), artifact paths and IDs, referenced-file existence, GLB/EXR magic, and success/missing-set consistency. It writes a local `result.json` index containing durable local paths. A completed `collect` is idempotent: repeated calls neither submit another task nor download the output again.

The algorithm manifest's `status` becomes local `result_status` (`success`, `partial`, or `error`). This is distinct from remote `task_status`. `partial` is a successful CLI outcome with an explicit warning and non-empty `missing_ids`; `error` is a non-zero CLI outcome.
