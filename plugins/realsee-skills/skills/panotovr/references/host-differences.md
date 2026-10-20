# Host installation

[English](host-differences.md) | [简体中文](host-differences.zh-CN.md)

From a local checkout, run `npx skills add . --skill panotovr --agent codex`, or select another host supported by `npx skills`. Invoke `$panotovr` in Codex. Resolve the runtime from the installed skill directory.

For Claude Code, run the repository's `npm run rebuild`, then `claude --plugin-dir ./plugins/realsee-skills`. Invoke `realsee-skills:panotovr`. The plugin has no credential userConfig; configure the subprocess environment or a private current-directory `.env`. Legacy `CLAUDE_PLUGIN_OPTION_REALSEE_*` variables remain supported.

Install runtime dependencies in the installed skill directory using the SKILL.md command. Installing root repository dependencies alone does not install PanoToVR dependencies. The repository Codex installer and Arkclaw ZIP are Argus-only. PanoToVR ships from v2.3.0; use `realsee-developer/skills@v2.3.1` instead of `.` for a versioned install.
