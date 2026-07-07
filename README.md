# zk-mcp

A Zettelkasten note-taking system as an MCP (Model Context Protocol) server. Create, link, tag, search, and retrieve notes through any MCP client, including ChatGPT connectors and other MCP-compatible hosts.

## Quick Start

```bash
npm install
cp .env.example .env   # edit DATABASE_URL
npm run migrate         # apply Prisma migrations
npm run dev             # start on http://localhost:3100/mcp
```

## Architecture

```
MCP Client (ChatGPT/opencode/etc.)  ←→  Streamable HTTP / stdio  ←→  zk-mcp  ←→  PostgreSQL
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
| `search_notes` | Full-text search across all notes | `query`, `limit` (default 50), `offset` |
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

### ChatGPT Connector

1. Enable developer mode in ChatGPT if your workspace requires it.
2. Create a connector and point it at `https://your-app.onrender.com/mcp`.
3. If the deployment is public, no extra auth configuration is needed.
4. ChatGPT will scan the available tools and make them available in chat.

The server exposes a standard remote MCP endpoint and does not ship a custom OAuth compatibility layer.
