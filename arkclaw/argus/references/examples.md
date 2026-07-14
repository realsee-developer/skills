# Official example panoramas

Argus 2.0 provides a machine-readable inventory of two Realsee first-party panorama sets at `examples/manifest.json`. The current release tree and every generated Skill distribution contain the manifest only; they do not bundle the panorama JPEGs.

## Sets

| Region | Images | Dimensions | Manifest source |
|---|---:|---:|---|
| CN | 12 JPEG | 16000×8000 | `sets.cn.files` |
| Global | 14 JPEG | 8000×4000 | `sets.global.files` |

Every manifest entry has a deterministic `panoNN.jpg` name, public `source_url`, exact `bytes`, and SHA-256 digest. The images are first-party Realsee samples covered by the repository license; they are not CC0 or third-party open-source assets.

## Download a set

Choose the region matching `REALSEE_REGION` and a new absolute output directory outside `<skillDir>`. The output path must not already exist. Treat that path and its parent as owned by the command until it exits; do not create, rename, or replace them concurrently:

```bash
node <skillDir>/scripts/download-examples.mjs \
  --region cn \
  --output "/absolute/example-output"
```

The command reads `examples/manifest.json`, downloads each `source_url` in manifest order, verifies the response byte length and SHA-256, and uses temporary files. Only after the entire set passes does it recheck that the requested output is absent and publish the complete staging directory with one atomic rename. On failure, it removes its staging data and does not publish an unverified set. The CN-only Arkclaw distribution accepts only `--region cn`.

Tests use an in-process local HTTP server; normal CI does not contact these CDN URLs.

## Run downloaded examples

Downloading examples is not consent to upload them to Argus. After the user selects the downloaded files and consents to the remote upload, expand the directory into repeatable `--image` arguments:

```bash
example_dir="/absolute/example-output"
image_args=()
for image in "$example_dir"/*.jpg; do
  image_args+=(--image "$image")
done

node <skillDir>/scripts/run-argus.mjs start \
  "${image_args[@]}" \
  --workspace "/absolute/workspace-root" \
  --yes --json
```

This CN-only Arkclaw distribution cannot download the Global set; use a canonical, Claude, Codex, or `npx skills` installation for `--region global`. A subset is valid as long as it contains 1–99 images. Do not use directory enumeration order as an image identity contract: the CLI sorts normalized filenames deterministically, and output consumers must use the algorithm's `name_mapping`.
