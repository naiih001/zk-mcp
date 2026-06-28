import 'dotenv/config';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';
const AUTH_TOKEN = process.env.AUTH_TOKEN;

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

const server = createServer();
await server.connect(transport);

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
  try {
    const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
    const url = new URL(req.url ?? '/', `${proto}://${req.headers.host}`);
    const origin = `${url.protocol}//${url.host}`;
    const method = req.method ?? 'GET';

    // OAuth protected resource metadata (RFC 9728)
    if (method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
      return json(res, 200, {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
      });
    }

    // OAuth authorization server metadata (RFC 8414)
    if (method === 'GET' && url.pathname === '/.well-known/oauth-authorization-server') {
      return json(res, 200, {
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    }

    // DCR — auto-approve any registration
    if (method === 'POST' && url.pathname === '/register') {
      JSON.parse(await readBody(req));
      return json(res, 201, {
        client_id: 'zk-mcp',
        client_secret_expires_at: 0,
        client_id_issued_at: Math.floor(Date.now() / 1000),
      });
    }

    // Authorize — auto-redirect to claude.ai
    if (method === 'GET' && url.pathname === '/authorize') {
      const redirectUri = url.searchParams.get('redirect_uri') || 'https://claude.ai/api/mcp/auth_callback';
      const state = url.searchParams.get('state') || '';
      const location = `${redirectUri}?code=${randomUUID()}&state=${encodeURIComponent(state)}`;
      res.writeHead(302, { Location: location });
      return res.end();
    }

    // Token exchange — issue a fake token
    if (method === 'POST' && url.pathname === '/token') {
      new URLSearchParams(await readBody(req));
      return json(res, 200, {
        access_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 86400,
        refresh_token: randomUUID(),
      });
    }

    // Health check
    if (url.pathname === '/health') {
      return json(res, 200, { status: 'ok' });
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      if (AUTH_TOKEN && req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
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
    console.error('Request error:', err);
    if (!res.headersSent) {
      res.writeHead(500).end('Internal server error');
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  console.error(`zk-mcp server listening on http://${HOST}:${PORT}/mcp`);
});
