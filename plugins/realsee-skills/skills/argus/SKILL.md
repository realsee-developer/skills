---
name: argus
description: Generate Realsee Argus GLB output from a local JPEG image (square 1:1) or panorama (equirectangular 2:1) using Realsee Argus/VGGT. Use when the user asks to turn a local JPEG or panorama into a Realsee Argus GLB, or mentions Realsee Argus / VGGT reconstruction.
compatibility: Requires Node.js and network access to app-gateway.realsee.ai or app-gateway.realsee.cn
metadata:
  documentation: README.md
---

# argus

Use this Skill when the user asks to turn a local JPEG image or panorama into Realsee Argus GLB output.

This is a **skill**, not a CLI suite. There is exactly one script — `scripts/run-argus.mjs` — which runs the Realsee Gateway pipeline (auth → upload-token → multipart upload → trigger → poll → download). Everything else (collecting credentials, validating inputs, polling status, opening results) is performed by **you, the agent, via the Bash tool** following the instructions in this file.

`<skillDir>` below refers to the directory containing this `SKILL.md`. From the Bash tool, derive it from the path you used to invoke the script.

---

## Step 1 — Resolve credentials

Argus needs three values in env: `REALSEE_APP_KEY`, `REALSEE_APP_SECRET`, `REALSEE_REGION` (`global` for `app-gateway.realsee.ai`, `cn` for `app-gateway.realsee.cn`).

Resolution order:

**Important: never run a command that prints credential values.** `printenv REALSEE_APP_KEY` *prints the value* — its stdout is captured by the Bash tool and lands in the Claude transcript. To check presence, redirect stdout to `/dev/null` and rely on the exit code, or compare the variable to empty using `[ -n "$VAR" ]`.

1. **Already in shell env?** Probe by exit code only:
   ```bash
   printenv REALSEE_APP_KEY REALSEE_APP_SECRET REALSEE_REGION >/dev/null \
     && echo present || echo missing
   ```
   If the output is `present`, skip to Step 2.

2. **Stored in `~/.realsee/credentials`?** The file is a shell-sourceable env fragment — each line is `KEY=value`. Load and probe in one call:
   ```bash
   [ -f ~/.realsee/credentials ] && set -a && . ~/.realsee/credentials && set +a; \
     [ -n "$REALSEE_APP_KEY" ] && [ -n "$REALSEE_APP_SECRET" ] && [ -n "$REALSEE_REGION" ] \
     && echo present || echo missing
   ```
   If the output is `present`, skip to Step 2.

   **If `.` fails with `command not found:` errors** (e.g. lines like `appKey: ...`), the file is from an older version. Delete it (`rm -f ~/.realsee/credentials`) and fall through to Step 1a — the user will re-enter the values once. We do not maintain a migration path; the format is exclusively `KEY=value`.

3. **Otherwise, collect from the user via one-question-per-turn Q&A.** See Step 1a.

### Step 1a — Q&A flow (one field per turn)

**Hard rules:**

- **One question per turn.** Never write "please send me APP_KEY, APP_SECRET, and region" in a single message. Ask one, wait for the reply, ask the next.
- **Never echo a credential value back.** Once the user provides `APP_KEY`, do not repeat it in any subsequent natural-language reply. Refer to it as "the APP_KEY you provided".
- **Never put credentials on a Bash command line.** Not as `--flag`, not as env-prefix (`REALSEE_APP_KEY=... node ...`). The Bash tool records the full command (including the env-prefix) in the Claude transcript and in the JSONL session file. Credentials in the command line = credentials leaked into permanent logs. The only safe pattern is `set -a; . ~/.realsee/credentials; set +a; node ...` — the values live on disk (mode 0600) and are loaded into the child process's env via `source`, never appearing in the command itself.
- **Trim whitespace.** Paste-from-keyboard often leaves trailing whitespace. Strip it before use.

**Order:**

1. **Region.** On Claude Code, prefer `AskUserQuestion` with two options:
   - `global` — Realsee Open Platform global gateway (`app-gateway.realsee.ai`).
   - `cn` — Realsee Open Platform China gateway (`app-gateway.realsee.cn`).
   
   On other hosts, ask in chat: "Which Realsee region — `global` or `cn`?" Re-ask if the response is not exactly one of the two values.

