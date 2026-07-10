# Official example panoramas

Argus 2.0 bundles two Realsee first-party panorama sets. They replace the former Wikimedia/third-party open-source examples and are available without downloading anything after the Skill is installed.

## Sets

| Region | Directory | Images | Dimensions |
|---|---|---:|---:|
| CN | `<skillDir>/examples/cn/` | 12 JPEG | 16000×8000 |
| Global | `<skillDir>/examples/global/` | 14 JPEG | 8000×4000 |

All files are RGB, 8-bit, strict 2:1 JPEG panoramas named `panoNN.jpg`. `examples/manifest.json` is the canonical machine-readable inventory and records every public source URL, byte length, and SHA-256 digest. The images are first-party Realsee samples covered by the repository license; they are not CC0 or third-party open-source assets.

Choose the set matching `REALSEE_REGION`. The files are bundled locally, but an Argus run still sends the selected images to Realsee remote services and requires the user's upload consent.

## Run a full set

The following Bash/Zsh example expands the selected directory into repeatable `--image` arguments:

```bash
example_dir="<skillDir>/examples/cn"
image_args=()
for image in "$example_dir"/*.jpg; do
  image_args+=(--image "$image")
done

node <skillDir>/scripts/run-argus.mjs start \
  "${image_args[@]}" \
  --workspace "/absolute/workspace-root" \
  --yes --json
```

Use `examples/global` and `REALSEE_REGION=global` for the Global set. A subset is valid as long as it contains 1–99 images.

Do not use directory enumeration order as an image identity contract. The CLI sorts normalized filenames deterministically, and output consumers must use the algorithm's `name_mapping`.
