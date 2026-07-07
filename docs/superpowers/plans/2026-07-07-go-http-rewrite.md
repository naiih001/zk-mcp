# Go HTTP Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Node/TypeScript MCP server with a minimal Go Streamable HTTP MCP service that keeps the Zettelkasten tools, resources, prompts, and PostgreSQL schema while removing all auth and stdio behavior.

**Architecture:** Build a small Go service with `cmd/zk-mcp` for process startup, `internal/mcp` for JSON-RPC/MCP dispatch, `internal/notes` for domain formatting and tool logic, and `internal/store` for Postgres access through `pgxpool`. The MCP layer is hand-written for this server's supported methods.

**Tech Stack:** Go 1.22+, standard `net/http`, `encoding/json`, `github.com/jackc/pgx/v5/pgxpool`, PostgreSQL full-text search, table-driven Go tests.

## Global Constraints

- Keep only Streamable HTTP: `POST /mcp`.
- Keep `GET /health`.
- Remove all OAuth, dynamic client registration, token, bearer auth, and stdio code.
- Preserve existing tool names, resource URIs, prompt names, and output formatting.
- Preserve PostgreSQL schema semantics so existing databases remain compatible.
- Do not modify or remove untracked `IMPROVEMENTS.md`.
- Local verification is blocked until Go is installed; `go version` currently returns `command not found`.

---

## File Structure

- Create `go.mod`: Go module and dependencies.
- Create `cmd/zk-mcp/main.go`: environment parsing, store connection, MCP handler wiring, HTTP server startup.
- Create `internal/notes/types.go`: note, relation, search result, and store interface types.
- Create `internal/notes/format.go`: formatting parity with the TypeScript implementation.
- Create `internal/notes/service.go`: tool-facing note service methods.
- Create `internal/mcp/jsonrpc.go`: JSON-RPC request/response envelopes and error helpers.
- Create `internal/mcp/schemas.go`: MCP tool/resource/prompt metadata.
- Create `internal/mcp/server.go`: method dispatch and argument validation.
- Create `internal/mcp/http.go`: `/health` and `/mcp` HTTP handlers.
- Create `internal/store/postgres.go`: pgx-backed database implementation.
- Create `internal/store/errors.go`: expected constraint error mapping.
- Create `migrations/001_initial.sql`: copy of existing SQL schema.
- Modify `README.md`: Go quickstart, Render build/start commands, HTTP-only connection docs.
- Remove obsolete Node/TypeScript/Prisma files after Go implementation passes tests.

---

### Task 1: Go Module And Domain Types

**Files:**
- Create: `go.mod`
- Create: `internal/notes/types.go`

**Interfaces:**
- Produces: `notes.Note`, `notes.NoteWithRelations`, `notes.SearchResult`, `notes.Store`
- Consumes: none

- [ ] **Step 1: Write the domain types**

Create `internal/notes/types.go`:

```go
package notes

import "context"

type Note struct {
	ID        string
	Title     string
	Body      string
	CreatedAt string
	UpdatedAt string
}

type Relation struct {
	ID    string
	Title string
}

type NoteWithRelations struct {
	Note
	Tags      []string
	Links     []Relation
	Backlinks []Relation
}

type SearchResult struct {
	ID        string
	Title     string
	Snippet   string
	Tags      []string
	Rank      float64
	UpdatedAt string
}

type Store interface {
	CreateNote(ctx context.Context, title, body string, tags []string) (Note, error)
	GetNote(ctx context.Context, id string) (*NoteWithRelations, error)
	UpdateNote(ctx context.Context, id string, title, body *string) (*Note, error)
	DeleteNote(ctx context.Context, id string) (bool, error)
	SearchNotes(ctx context.Context, query string, limit, offset int) ([]SearchResult, error)
	ListNotes(ctx context.Context, tag *string, limit, offset int) ([]Note, error)
	LinkNotes(ctx context.Context, sourceID, targetID string) (bool, error)
	GetBacklinks(ctx context.Context, noteID string) ([]Relation, error)
	AddTag(ctx context.Context, noteID, tag string) (bool, error)
	RemoveTag(ctx context.Context, noteID, tag string) (bool, error)
	GetAllTags(ctx context.Context) ([]string, error)
}
```

- [ ] **Step 2: Create the Go module**

Create `go.mod`:

```go
module github.com/naiih001/zk-mcp

go 1.22

require github.com/jackc/pgx/v5 v5.7.2
```

- [ ] **Step 3: Run module setup**

Run:

```bash
go mod tidy
```

Expected: dependencies resolve and `go.sum` is created. If `go` is unavailable, stop execution and install Go before continuing.

- [ ] **Step 4: Commit**

```bash
git add go.mod go.sum internal/notes/types.go
git commit -m "Add Go module and note domain types"
```

---

### Task 2: Formatting Parity

**Files:**
- Create: `internal/notes/format.go`
- Create: `internal/notes/format_test.go`

**Interfaces:**
- Consumes: `notes.Note`, `notes.NoteWithRelations`, `notes.SearchResult`
- Produces: `FormatNoteDetail`, `FormatNoteMarkdown`, `FormatSearchResults`, `FormatNoteList`, `FormatBacklinks`