2. **APP_KEY** (next turn, one sentence):
   > "Please paste your `REALSEE_APP_KEY`."

3. **APP_SECRET** (next turn, one sentence):
   > "Now please paste your `REALSEE_APP_SECRET`."

4. **Save?** On Claude Code, prefer `AskUserQuestion`:
   - `Save (recommended)` — write to `~/.realsee/credentials` (mode 0600), skip the prompt next time.
   - `Use once` — keep in memory for this run only.
   
   On other hosts, ask plain yes/no.

5. **Always save.** Even if the user picked `Use once`, you still need the values on disk briefly so the run command can `source` them — otherwise the only way to pass them to `run-argus.mjs` is via the command line, which leaks them into the Claude transcript. So:

   - User picked `Save (recommended)` → write the file once, leave it there.
   - User picked `Use once` → write the file, run the pipeline, then delete it (`rm -f ~/.realsee/credentials`) once `result.json` shows `success` or `error`.

   Write with a Bash heredoc + `chmod 600`. The heredoc DOES expose the values to the transcript exactly once (unavoidable — they were just typed in chat anyway, so they're already in the transcript). Every subsequent Bash call in this conversation must load via `source`, never re-print the values:
   ```bash
   mkdir -p ~/.realsee
   umask 077
   cat > ~/.realsee/credentials <<'EOF'
   REALSEE_APP_KEY=<value>
   REALSEE_APP_SECRET=<value>
   REALSEE_REGION=<global|cn>
   EOF
   chmod 600 ~/.realsee/credentials
   ```
   Verify with `ls -l ~/.realsee/credentials` — the perms must be `-rw-------`.

---

## Step 2 — Validate the input image

Argus enforces strict aspect ratios:

- **2:1 (±0.05)** → panorama (e.g. `4096×2048`, `8192×4096`). Upload key: `panoImage.jpg`.
- **1:1 (±0.05)** → pinhole image (e.g. `1024×1024`, `2048×2048`). Upload key: `pinholeImage.jpg`.

The script enforces this server-side as a defense-in-depth check, but **you should also pre-check** so the user gets fast feedback. Read the JPEG's dimensions in one Bash call. Cross-platform recipes (pick the first that works on the user's machine):

```bash
# macOS:
sips -g pixelWidth -g pixelHeight "<path>" 2>/dev/null

# ImageMagick (Linux / macOS with Homebrew):
identify -format '%w %h\n' "<path>" 2>/dev/null

# Pure Node fallback (always available):
node -e "
  const fs = require('fs');
  const buf = fs.readFileSync(process.argv[1]);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) { console.error('Not JPEG'); process.exit(1); }
  let off = 2;
  while (off < buf.length) {
    if (buf[off] !== 0xff) break;
    const marker = buf[off + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      console.log(buf.readUInt16BE(off + 7), buf.readUInt16BE(off + 5));
      process.exit(0);
    }
    off += 2 + buf.readUInt16BE(off + 2);
  }
  process.exit(1);
" "<path>"
```

Compute `ratio = width / height`. Then:

- `0.95 ≤ ratio ≤ 1.05` → call it `image`. Continue.
- `1.95 ≤ ratio ≤ 2.05` → call it `panorama`. Continue.
- Anything else → **stop**. Tell the user: "Detected `<W>×<H>` (ratio `<r>`). Argus accepts only 2:1 panoramas or 1:1 pinhole images. Crop or resize and retry." Do not upload.

Tell the user what you detected before uploading — e.g. "Detected as panorama (4096×2048)."

---

## Step 3 — Run

**Do not ask a second confirmation here.** If the user named a specific image path when invoking the skill (e.g. "use argus on /path/to/photo.jpg") **or** answered a file-selection question you asked earlier, that IS the upload consent. Asking "confirm upload?" again is friction without value.

Two cases:

