import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizationRedirectLocation,
  authorizationServerMetadata,
  getRequestOrigin,
  isAuthorized,
  protectedResourceMetadata,
  tokenResponse,
} from '../src/http.js';

test('getRequestOrigin prefers forwarded protocol for deployed hosts', () => {
  assert.equal(
    getRequestOrigin('/mcp', {
      host: 'zk.example.com',
      'x-forwarded-proto': 'https',
    }),
    'https://zk.example.com',
  );
});

test('getRequestOrigin defaults to http without forwarded protocol', () => {
  assert.equal(
    getRequestOrigin('/health', {
      host: 'localhost:3100',
    }),
    'http://localhost:3100',
  );
});

test('isAuthorized allows all requests when no auth token is configured', () => {
  assert.equal(isAuthorized(undefined, undefined), true);
  assert.equal(isAuthorized('Bearer anything', undefined), true);
});

test('isAuthorized requires exact bearer token when auth token is configured', () => {
  assert.equal(isAuthorized('Bearer secret', 'secret'), true);
  assert.equal(isAuthorized('Bearer wrong', 'secret'), false);
  assert.equal(isAuthorized(undefined, 'secret'), false);
});

test('OAuth metadata is derived from the request origin', () => {
  assert.deepEqual(protectedResourceMetadata('https://zk.example.com'), {
    resource: 'https://zk.example.com/mcp',
    authorization_servers: ['https://zk.example.com'],
  });

  assert.deepEqual(authorizationServerMetadata('https://zk.example.com'), {
    issuer: 'https://zk.example.com',
    authorization_endpoint: 'https://zk.example.com/authorize',
    token_endpoint: 'https://zk.example.com/token',
    registration_endpoint: 'https://zk.example.com/register',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  });
});

test('authorizationRedirectLocation preserves redirect URI and encoded state', () => {
  const url = new URL('https://zk.example.com/authorize?redirect_uri=https://claude.ai/callback&state=a b+c');

  assert.equal(
    authorizationRedirectLocation(url, 'https://fallback.example.com/callback', 'code-123'),
    'https://claude.ai/callback?code=code-123&state=a%20b%20c',
  );
});

test('authorizationRedirectLocation falls back to claude callback when redirect URI is missing', () => {
  const url = new URL('https://zk.example.com/authorize?state=abc');

  assert.equal(
    authorizationRedirectLocation(url, 'https://claude.ai/api/mcp/auth_callback', 'code-123'),
    'https://claude.ai/api/mcp/auth_callback?code=code-123&state=abc',
  );
});

test('tokenResponse returns bearer token payload expected by OAuth clients', () => {
  assert.deepEqual(tokenResponse('access-token', 'refresh-token'), {
    access_token: 'access-token',
    token_type: 'Bearer',
    expires_in: 86400,
    refresh_token: 'refresh-token',
  });
});
