# Argus API Workflow

This document records the public Realsee Argus/VGGT Gateway workflow used by this skill.

The machine-readable OpenAPI document is `argus-gateway-openapi.json`; TypeScript declarations for the public contract are in `src/gateway-openapi-types.d.ts`.

## 1. Preflight

Validate the local input before contacting remote services:

- The image path is absolute and points to an existing readable file.
- The input type is supported, such as `image` or `panorama`.
- Required environment variables are present: `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, and `REALSEE_REGION`.
- The user has consented to uploading the local file to Realsee remote services.
- The target app or account has the required Argus/VGGT capability enabled.

## 2. Access Token and Upload Token

Use the Gateway authentication and upload-token endpoints:

- `POST /auth/access_token`
- `POST /open/saas/v1/vggt/upload/token`

The access-token request is form encoded and returns `data.access_token`. The `Authorization` header for later Gateway requests is the raw token value. Do not hard-code credentials.

## 3. Upload

Upload the validated JPEG input using the returned uploader token and retain `input_image_id` for the Argus job trigger.

## 4. Trigger and Poll

Trigger Argus/VGGT generation with `POST /open/saas/v1/vggt/trigger`, then poll `GET /open/saas/v1/vggt/poll` until the job succeeds, fails, or reaches `REALSEE_POLL_MAX_ATTEMPTS`. Use `REALSEE_POLL_INTERVAL_MS` for the polling interval.

## 5. Download

When generation succeeds, use `result_url` as the GLB download URL. The URL comes from Realsee Gateway/API output and is treated as trusted; the downloader follows redirects and only enforces download robustness checks such as non-empty response, GLB magic, size limit, and atomic write.

## 6. Preview URL

Construct the H5 preview URL from `alg_task_id` and UI preview type. Both global and CN H5 use the path form `/argus/{image|panorama}/task/{alg_task_id}` (CN: `https://h5.realsee.cn`, global: `https://h5.realsee.ai`). The legacy CN query form `/argus?algTaskId=...&type=...` is still 301-redirected by the server for backwards compatibility with older share links — do not emit it from new code.