- [ ] **Step 1: Write failing formatter tests**

Create `internal/notes/format_test.go` with table coverage matching `test/format.test.ts`: note detail includes body and relationships, empty relations show `(none)`, markdown renders `zk://notes/{id}`, search scores use two decimals, empty search/list/backlinks messages match existing text.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
go test ./internal/notes
```

Expected: FAIL because formatter functions are undefined.

- [ ] **Step 3: Implement formatters**

Create `internal/notes/format.go` with the same string layouts as `src/format.ts`. Use `time.Parse(time.RFC3339Nano, value)` and `Format("2006-01-02")` for date display; if parsing fails, slice the first 10 characters when available.

- [ ] **Step 4: Run tests**

Run:

```bash
go test ./internal/notes
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/notes/format.go internal/notes/format_test.go
git commit -m "Port note formatting to Go"
```

---

### Task 3: MCP JSON-RPC Core

**Files:**
- Create: `internal/mcp/jsonrpc.go`
- Create: `internal/mcp/jsonrpc_test.go`

**Interfaces:**
- Produces: `Request`, `Response`, `Error`, `NewResultResponse`, `NewErrorResponse`
- Consumes: standard `encoding/json`

- [ ] **Step 1: Write failing JSON-RPC tests**

Cover request ID preservation for string and numeric IDs, method-not-found errors with code `-32601`, invalid params errors with code `-32602`, and internal errors with code `-32603`.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
go test ./internal/mcp
```

Expected: FAIL because JSON-RPC types are undefined.

- [ ] **Step 3: Implement JSON-RPC helpers**

Create request/response structs using `json.RawMessage` for `params` and `id`, with helper constructors for result and error responses.

- [ ] **Step 4: Run tests**

Run:

```bash
go test ./internal/mcp
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/mcp/jsonrpc.go internal/mcp/jsonrpc_test.go
git commit -m "Add MCP JSON-RPC core"
```

---

### Task 4: MCP Schemas And Dispatch

**Files:**
- Create: `internal/mcp/schemas.go`
- Create: `internal/mcp/server.go`
- Create: `internal/mcp/server_test.go`
- Create: `internal/notes/service.go`

**Interfaces:**
- Consumes: `notes.Store`, formatter functions, JSON-RPC helpers
- Produces: `mcp.Server`, `Server.Handle(ctx, request)`, tool/resource/prompt dispatch

- [ ] **Step 1: Write failing dispatch tests**

Use a fake in-memory `notes.Store`. Cover:

- `initialize` returns server name `zk-mcp`, version `0.1.0`, and tool/resource/prompt capabilities.
- `notifications/initialized` returns no response.
- `tools/list` includes `create_note` and `remove_tag`.
- `tools/call` invokes `list_notes` with default `limit=50` and `offset=0`.
- Unsupported method returns `-32601`.
- Invalid tool arguments return `-32602`.
- `resources/list` returns note resources and `zk://tags`.
- `prompts/list` returns both prompt definitions.
- `prompts/get` renders `create_note_prompt`.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
go test ./internal/mcp
```

Expected: FAIL because server dispatch is undefined.

- [ ] **Step 3: Implement schemas**

Create JSON-schema maps for each tool input. Use the current TypeScript schema constraints as the behavioral source: UUID string descriptions, min/max/default values, optional fields, and array tags.

- [ ] **Step 4: Implement service and dispatch**

Implement `notes.Service` around `notes.Store` for tool methods, then implement `mcp.Server` method dispatch. Keep validation conservative: required strings must be non-empty, IDs must be parseable UUID-shaped strings, limits clamp to `1..100`, offsets must be `>=0`.

- [ ] **Step 5: Run tests**

Run:

```bash
go test ./internal/mcp ./internal/notes
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/mcp/schemas.go internal/mcp/server.go internal/mcp/server_test.go internal/notes/service.go
git commit -m "Implement MCP method dispatch"
```

---

### Task 5: HTTP Handler

**Files:**
- Create: `internal/mcp/http.go`
- Create: `internal/mcp/http_test.go`

**Interfaces:**
- Consumes: `mcp.Server.Handle`
- Produces: `Handler() http.Handler`

- [ ] **Step 1: Write failing HTTP tests**

Cover:

- `GET /health` returns `200` with `{"status":"ok"}`.
- `POST /mcp` with an initialize request returns `200` JSON-RPC response.
- `POST /mcp` with `notifications/initialized` returns `202`.
- `GET /mcp` returns `405`.
- `POST /` returns `404`.
- Malformed JSON returns `400`.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
go test ./internal/mcp
```

Expected: FAIL because HTTP handler is undefined.

- [ ] **Step 3: Implement HTTP handler**

Implement routes with `net/http`. Set `Content-Type: application/json` for JSON responses. Do not inspect or require authorization headers. Do not expose any `.well-known`, OAuth, register, authorize, or token routes.

- [ ] **Step 4: Run tests**

Run:

