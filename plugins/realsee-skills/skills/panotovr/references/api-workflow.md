# Realsee API Workflow

[English](api-workflow.md) | [简体中文](api-workflow.zh-CN.md)

The bundled runtime preserves the production OpenAPI orchestration shape:

1. Load credentials and resolve `REALSEE_REGION`.
2. `POST /auth/access_token`
3. `GET /open/v1/pano/file/token`
4. Upload the generated ZIP with `@realsee/universal-uploader`
5. `POST /open/v1/pano/task/submit`
6. Poll `GET /open/v1/pano/task/status`
7. Return `task_code`, `project_id`, and `vr_url`

## Production behaviors

- Log progress to `stderr`
- Keep structured JSON output on `stdout` when `--json` is set
- Mask secrets and tokens in logs
- Refresh access tokens automatically during long polls
- Keep each task in its own workspace directory
- Support `--task-code` to resume polling without rebuilding or re-uploading
- Preserve the documented `result.json` contract even when the workflow fails

See the bundled [source API contract](pano-to-vr.openapi.json). Workspace state can contain temporary upload URLs; keep it private. A polling timeout is not proof of remote failure.
