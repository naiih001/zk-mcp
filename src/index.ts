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

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

const server = createServer();
await server.connect(transport);

function ts() {
  return new Date().toISOString().slice(11, 23);
}

function log(msg: string) {
  console.error(`[${ts()}] ${msg}`);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

const httpServer = http.createServer(async (req, res) => {
  const start = Date.now();
  const origin = getRequestOrigin(req.url, req.headers);
  const url = new URL(req.url ?? '/', origin);
  const method = req.method ?? 'GET';
  const path = url.pathname;
  let requestSummary = '';
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
    const sessionInfo = session ? ` session=${session}` : '';
    const requestInfo = requestSummary ? ` ${requestSummary}` : '';
    log(`${method} ${path} -> ${this.statusCode}${sessionInfo}${requestInfo} (${Date.now() - start}ms)`);
    return end.apply(this, args as Parameters<typeof end>);
  } as typeof res.end;

  try {
    // Health check
    if (path === '/health') {
      const response = createJsonResponse(200, { status: 'ok' });
      res.writeHead(response.status, response.headers);
      return res.end(response.body);
    }

    // MCP endpoint
    if (path === '/mcp') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      const parsedBody = body ? parseJsonBody(body) : undefined;
      requestSummary = describeMcpMessage(parsedBody);
      const session = req.headers['mcp-session-id'] || '(none)';
      log(`mcp request ${requestSummary} session=${session} bytes=${Buffer.byteLength(body)}`);
      await transport.handleRequest(req, res, parsedBody);
      return;
    }

    res.writeHead(404).end('Not found');
  } catch (err) {
    const requestInfo = requestSummary ? ` ${requestSummary}` : '';
    console.error(`[${new Date().toISOString().slice(11, 23)}] Request error${requestInfo}:`, err);
    if (!res.headersSent) {
      res.writeHead(500).end('Internal server error');
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  console.error(`zk-mcp server listening on http://${HOST}:${PORT}/mcp`);
});
