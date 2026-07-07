import 'dotenv/config';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import {
  authorizationRedirectLocation,
  authorizationServerMetadata,
  getRequestOrigin,
  isAuthorized,
  oauthAccessToken,
  parseAllowedRedirectOrigins,
  parseJsonObject,
  protectedResourceMetadata,
  tokenResponse,
} from './http.js';

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const ALLOWED_REDIRECT_ORIGINS = parseAllowedRedirectOrigins(process.env.OAUTH_ALLOWED_REDIRECT_ORIGINS);

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

function json(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
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

  const end = res.end.bind(res);
  res.end = function (this: http.ServerResponse, ...args: unknown[]) {
    log(`${method} ${path} → ${this.statusCode} (${Date.now() - start}ms)`);
    return end.apply(this, args as Parameters<typeof end>);
  } as typeof res.end;

  try {
    // OAuth protected resource metadata (RFC 9728)
    if (method === 'GET' && path === '/.well-known/oauth-protected-resource') {
      log('oauth: protected-resource metadata');
      return json(res, 200, protectedResourceMetadata(origin));
    }

    // OAuth authorization server metadata (RFC 8414)
    if (method === 'GET' && path === '/.well-known/oauth-authorization-server') {
      log('oauth: authorization-server metadata');
      return json(res, 200, authorizationServerMetadata(origin));
    }

    // DCR — auto-approve any registration
    if (method === 'POST' && path === '/register') {
      log('oauth: dcr registration');
      if (!parseJsonObject(await readBody(req))) {
        return json(res, 400, { error: 'invalid_client_metadata' });
      }
      return json(res, 201, {
        client_id: 'zk-mcp',
        client_secret_expires_at: 0,
        client_id_issued_at: Math.floor(Date.now() / 1000),
      });
    }

    // Authorize — auto-redirect to claude.ai
    if (method === 'GET' && path === '/authorize') {
      log('oauth: authorize redirect');
      const location = authorizationRedirectLocation(
        url,
        'https://claude.ai/api/mcp/auth_callback',
        randomUUID(),
        ALLOWED_REDIRECT_ORIGINS,
      );
      if (!location) {
        return json(res, 403, { error: 'invalid_redirect_uri' });
      }
      res.writeHead(302, { Location: location });
      return res.end();
    }

    // Token exchange — issue the configured MCP bearer token when present.
    if (method === 'POST' && path === '/token') {
      log('oauth: token exchange');
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      if (!params.get('grant_type')) {
        return json(res, 400, { error: 'invalid_request' });
      }
      return json(res, 200, tokenResponse(oauthAccessToken(AUTH_TOKEN, randomUUID()), randomUUID()));
    }

    // Health check
    if (path === '/health') {
      return json(res, 200, { status: 'ok' });
    }

    // MCP endpoint
    if (path === '/mcp') {
      const hasAuth = !!req.headers.authorization;
      log(`mcp request${hasAuth ? ' (auth)' : ' (no auth)'}`);

      if (!isAuthorized(req.headers.authorization, AUTH_TOKEN)) {
        res.writeHead(401, { 'WWW-Authenticate': `Bearer realm="${origin}/mcp"` });
        return res.end();
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
      return;
    }

    res.writeHead(404).end('Not found');
  } catch (err) {
    console.error(`[${new Date().toISOString().slice(11, 23)}] Request error:`, err);
    if (!res.headersSent) {
      res.writeHead(500).end('Internal server error');
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  console.error(`zk-mcp server listening on http://${HOST}:${PORT}/mcp`);
});
