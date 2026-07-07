import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as db from './db.js';
import {
  formatBacklinks,
  formatNoteDetail,
  formatNoteList,
  formatNoteMarkdown,
  formatSearchResults,
  formatTodoDetail,
  formatTodoList,
  formatTodoSearchResults,
} from './format.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'zk-mcp',
    version: '0.1.0',
  }, {
    capabilities: {
      tools: { listChanged: true },
      resources: { listChanged: true },
      prompts: {},
    },
  });

  server.registerTool('create_note', {
    title: 'Create Note',
    description: 'Create a new Zettelkasten note',
    inputSchema: {
      title: z.string().min(1).describe('Note title'),
      body: z.string().default('').describe('Note body/content'),
      tags: z.array(z.string()).optional().describe('Optional tags'),
    },
  }, async ({ title, body, tags }) => {
    const note = await db.createNote(title, body, tags);
    const tagInfo = tags?.length ? `tags: [${tags.join(', ')}]` : 'no tags';
    return {
      content: [{ type: 'text', text: `Created note ${note.id}: "${note.title}" (${tagInfo})` }],
    };
  });

  server.registerTool('get_note', {
    title: 'Get Note',
    description: 'Get a note by ID with its tags, links, and backlinks',
    inputSchema: {
      id: z.string().uuid().describe('Note UUID'),
    },
  }, async ({ id }) => {
    const note = await db.getNote(id);
    if (!note) {
      return { content: [{ type: 'text', text: 'Note not found' }], isError: true };
    }
    return { content: [{ type: 'text', text: formatNoteDetail(note) }] };
  });

  server.registerTool('update_note', {
    title: 'Update Note',
    description: 'Update a note title and/or body',
    inputSchema: {
      id: z.string().uuid().describe('Note UUID'),
      title: z.string().min(1).optional().describe('New title'),
      body: z.string().optional().describe('New body'),
    },
  }, async ({ id, title, body }) => {
    const note = await db.updateNote(id, title, body);
    if (!note) {
      return { content: [{ type: 'text', text: 'Note not found or nothing to update' }], isError: true };
    }
    return { content: [{ type: 'text', text: `Updated note ${note.id}` }] };
  });

  server.registerTool('delete_note', {
    title: 'Delete Note',
    description: 'Delete a note by ID',
    inputSchema: {
      id: z.string().uuid().describe('Note UUID'),
    },
  }, async ({ id }) => {
    const ok = await db.deleteNote(id);
    return {
      content: [{ type: 'text', text: ok ? `Deleted note ${id}` : 'Note not found' }],
      isError: !ok,
    };
  });

  server.registerTool('search_notes', {
    title: 'Search Notes',
    description: 'Full-text search across all notes',
    inputSchema: {
      query: z.string().min(1).describe('Search query'),
      limit: z.number().min(1).max(100).default(50).describe('Max results'),
      offset: z.number().min(0).default(0).describe('Pagination offset'),
    },
  }, async ({ query, limit, offset }) => {
    const results = await db.searchNotes(query, limit, offset);
    return { content: [{ type: 'text', text: formatSearchResults(results) }] };
  });

  server.registerTool('list_notes', {
    title: 'List Notes',
    description: 'List notes, optionally filtered by tag',
    inputSchema: {
      tag: z.string().optional().describe('Filter by tag name'),
      limit: z.number().min(1).max(100).default(50).describe('Max results'),
      offset: z.number().min(0).default(0).describe('Pagination offset'),
    },
  }, async ({ tag, limit, offset }) => {
    const notes = await db.listNotes(tag, limit, offset);
    return { content: [{ type: 'text', text: formatNoteList(notes) }] };
  });

  server.registerTool('link_notes', {
    title: 'Link Notes',
    description: 'Create a bidirectional link from source note to target note',
    inputSchema: {
      source_id: z.string().uuid().describe('Source note UUID'),
      target_id: z.string().uuid().describe('Target note UUID'),
    },
  }, async ({ source_id, target_id }) => {
    const ok = await db.linkNotes(source_id, target_id);
    return {
      content: [{ type: 'text', text: ok ? `Linked ${source_id.slice(0, 8)}… → ${target_id.slice(0, 8)}…` : 'Failed to link' }],
      isError: !ok,
    };
  });

  server.registerTool('get_backlinks', {
    title: 'Get Backlinks',
    description: 'Get all notes that link to a given note',
    inputSchema: {
      id: z.string().uuid().describe('Note UUID'),
    },
  }, async ({ id }) => {
    const backlinks = await db.getBacklinks(id);
    return { content: [{ type: 'text', text: formatBacklinks(backlinks) }] };
  });

  server.registerTool('add_tag', {
    title: 'Add Tag',
    description: 'Add a tag to a note',
    inputSchema: {
      note_id: z.string().uuid().describe('Note UUID'),
      tag: z.string().min(1).describe('Tag name'),
    },
  }, async ({ note_id, tag }) => {
    const ok = await db.addTag(note_id, tag);
    return {
      content: [{ type: 'text', text: ok ? `Added tag "${tag}"` : 'Tag already present' }],
    };
  });

  server.registerTool('remove_tag', {
    title: 'Remove Tag',
    description: 'Remove a tag from a note',
    inputSchema: {
      note_id: z.string().uuid().describe('Note UUID'),
      tag: z.string().min(1).describe('Tag name'),
    },
  }, async ({ note_id, tag }) => {
    const ok = await db.removeTag(note_id, tag);
    return {
      content: [{ type: 'text', text: ok ? `Removed tag "${tag}"` : 'Tag not found' }],
      isError: !ok,
    };
  });

  server.registerResource(
    'Note',
    new ResourceTemplate('zk://notes/{id}', {
      list: async () => {
        const notes = await db.listNotes();
        return {
          resources: notes.map(n => ({
            uri: `zk://notes/${n.id}`,
            name: n.title,
            description: n.body.slice(0, 200),
            mimeType: 'text/markdown',
          })),
        };
      },
    }),
    {
      description: 'A single Zettelkasten note with full details',
      mimeType: 'text/markdown',
    },
    async (uri, { id }) => {
      const note = await db.getNote(id as string);
      if (!note) {
        throw new Error(`Note ${id} not found`);
      }
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: formatNoteMarkdown(note) }],
      };
    }
  );

  server.registerResource(
    'Tags',
    'zk://tags',
    {
      description: 'List all tags',
      mimeType: 'text/plain',
    },
    async (uri) => {
      const tags = await db.getAllTags();
      return {
        contents: [{ uri: uri.href, mimeType: 'text/plain', text: tags.join('\n') || '(no tags)' }],
      };
    }
  );

  server.registerPrompt('create_note_prompt', {
    title: 'Create Note',
    description: 'Template for creating a well-structured Zettelkasten note',
    argsSchema: {
      topic: z.string().describe('The topic or subject of the note'),
    },
  }, async ({ topic }) => {
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Create a new Zettelkasten note about "${topic}". Use the mcp_tool_create_note tool with:\n- title: a concise, descriptive title\n- body: the main content (1-3 paragraphs)\n- tags: 2-5 relevant tags\n\nThen use mcp_tool_search_notes to find related notes and mcp_tool_link_notes to connect them.`,
        },
      }],
    };
  });

  server.registerPrompt('link_notes_prompt', {
    title: 'Link Notes',
    description: 'Template for linking two notes based on content similarity',
    argsSchema: {
      source_id: z.string().describe('UUID of the source note'),
      target_id: z.string().describe('UUID of the target note'),
    },
  }, async ({ source_id, target_id }) => {
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `First, get the content of both notes using mcp_tool_get_note for ${source_id} and ${target_id}. Then, if they are related, use mcp_tool_link_notes to connect them.`,
        },
      }],
    };
  });

  server.registerTool('create_todo', {
    title: 'Create Todo',
    description: 'Create a new todo item',
    inputSchema: {
      title: z.string().min(1).describe('Todo title'),
      description: z.string().default('').describe('Optional description'),
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).default('pending').describe('Status'),
      priority: z.number().int().min(0).max(3).default(0).describe('Priority (0=none, 1=low, 2=medium, 3=high)'),
      due_date: z.string().optional().describe('Optional due date (ISO 8601)'),
    },
  }, async ({ title, description, status, priority, due_date }) => {
    const todo = await db.createTodo(title, description, status, priority, due_date);
    return {
      content: [{ type: 'text', text: `Created todo ${todo.id}: "${todo.title}" (${todo.status})` }],
    };
  });

  server.registerTool('get_todo', {
    title: 'Get Todo',
    description: 'Get a todo by ID with its linked notes',
    inputSchema: {
      id: z.string().uuid().describe('Todo UUID'),
    },
  }, async ({ id }) => {
    const todo = await db.getTodo(id);
    if (!todo) {
      return { content: [{ type: 'text', text: 'Todo not found' }], isError: true };
    }
    return { content: [{ type: 'text', text: formatTodoDetail(todo) }] };
  });

  server.registerTool('update_todo', {
    title: 'Update Todo',
    description: 'Update a todo item',
    inputSchema: {
      id: z.string().uuid().describe('Todo UUID'),
      title: z.string().min(1).optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional().describe('New status'),
      priority: z.number().int().min(0).max(3).optional().describe('New priority (0=none, 1=low, 2=medium, 3=high)'),
      due_date: z.string().nullable().optional().describe('New due date (ISO 8601) or null to clear'),
    },
  }, async ({ id, title, description, status, priority, due_date }) => {
    const todo = await db.updateTodo(id, { title, description, status, priority, dueDate: due_date });
    if (!todo) {
      return { content: [{ type: 'text', text: 'Todo not found or nothing to update' }], isError: true };
    }
    return { content: [{ type: 'text', text: `Updated todo ${todo.id}` }] };
  });

  server.registerTool('delete_todo', {
    title: 'Delete Todo',
    description: 'Delete a todo by ID',
    inputSchema: {
      id: z.string().uuid().describe('Todo UUID'),
    },
  }, async ({ id }) => {
    const ok = await db.deleteTodo(id);
    return {
      content: [{ type: 'text', text: ok ? `Deleted todo ${id}` : 'Todo not found' }],
      isError: !ok,
    };
  });

  server.registerTool('list_todos', {
    title: 'List Todos',
    description: 'List todos, optionally filtered by status',
    inputSchema: {
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional().describe('Filter by status'),
      limit: z.number().min(1).max(100).default(50).describe('Max results'),
      offset: z.number().min(0).default(0).describe('Pagination offset'),
    },
  }, async ({ status, limit, offset }) => {
    const todos = await db.listTodos(status, limit, offset);
    return { content: [{ type: 'text', text: formatTodoList(todos) }] };
  });

  server.registerTool('search_todos', {
    title: 'Search Todos',
    description: 'Full-text search across all todos',
    inputSchema: {
      query: z.string().min(1).describe('Search query'),
      limit: z.number().min(1).max(100).default(50).describe('Max results'),
      offset: z.number().min(0).default(0).describe('Pagination offset'),
    },
  }, async ({ query, limit, offset }) => {
    const results = await db.searchTodos(query, limit, offset);
    return { content: [{ type: 'text', text: formatTodoSearchResults(results) }] };
  });

  server.registerTool('link_todo_to_note', {
    title: 'Link Todo to Note',
    description: 'Link a todo to a note',
    inputSchema: {
      todo_id: z.string().uuid().describe('Todo UUID'),
      note_id: z.string().uuid().describe('Note UUID'),
    },
  }, async ({ todo_id, note_id }) => {
    const ok = await db.linkTodoToNote(todo_id, note_id);
    return {
      content: [{ type: 'text', text: ok ? `Linked todo ${todo_id.slice(0, 8)}… → note ${note_id.slice(0, 8)}…` : 'Failed to link' }],
      isError: !ok,
    };
  });

  server.registerTool('unlink_todo_from_note', {
    title: 'Unlink Todo from Note',
    description: 'Remove the link between a todo and a note',
    inputSchema: {
      todo_id: z.string().uuid().describe('Todo UUID'),
      note_id: z.string().uuid().describe('Note UUID'),
    },
  }, async ({ todo_id, note_id }) => {
    const ok = await db.unlinkTodoFromNote(todo_id, note_id);
    return {
      content: [{ type: 'text', text: ok ? `Unlinked todo ${todo_id.slice(0, 8)}… from note ${note_id.slice(0, 8)}…` : 'Link not found' }],
      isError: !ok,
    };
  });

  return server;
}
