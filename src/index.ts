import 'dotenv/config';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import {
  createJsonResponse,
  createTextResponse,
  describeMcpMessage,
  getContentType,
  getRequestOrigin,
  parseJsonBody,
} from './http.js';
import {
  createRequestId,
  getMcpMetadata,
  logError,
  logInfo,
  logWarn,
  serializeError,
} from './observability.js';
import * as db from './db.js';

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(process.cwd(), 'public');

const transports = new Map<string, StreamableHTTPServerTransport>();

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const response = createJsonResponse(status, data);
  res.writeHead(response.status, response.headers);
  res.end(response.body);
}

function sendText(res: http.ServerResponse, status: number, body: string, contentType?: string): void {
  const response = createTextResponse(status, body, contentType);
  res.writeHead(response.status, response.headers);
  res.end(response.body);
}

async function sendStaticFile(res: http.ServerResponse, fileName: string): Promise<boolean> {
  try {
    const filePath = path.join(PUBLIC_DIR, fileName);
    const body = await readFile(filePath, 'utf8');
    sendText(res, 200, body, getContentType(filePath));
    return true;
  } catch {
    return false;
  }
}

function jsonBody(body: string): Record<string, unknown> | null {
  const parsed = parseJsonBody(body);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, pathName: string): Promise<boolean> {
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'DELETE' ? '' : await readBody(req);
  const data = body ? jsonBody(body) : null;

  if (pathName === '/api/notes' && method === 'GET') {
    const notes = await db.listNotes();
    return sendJson(res, 200, { notes }), true;
  }

  if (pathName === '/api/todos' && method === 'GET') {
    const todos = await db.listTodos();
    return sendJson(res, 200, { todos }), true;
  }

  if (pathName === '/api/tags' && method === 'GET') {
    const tags = await db.getAllTags();
    return sendJson(res, 200, { tags }), true;
  }

  if (pathName === '/api/search' && method === 'GET') {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const query = url.searchParams.get('q');
    const type = url.searchParams.get('type') ?? 'notes';
    if (!query) {
      sendJson(res, 400, { error: 'Missing query parameter q' });
      return true;
    }
    if (type === 'todos') {
      const results = await db.searchTodos(query);
      sendJson(res, 200, { results });
      return true;
    }
    const results = await db.searchNotes(query);
    sendJson(res, 200, { results });
    return true;
  }

  const noteMatch = pathName.match(/^\/api\/notes\/([^/]+)$/);
  if (noteMatch) {
    const id = decodeURIComponent(noteMatch[1]);
    if (method === 'GET') {
      const note = await db.getNote(id);
      if (!note) return sendJson(res, 404, { error: 'Note not found' }), true;
      return sendJson(res, 200, { note }), true;
    }
    if (method === 'PATCH') {
      const title = asString(data?.title);
      const bodyValue = asString(data?.body);
      if (title === undefined && bodyValue === undefined) {
        return sendJson(res, 400, { error: 'Provide title or body' }), true;
      }
      const note = await db.updateNote(id, title, bodyValue);
      if (!note) return sendJson(res, 404, { error: 'Note not found' }), true;
      return sendJson(res, 200, { note }), true;
    }
    if (method === 'DELETE') {
      const ok = await db.deleteNote(id);
      if (!ok) return sendJson(res, 404, { error: 'Note not found' }), true;
      return sendJson(res, 200, { ok: true }), true;
    }
  }

  if (noteMatch && method === 'POST' && pathName.endsWith('/tags')) {
    return false;
  }

  const noteTagsMatch = pathName.match(/^\/api\/notes\/([^/]+)\/tags$/);
  if (noteTagsMatch && method === 'POST') {
    const id = decodeURIComponent(noteTagsMatch[1]);
    const tag = asString(data?.tag);
    if (!tag) return sendJson(res, 400, { error: 'Missing tag' }), true;
    const ok = await db.addTag(id, tag);
    return ok ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Note or tag not found' }), true;
  }
  if (noteTagsMatch && method === 'DELETE') {
    const id = decodeURIComponent(noteTagsMatch[1]);
    const tag = new URL(req.url ?? '/', 'http://localhost').searchParams.get('tag');
    if (!tag) return sendJson(res, 400, { error: 'Missing tag' }), true;
    const ok = await db.removeTag(id, tag);
    return ok ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Tag not found' }), true;
  }

  const checklistMatch = pathName.match(/^\/api\/checklist-items\/([^/]+)$/);
  if (checklistMatch && method === 'PATCH') {
    const id = decodeURIComponent(checklistMatch[1]);
    const checked = asBoolean(data?.checked);
    const item = await db.toggleChecklistItem(id, checked);
    if (!item) return sendJson(res, 404, { error: 'Checklist item not found' }), true;
    return sendJson(res, 200, { item }), true;
  }
  if (checklistMatch && method === 'DELETE') {
    const id = decodeURIComponent(checklistMatch[1]);
    const ok = await db.deleteChecklistItem(id);
    return ok ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Checklist item not found' }), true;
  }

  const checklistForNoteMatch = pathName.match(/^\/api\/notes\/([^/]+)\/checklist-items$/);
  if (checklistForNoteMatch && method === 'POST') {
    const noteId = decodeURIComponent(checklistForNoteMatch[1]);
    const text = asString(data?.text);
    if (!text) return sendJson(res, 400, { error: 'Missing text' }), true;
    const checked = asBoolean(data?.checked) ?? false;
    const position = asNumber(data?.position) ?? 0;
    const item = await db.addChecklistItem(noteId, text, checked, position);
    if (!item) return sendJson(res, 404, { error: 'Note not found' }), true;
    return sendJson(res, 200, { item }), true;
  }

  const todoMatch = pathName.match(/^\/api\/todos\/([^/]+)$/);
  if (todoMatch) {
    const id = decodeURIComponent(todoMatch[1]);
    if (method === 'GET') {
      const todo = await db.getTodo(id);
      if (!todo) return sendJson(res, 404, { error: 'Todo not found' }), true;
      return sendJson(res, 200, { todo }), true;
    }
    if (method === 'PATCH') {
      const todo = await db.updateTodo(id, {
        title: asString(data?.title),
        description: asString(data?.description),
        status: asString(data?.status),
        priority: asNumber(data?.priority),
        dueDate: data?.dueDate === null ? null : asString(data?.dueDate),
      });
      if (!todo) return sendJson(res, 404, { error: 'Todo not found' }), true;
      return sendJson(res, 200, { todo }), true;
    }
    if (method === 'DELETE') {
      const ok = await db.deleteTodo(id);
      if (!ok) return sendJson(res, 404, { error: 'Todo not found' }), true;
      return sendJson(res, 200, { ok: true }), true;
    }
  }

  const todoNotesMatch = pathName.match(/^\/api\/todos\/([^/]+)\/notes$/);
  if (todoNotesMatch && method === 'POST') {
    const todoId = decodeURIComponent(todoNotesMatch[1]);
    const noteId = asString(data?.noteId);
    if (!noteId) return sendJson(res, 400, { error: 'Missing noteId' }), true;
    const ok = await db.linkTodoToNote(todoId, noteId);
    return ok ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Todo or note not found' }), true;
  }
  if (todoNotesMatch && method === 'DELETE') {
    const todoId = decodeURIComponent(todoNotesMatch[1]);
    const noteId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('noteId');
    if (!noteId) return sendJson(res, 400, { error: 'Missing noteId' }), true;
    const ok = await db.unlinkTodoFromNote(todoId, noteId);
    return ok ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Todo or note not found' }), true;
  }

  return false;
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getClientIp(req: http.IncomingMessage): string | undefined {
  const forwardedFor = getHeaderValue(req.headers['x-forwarded-for']);
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim();
  return req.socket.remoteAddress;
}

function isInitializeRequest(message: unknown): boolean {
  return !!message
    && typeof message === 'object'
    && !Array.isArray(message)
    && 'method' in message
    && message.method === 'initialize';
}

async function createTransport(): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  transport.onerror = error => {
    logError('mcp_transport_error', serializeError(error));
  };

  const server = createServer();
  await server.connect(transport);

  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
      logInfo('mcp_session_closed', { sessionId: transport.sessionId });
    }
  };

  return transport;
}