- **User already gave a path.** Proceed directly. After Step 2 detects the type, say one short line: "Detected as `<image|panorama>` (`<W>×<H>`). Uploading to Argus (region `<region>`) now." Then run.
- **User did not give a path.** The selection question is where you obtain consent. Phrase it as one prompt: "Which image should I upload to Realsee Argus to generate a GLB? (The image will leave your machine and be processed by Argus.)" After they reply with a path, run Step 2 then run — no second prompt.

Load credentials from disk and run in **one** Bash call. The credentials never appear in the command line — they live in the env-fragment file (mode 0600), `source` pulls them into the child process's env:

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node <skillDir>/scripts/run-argus.mjs \
  --image "<abs-path>" \
  --type <image|panorama> \
  --workspace "<workspace-parent>" \
  --yes --json --async
```

- `--type` matches what you detected in Step 2.
- `--async` returns immediately; a detached process polls and writes `result.json`. Use `--async` by default so the conversation isn't blocked on Argus inference.
- Drop `--async` for the synchronous variant if you need a single-call result.

**Anti-pattern — do not do this.** The following form leaks `APP_SECRET` into the Claude transcript and the JSONL session log every time it runs:
```bash
# WRONG: env-prefix appears verbatim in the recorded Bash command.
REALSEE_APP_KEY="..." REALSEE_APP_SECRET="..." REALSEE_REGION=... \
  node <skillDir>/scripts/run-argus.mjs ...
```
Always `source` the file first.

**On `Cannot find module '@realsee/universal-uploader'`:** the plugin install dir does not have `node_modules`. Run `npm install --prefix <skillDir>` once, then retry the same command. (Claude Code does not auto-install plugin deps.)

The JSON line on stdout is the in-progress state:

```json
{
  "status": "in_progress",
  "workspace_dir": "...",
  "input_image_id": "...",
  "vggt_type": "pinhole" | "pano",
  "background_poll_pid": 12345,
  ...
}
```

Capture `workspace_dir` — it's the handle for Steps 4 and 5.

---

## Step 4 — Poll until done

A detached process is writing `result.json` under `workspace_dir`. Read it directly:

```bash
cat "<workspace_dir>/result.json" 2>/dev/null || echo '{"status":"in_progress"}'
```

Loop every ~5–10 seconds. Parse the JSON. Stop when `.status` is no longer `"in_progress"`. Argus inference typically takes seconds to a few minutes.

If the detached poller dies (rare), resume from the workspace — same `source`-then-run pattern:

```bash
set -a; . ~/.realsee/credentials; set +a; \
  node <skillDir>/scripts/run-argus.mjs --resume --workspace "<workspace_dir>" --json
```

---

## Step 5 — Report and open the result

When `status === "success"`, the payload has:

- `task_id` — Argus task id.
- `output_glb_path` — absolute path to the downloaded `.glb`.
- `preview_url` — H5 preview URL on `h5.realsee.ai` (global) or `h5.realsee.com` (CN) in the path form `/argus/{image|panorama}/task/{task_id}` (valid 7 days).
- `download.bytes` — file size.
- `elapsed_ms` — total wall time.

Summarise to the user, then ask: **"Open the local GLB / open the H5 preview in your browser / both / neither?"**

On a positive answer, open via the OS opener. Pick by platform — never use a different platform's command:

```bash
case "$(uname -s)" in
  Darwin)            open "<path-or-url>" ;;
  Linux)             xdg-open "<path-or-url>" ;;
  CYGWIN*|MINGW*|MSYS*) start "" "<path-or-url>" ;;
  *)                 echo "Unsupported platform: $(uname -s)" >&2 ;;
esac
```

Open the GLB and/or the preview URL based on the user's choice.

On `status === "error"`: surface `error` from the payload to the user. Offer to retry (run Step 3 again) or escalate.

---

## Other configuration (rarely needed)

- `REALSEE_POLL_INTERVAL_MS` (default 5000) — gateway poll cadence inside `run-argus.mjs`.
- `REALSEE_POLL_MAX_ATTEMPTS` (default 120) — overall poll budget.

Both can also be passed as `--poll-interval-ms` / `--poll-max-attempts` flags.
