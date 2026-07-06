# zk-mcp

A Zettelkasten note-taking system as an MCP (Model Context Protocol) server. Create, link, tag, search, and retrieve notes through any MCP client — opencode, Claude Desktop, Claude Code CLI, or any MCP-compatible host.

## Quick Start

```bash
npm install
cp .env.example .env   # edit DATABASE_URL
npm run migrate         # apply Prisma migrations
npm run dev             # start on http://localhost:3100/mcp
```

## Architecture

```
MCP Client (opencode/Claude)  ←→  Streamable HTTP / stdio  ←→  zk-mcp  ←→  PostgreSQL
```

The server supports two transports:
- **Streamable HTTP** (`src/index.ts`) — for remote/network access, used on Render
- **stdio** (`src/local.ts`) — for local subprocess launch via MCP clients

## MCP Tools

| Tool | Description | Key Inputs |
|------|-------------|------------|
| `create_note` | Create a note | `title` (required), `body`, `tags[]` |
| `get_note` | Get note with tags, links, backlinks | `id` (UUID) |
| `update_note` | Update title/body | `id`, optional `title`/`body` |
| `delete_note` | Delete a note | `id` |
| `search_notes` | Full-text search across all notes | `query` |
| `list_notes` | List notes, optionally filtered by tag | `tag`, `limit` (default 50), `offset` |
| `link_notes` | Create a bidirectional link between two notes | `source_id`, `target_id` |
| `get_backlinks` | Get all notes that link to a given note | `id` |
| `add_tag` | Add a tag to a note | `note_id`, `tag` |
| `remove_tag` | Remove a tag from a note | `note_id`, `tag` |

## MCP Resources

| URI | Returns |
|-----|---------|
| `zk://notes/{id}` | A single note as markdown with frontmatter, links, and backlinks |
| `zk://tags` | Plain text list of all tags (one per line) |

Resources support `list` — MCP clients can discover all notes without knowing their IDs in advance.

## MCP Prompts

| Prompt | Purpose |
|--------|---------|
| `create_note_prompt` | Templates a note creation workflow — guides the LLM to write a well-structured note, search for related notes, and link them |
| `link_notes_prompt` | Templates a linking workflow — fetches two notes by ID, analyzes their content, and links them if related |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `PORT` | `3100` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server bind address |
| `AUTH_TOKEN` | — | If set, requires this Bearer token on all /mcp requests |

## Database Schema

- **`notes`** — `id` (UUID PK), `title`, `body`, `created_at`, `updated_at`, `search` (auto-generated `tsvector` for full-text search)
- **`tags`** — `id` (UUID PK), `name` (unique)
- **`note_tags`** — many-to-many join between notes and tags
- **`links`** — bidirectional links with self-link prevention (`CHECK source_note_id <> target_note_id`)

## Deployment (Render)

1. Connect your GitHub repo to Render as a **Web Service**
2. Set `DATABASE_URL` to your PostgreSQL connection string (Render Postgres works)
3. Build command: `npm install; npm run build`
4. Start command: `npm start`
5. Auto-deploys from `main` — the service is live at `https://<name>.onrender.com`

## Connecting from MCP Clients

### opencode

Add to `opencode.json`:

```json
{
  "mcp": {
    "zk": {
      "type": "remote",
      "url": "https://your-app.onrender.com/mcp",
      "enabled": true
    }
  }
}
```

### Claude Code CLI

```bash
claude mcp add --transport http zk https://your-app.onrender.com/mcp
```

### Claude Desktop (via mcp-remote bridge)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zk-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://your-app.onrender.com/mcp", "--transport", "http-only"]
    }
  }
}
```

### claude.ai Web Connector

The claude.ai custom connector flow tries OAuth discovery against every remote MCP server. This server includes a **fake OAuth endpoint** that auto-approves any registration, redirect, and token exchange so the connector setup succeeds.

1. Go to **Settings → Connectors → Add custom connector**
2. Enter URL: `https://your-app.onrender.com/mcp`
3. Leave OAuth fields blank
4. Click Connect — your browser opens and immediately closes (auto-redirect), then the connector shows "Connected"

This works around [known claude.ai issue #402](https://github.com/anthropics/claude-ai-mcp/issues/402) — the broker doesn't support authless servers natively. The fake OAuth runs on `/.well-known/oauth-*`, `/register`, `/authorize`, and `/token` endpoints alongside the MCP endpoint.
