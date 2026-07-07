import 'dotenv/config';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import {
  createJsonResponse,
  describeMcpMessage,
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

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';

const transports = new Map<string, StreamableHTTPServerTransport>();

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
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
      const response = createJsonResponse(200, { status: 'ok' });
      res.writeHead(response.status, response.headers);
      return res.end(response.body);
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

    res.writeHead(404).end('Not found');
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
