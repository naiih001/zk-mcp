# Go HTTP Rewrite Design

## Goal

Rewrite `zk-mcp` as a minimal Go service that exposes only the Streamable HTTP MCP endpoint needed by remote clients such as ChatGPT, while preserving the Zettelkasten note tools, resources, prompts, and PostgreSQL-backed data model.

## Scope

The rewrite replaces the Node.js, TypeScript, Prisma, and local stdio runtime with Go. The final project should build and run as a Go web service on Render.

The server keeps:

- `POST /mcp` for Streamable HTTP MCP JSON-RPC requests.
- `GET /health` for Render and manual health checks.
- PostgreSQL persistence using the existing note, tag, note-tag, link, and full-text search schema.
- Existing MCP tools: `create_note`, `get_note`, `update_note`, `delete_note`, `search_notes`, `list_notes`, `link_notes`, `get_backlinks`, `add_tag`, and `remove_tag`.
- Existing MCP resources: `zk://notes/{id}` and `zk://tags`.
- Existing MCP prompts: `create_note_prompt` and `link_notes_prompt`.
- Existing output formatting semantics for note detail, markdown resources, search results, note lists, and backlinks.

The server removes:

- OAuth discovery and compatibility endpoints.
- Dynamic client registration.
- Authorization and token exchange routes.
- Bearer token enforcement.
- Local stdio MCP transport.
- Prisma client generation and Node package scripts.

## Architecture

The Go application will use a small, explicit package structure:

- `cmd/zk-mcp`: process entrypoint, environment loading, HTTP server startup.
- `internal/mcp`: JSON-RPC request/response types, method dispatch, tool/resource/prompt schemas, and MCP response helpers.
- `internal/notes`: domain types, formatting helpers, and tool-facing service methods.
- `internal/store`: PostgreSQL access through `pgx`, including SQL queries and transaction logic.
- `migrations`: SQL schema used for database setup.

The MCP implementation will be hand-written for the subset this server needs. This avoids carrying a second immature framework into the rewrite and keeps the transport behavior visible. The server will accept JSON-RPC request objects and batches on `POST /mcp`, return JSON-RPC responses for request messages, and return `202 Accepted` for notification-only messages such as `notifications/initialized`.

## MCP Behavior

The server will implement these methods:

- `initialize`: returns protocol metadata, server name/version, and capabilities for tools, resources, and prompts.
- `notifications/initialized`: no-op notification.
- `tools/list`: returns schemas for all note tools.
- `tools/call`: validates tool name and arguments, executes the matching note operation, and returns MCP content blocks.
- `resources/list`: lists note resources plus the tags resource.
- `resources/read`: reads `zk://notes/{id}` or `zk://tags`.
- `prompts/list`: returns the two supported prompt definitions.
- `prompts/get`: returns the requested prompt messages with validated arguments.

Unsupported methods return JSON-RPC `-32601 Method not found`. Invalid arguments return `-32602 Invalid params`. Unexpected server failures return `-32603 Internal error`.

## Database

The Go store will use `pgxpool` with `DATABASE_URL`. If `DATABASE_URL` is missing at startup, the process exits with a clear error.

The SQL schema preserves the existing tables and behavior:

- `notes`: UUID primary key, title, body, timestamps, generated `tsvector` search column.
- `tags`: UUID primary key and unique tag name.
- `note_tags`: many-to-many note/tag relation.
- `links`: source/target note relation with duplicate and self-link prevention.

Search continues to use PostgreSQL full-text search with `plainto_tsquery`, `ts_headline`, and `ts_rank`.

Expected constraint failures map to current user-facing behavior:

- Missing note on update/delete returns a tool error result, not a server crash.
- Duplicate link, invalid link, duplicate tag, and missing tag removals return false-style tool results.
- Unexpected database errors return JSON-RPC internal errors.

## Deployment

Render should build and run the Go binary:

```bash
go build -o zk-mcp ./cmd/zk-mcp
./zk-mcp
```

The server reads:

- `DATABASE_URL`: required.
- `PORT`: optional, defaults to `3100`.
- `HOST`: optional, defaults to `0.0.0.0`.

No auth-related environment variables are supported in the rewritten service.

## Testing

The rewrite must include Go tests for:

- Formatting output parity.
- MCP method dispatch for initialize, tool listing, prompts, resources, unsupported methods, and notification handling.
- Store behavior using unit-level SQL boundaries where practical.
- HTTP `/health` and `/mcp` status behavior.

Before completion, run:

```bash
go test ./...
go build -o /tmp/zk-mcp ./cmd/zk-mcp
```

If live database integration tests require `DATABASE_URL`, they should be skipped clearly when the variable is absent.

## Migration Strategy

Implement the Go service in place, then remove obsolete Node/TypeScript files once the Go tests and build pass. Keep the existing PostgreSQL schema semantics so existing Render databases remain compatible.

The untracked `IMPROVEMENTS.md` file is outside this rewrite and must not be modified or removed unless explicitly requested.