```bash
go test ./internal/mcp
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/mcp/http.go internal/mcp/http_test.go
git commit -m "Add HTTP MCP handler"
```

---

### Task 6: PostgreSQL Store

**Files:**
- Create: `internal/store/errors.go`
- Create: `internal/store/postgres.go`
- Create: `internal/store/postgres_test.go`
- Create: `migrations/001_initial.sql`

**Interfaces:**
- Consumes: `notes.Store`
- Produces: `store.PostgresStore` implementing `notes.Store`

- [ ] **Step 1: Copy migration SQL**

Create `migrations/001_initial.sql` from `prisma/migrations/20260706000000_initial/migration.sql` without Prisma metadata.

- [ ] **Step 2: Write store tests**

Write tests that skip when `DATABASE_URL` is absent. When present, create a transaction or isolated test data and cover create/get/list/search/link/tag operations.

- [ ] **Step 3: Run tests to verify skip or failure**

Run:

```bash
go test ./internal/store
```

Expected without `DATABASE_URL`: PASS with tests skipped. Expected with `DATABASE_URL`: FAIL until implementation exists.

- [ ] **Step 4: Implement pgx store**

Use `pgxpool.Pool`. Implement transaction logic for `CreateNote` with tags. Use SQL equivalent to the current Prisma/raw SQL implementation for all operations. Map unique, foreign-key, check, and no-row conditions to the current boolean/null behavior.

- [ ] **Step 5: Run tests**

Run:

```bash
go test ./internal/store
```

Expected: PASS or documented skip when `DATABASE_URL` is absent.

- [ ] **Step 6: Commit**

```bash
git add internal/store/errors.go internal/store/postgres.go internal/store/postgres_test.go migrations/001_initial.sql
git commit -m "Add PostgreSQL note store"
```

---

### Task 7: Process Entrypoint

**Files:**
- Create: `cmd/zk-mcp/main.go`
- Create: `cmd/zk-mcp/main_test.go`

**Interfaces:**
- Consumes: `store.PostgresStore`, `mcp.Handler`
- Produces: runnable `zk-mcp` binary

- [ ] **Step 1: Write startup config tests**

Cover default `PORT=3100`, default `HOST=0.0.0.0`, explicit `PORT`/`HOST`, and missing `DATABASE_URL` error.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
go test ./cmd/zk-mcp
```

Expected: FAIL because config parsing is undefined.

- [ ] **Step 3: Implement main**

Parse environment into config, require `DATABASE_URL`, connect `pgxpool`, construct store, service, MCP server, handler, and start `http.Server` at `HOST:PORT`.

- [ ] **Step 4: Run tests and build**

Run:

```bash
go test ./cmd/zk-mcp ./internal/...
go build -o /tmp/zk-mcp ./cmd/zk-mcp
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cmd/zk-mcp/main.go cmd/zk-mcp/main_test.go
git commit -m "Add Go HTTP server entrypoint"
```

---

### Task 8: Remove Node Runtime And Update Docs

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Delete: `package.json`
- Delete: `package-lock.json`
- Delete: `tsconfig.json`
- Delete: `prisma.config.ts`
- Delete: `src/`
- Delete: `test/`
- Delete: `prisma/`
- Delete: `build/`

**Interfaces:**
- Consumes: completed Go server and migration
- Produces: Go-only project surface

- [ ] **Step 1: Update README**

Rewrite quickstart and deployment sections for Go:

```bash
cp .env.example .env
go test ./...
go build -o zk-mcp ./cmd/zk-mcp
./zk-mcp
```

Render build command:

```bash
go build -o zk-mcp ./cmd/zk-mcp
```

Render start command:

```bash
./zk-mcp
```

- [ ] **Step 2: Update environment docs**

Keep only:

```text
DATABASE_URL=
PORT=3100
HOST=0.0.0.0
```

- [ ] **Step 3: Delete obsolete files**

Remove Node, TypeScript, Prisma, generated build, and Node tests after the Go tests and build pass. Do not remove `docs/`, `migrations/`, `opencode.json`, or `IMPROVEMENTS.md`.

- [ ] **Step 4: Run full verification**

Run:

```bash
go test ./...
go build -o /tmp/zk-mcp ./cmd/zk-mcp
```

Expected: PASS. If Go is still unavailable locally, report the exact blocker and do not claim build success.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example go.mod go.sum cmd internal migrations
git rm package.json package-lock.json tsconfig.json prisma.config.ts
git rm -r src test prisma build
git commit -m "Rewrite MCP server in Go"
```

---

## Self-Review

- Spec coverage: The plan covers HTTP-only Streamable MCP, no auth, no stdio, Postgres schema compatibility, tools, resources, prompts, docs, and cleanup.
- Placeholder scan: No task relies on TODO/TBD language; implementation choices are concrete.
- Type consistency: `notes.Store` feeds `notes.Service`, which feeds `mcp.Server`, which feeds the HTTP handler and process entrypoint.
- Known blocker: Go is not installed in the current shell, so execution must install Go or run in an environment that already has it before Go tests/builds can be verified.
