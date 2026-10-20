const FLAGS_WITH_VALUES = new Set([
  'manifest',
  'images-dir',
  'workspace',
  'project-name',
  'task-code',
  'poll-interval-ms',
  'poll-max-attempts',
])

const BOOLEAN_FLAGS = new Set([
  'json',
  'help',
])

const ALLOWED_FLAGS = new Set([
  ...FLAGS_WITH_VALUES,
  ...BOOLEAN_FLAGS,
])

function splitFlagToken(token) {
  const stripped = token.slice(2)
  const separatorIndex = stripped.indexOf('=')
  if (separatorIndex === -1) {
    return { key: stripped, inlineValue: undefined }
  }
  return {
    key: stripped.slice(0, separatorIndex),
    inlineValue: stripped.slice(separatorIndex + 1),
  }
}

export function parseArgs(argv) {
  const args = {}

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token.startsWith('-') && !token.startsWith('--')) {
      throw new Error(`Unknown argument: ${token}. Only long-form flags are supported.`)
    }
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${token}`)
    }

    const { key, inlineValue } = splitFlagToken(token)
    if (!ALLOWED_FLAGS.has(key)) {
      throw new Error(`Unknown argument: --${key}`)
    }

    if (inlineValue !== undefined) {
      if (BOOLEAN_FLAGS.has(key)) {
        throw new Error(`\`--${key}\` does not take a value.`)
      }
      args[key] = inlineValue
      continue
    }

    if (BOOLEAN_FLAGS.has(key)) {
      args[key] = true
      continue
    }

    const next = argv[i + 1]
    if (!next || next.startsWith('-')) {
      args[key] = true
      continue
    }

    args[key] = next
    i += 1
  }

  return args
}

function assertFlagRequiresValue(args, flag) {
  if (args[flag] === true) {
    throw new Error(`\`--${flag}\` requires a value.`)
  }
}

function assertPositiveIntegerFlag(args, flag) {
  if (args[flag] === undefined) {
    return
  }
  assertFlagRequiresValue(args, flag)
  const parsed = Number(args[flag])
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`\`--${flag}\` must be a positive integer; got "${args[flag]}".`)
  }
}

export function assertValidArgs(args) {
  if (args.help) {
    return
  }

  for (const flag of FLAGS_WITH_VALUES) {
    assertFlagRequiresValue(args, flag)
  }

  assertPositiveIntegerFlag(args, 'poll-interval-ms')
  assertPositiveIntegerFlag(args, 'poll-max-attempts')

  if (args['task-code']) {
    if (!args.workspace) {
      throw new Error('`--task-code` requires `--workspace <workspace-root>`.')
    }
    if (args['images-dir'] || args.manifest) {
      throw new Error('`--task-code` cannot be combined with `--images-dir` or `--manifest`.')
    }
    return
  }

  if (!args['images-dir']) {
    throw new Error('Provide `--images-dir <dir>` for a new run.')
  }
}

export function usage() {
  return `
Usage:
  node <skillDir>/scripts/run-panorama-to-vr.mjs [options]

New run:
  --images-dir <dir>           Panorama input directory
  --manifest <path>            Optional manifest.json path
  --workspace <dir>            Workspace root (default: ./workspace)
  --project-name <name>        Optional project name override
  --poll-interval-ms <ms>      Poll interval override
  --poll-max-attempts <count>  Poll attempt limit override
  --json                       Emit final result JSON to stdout

Resume an existing task:
  --workspace <dir>            Existing workspace root
  --task-code <code>           Existing Realsee task code
  --poll-interval-ms <ms>      Poll interval override
  --poll-max-attempts <count>  Poll attempt limit override
  --json                       Emit final result JSON to stdout

Examples:
  node <skillDir>/scripts/run-panorama-to-vr.mjs \\
    --manifest <manifestPath> \\
    --images-dir <imagesDir> \\
    --workspace ./workspace \\
    --json

  node <skillDir>/scripts/run-panorama-to-vr.mjs \\
    --images-dir /absolute/path/to/panos \\
    --workspace ./workspace \\
    --json

  node <skillDir>/scripts/run-panorama-to-vr.mjs \\
    --workspace ./workspace \\
    --task-code abc123 \\
    --json
`.trim()
}
