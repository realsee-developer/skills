# Troubleshooting

## Missing Credentials

If `REALSEE_APP_KEY` or `REALSEE_APP_SECRET` is missing, set the value in the local environment before running the CLI. Do not place secrets in the repository, README examples, or command history shared in issue reports.

## Missing Region

If `REALSEE_REGION` is missing, set it to the intended supported region before running the workflow. Region selection controls which Realsee service environment the implementation uses.

## Capability Not Enabled

If the Gateway or Argus/VGGT API rejects the request because the capability is unavailable, confirm that the target account or app has Argus/VGGT access enabled. Stable live Gateway usage requires the public Gateway OpenAPI path plus the capability gate.

## Input Validation Failure

Use an absolute path to a readable local JPEG file and pass a supported `--type` value such as `image` or `panorama`. If the file is a panorama, confirm that it matches the expected format before upload.

## No TTY or Missing `--yes`

Real uploads require explicit consent. In interactive terminals the CLI can ask for confirmation; in non-interactive environments, pass `--yes` only after the user has already approved uploading the local file to Realsee remote services.
