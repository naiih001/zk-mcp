# Project Improvement Notes

This project is a TypeScript MCP server for a Zettelkasten note system. It is already coherent, but the highest-value improvements are around reliability, security, and usability.

## Highest Impact

1. Add tests

   There are no visible tests yet. Add focused integration tests around:

   - note CRUD
   - tags
   - note linking and backlink behavior
   - full-text search
   - MCP tool responses
   - auth behavior on `/mcp`

2. Make migrations idempotent or versioned

   `src/migrate.ts` always runs `migrations/001_initial.sql`, but the SQL uses plain `CREATE TABLE`, so rerunning migrations will fail after the first run. Use a migration table or a tool like `node-pg-migrate`, or at least add `CREATE TABLE IF NOT EXISTS` where appropriate.

3. Tighten auth and OAuth behavior

   The server is currently public and standards-based. If you later add private access, use the MCP authorization spec directly instead of introducing a compatibility shim.

4. Improve error handling in DB operations

   Some functions return `false` on any error, especially `linkNotes` in `src/db.ts`. That hides useful failure reasons like missing note IDs, duplicate links, or database issues. It would be better to distinguish expected conflicts from real database errors.

5. Add pagination and detail to search

   `search_notes` returns only titles and scores. For a note system, search results would be more useful with IDs, short snippets, tags, and updated dates. Otherwise clients need extra calls to identify which result they want.

## Good Next Improvements

- Add `get_outgoing_links` or include link IDs more clearly in `get_note`.
- Add `rename_tag`, `list_tags`, and more `list_notes` sorting/filter options.
- Normalize tag casing, or define whether `AI`, `ai`, and `Ai` are distinct.
- Add an `updated_at` trigger in Postgres instead of manually setting it only in `updateNote`.
- Add Docker Compose for local Postgres setup.
- Add CI for `npm ci`, `npm run build`, tests, and possibly linting.
- Avoid committing environment-specific URLs in `opencode.json` unless this repo is intentionally personal.

## Suggested Starting Point

Start with versioned migrations, tests, and safer auth semantics. Those changes would make the project easier to run, deploy, and trust.
