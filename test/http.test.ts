import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createJsonResponse,
  getRequestOrigin,
  parseJsonBody,
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

test('getRequestOrigin defaults to localhost when host header is missing', () => {
  assert.equal(
    getRequestOrigin('/health', {}),
    'http://localhost',
  );
});

test('parseJsonBody parses JSON objects and arrays', () => {
  assert.deepEqual(parseJsonBody('{"hello":"world"}'), { hello: 'world' });
  assert.deepEqual(parseJsonBody('[1,2,3]'), [1, 2, 3]);
  assert.equal(parseJsonBody('not-json'), null);
});

test('createJsonResponse returns a JSON payload wrapper', () => {
  assert.deepEqual(createJsonResponse(200, { status: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '{"status":"ok"}',
  });
});
