# Maintainer Contributions

[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh-CN.md)

Realsee Skills is published to expose supported skill capabilities. External pull requests are not the primary path for roadmap or product feature development. This guide is for maintainers and narrowly scoped fixes.

## Before You Start

1. Read the relevant skill README under `.agents/skills/`.
2. Check `release-channel.json` for the current skill state.
3. Avoid committing generated outputs, credentials, account identifiers, private URLs, `.env` files, downloaded Argus archives, extracted artifacts, or temporary workspace files.

## Maintainer Development Flow

1. Make the smallest change that solves the issue.
2. Update docs when command behavior, configuration, release gates, or skill usage changes.
3. Run focused checks while editing.
4. Run `npm run ci` before opening a pull request or pushing a release branch.

For `argus` source changes, run:

```bash
npm run test:skill
npm run rebuild
npm run ci
```

For docs-only changes, run:

```bash
npm run validate:docs
npm run ci
```

## Pull Request Checklist

- The change is scoped to one problem.
- Documentation reflects any new or changed behavior.
- Tests or validation commands were run and the results are listed in the PR.
- No secrets or private generated artifacts are committed.
- The Claude plugin copy is rebuilt when source skill files changed.

## New Skill Packages

New skill packages are added by Realsee maintainers after the capability, API contract, and release gate are approved. A new skill package should include:

- `SKILL.md` with accurate frontmatter
- A skill `README.md`
- Tests with injectable fakes for upload, gateway, and download paths
- References for external API contracts when remote services are involved
- Explicit consent language for workflows that upload local files
