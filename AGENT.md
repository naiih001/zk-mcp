# AGENT.md

Repository guidance for agents working in `zk-mcp`.

## Project

`zk-mcp` is a Zettelkasten note-taking system exposed as an MCP server.
It supports HTTP and stdio transports, with a PostgreSQL backend and Prisma migrations.

## Current direction

The repo is being prepared for automated releases.

Planned release stack:
- `release-please` on GitHub Actions
- Conventional Commits as the release signal
- `CHANGELOG.md` generated from merged work
- MIT license added at repo root

## Important files

- [`README.md`](./README.md) for product and deployment context
- [`package.json`](./package.json) for scripts, version, and package metadata
- [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) for CI and auto-merge behavior

## Working rules

- Prefer small, focused changes.
- Do not overwrite user changes outside the task scope.
- Check `git status` before editing and before finishing.
- Use `apply_patch` for file edits.
- Keep new files and edits ASCII unless existing content clearly requires otherwise.

## Release expectations

When adding release automation:
- keep CI tests separate from release publishing
- make release notes traceable to commit history
- ensure `package-lock.json` stays in sync with version changes
- add or update `LICENSE` and `CHANGELOG.md`

## Agent workflow

Before making release-related changes:
- inspect the current workflow files
- confirm the package versioning state
- preserve the repo’s existing merge-to-`main` pattern unless the release design explicitly changes it

## Open issue

`opencode.json` is currently deleted in the working tree. Treat that as unrelated unless the user asks to restore or modify it.