async function getTransport(req: http.IncomingMessage, parsedBody: unknown): Promise<StreamableHTTPServerTransport | undefined> {
  const sessionId = getHeaderValue(req.headers['mcp-session-id']);

  if (sessionId) {
    return transports.get(sessionId);
  }

  if (isInitializeRequest(parsedBody)) {
    return createTransport();
  }

  return undefined;
}

const httpServer = http.createServer(async (req, res) => {
  const start = Date.now();
  const requestId = createRequestId();
  const origin = getRequestOrigin(req.url, req.headers);
  const url = new URL(req.url ?? '/', origin);
  const method = req.method ?? 'GET';
  const path = url.pathname;
  let requestSummary = '';
  let mcpMetadata: Record<string, unknown> = {};
  let responseSession: string | number | readonly string[] | undefined;

  const writeHead = res.writeHead.bind(res);
  res.writeHead = function (this: http.ServerResponse, ...args: unknown[]) {
    const headersArg = typeof args[1] === 'object' ? args[1] : args[2];
    if (headersArg && !Array.isArray(headersArg)) {
      const headers = headersArg as http.OutgoingHttpHeaders;
      responseSession = headers['mcp-session-id'] || headers['Mcp-Session-Id'];
    }
    return writeHead(...args as Parameters<typeof res.writeHead>);
  } as typeof res.writeHead;

  const end = res.end.bind(res);
  res.end = function (this: http.ServerResponse, ...args: unknown[]) {
    const session = responseSession || this.getHeader('mcp-session-id');
    logInfo('http_request_end', {
      requestId,
      method,
      path,
      status: this.statusCode,
      durationMs: Date.now() - start,
      sessionId: session,
      ...mcpMetadata,
    });
    return end.apply(this, args as Parameters<typeof end>);
  } as typeof res.end;

  try {
    logInfo('http_request_start', {
      requestId,
      method,
      path,
      clientIp: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    // Health check
    if (path === '/health') {
      return sendJson(res, 200, { status: 'ok' });
    }

    if (path === '/' && method === 'GET') {
      if (await sendStaticFile(res, 'index.html')) return;
      return sendText(res, 404, 'Frontend not built');
    }

    if (path === '/app.css' && method === 'GET') {
      if (await sendStaticFile(res, 'app.css')) return;
    }

    if (path === '/app.js' && method === 'GET') {
      if (await sendStaticFile(res, 'app.js')) return;
    }

    if (path.startsWith('/api/')) {
      const handled = await handleApi(req, res, path);
      if (handled) return;
      return sendJson(res, 404, { error: 'Not found' });
    }

    // MCP endpoint
    if (path === '/mcp') {
      const body = await readBody(req);
      const parsedBody = body ? parseJsonBody(body) : undefined;
      requestSummary = describeMcpMessage(parsedBody);
      mcpMetadata = getMcpMetadata(parsedBody);
      const session = req.headers['mcp-session-id'] || '(none)';
      logInfo('mcp_request', {
        requestId,
        sessionId: session,
        bodyBytes: Buffer.byteLength(body),
        summary: requestSummary,
        ...mcpMetadata,
      });
      const transport = await getTransport(req, parsedBody);
      if (!transport) {
        logWarn('mcp_session_not_found', {
          requestId,
          sessionId: session,
          ...mcpMetadata,
        });
        const response = createJsonResponse(404, {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found. Send initialize without an Mcp-Session-Id header first.',
          },
          id: null,
        });
        res.writeHead(response.status, response.headers);
        return res.end(response.body);
      }

      await transport.handleRequest(req, res, parsedBody);
      if (transport.sessionId) {
        transports.set(transport.sessionId, transport);
      }
      return;
    }

    sendText(res, 404, 'Not found');
  } catch (err) {
    logError('request_error', {
      requestId,
      summary: requestSummary || undefined,
      ...mcpMetadata,
      ...serializeError(err),
    });
    if (!res.headersSent) {
      res.writeHead(500).end('Internal server error');
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  logInfo('server_start', {
    host: HOST,
    port: PORT,
    endpoint: `http://${HOST}:${PORT}/mcp`,
  });
});
