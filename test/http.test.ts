import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createJsonResponse,
  describeMcpMessage,
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

test('describeMcpMessage summarizes JSON-RPC requests without arguments', () => {
  assert.equal(
    describeMcpMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'create_note',
        arguments: {
          title: 'Private title',
          body: 'Private body',
        },
      },
    }),
    'method=tools/call id=4 tool=create_note',
  );
});

test('describeMcpMessage summarizes initialize and batch requests', () => {
  assert.equal(
    describeMcpMessage({
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: {},
    }),
    'method=initialize id=init-1',
  );

  assert.equal(
    describeMcpMessage([
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'resources/list', params: {} },
    ]),
    'batch=2 methods=tools/list,resources/list ids=1,2',
  );
});

test('describeMcpMessage reports empty and invalid bodies', () => {
  assert.equal(describeMcpMessage(undefined), 'body=(empty)');
  assert.equal(describeMcpMessage(null), 'body=(invalid-json)');
  assert.equal(describeMcpMessage('not-an-object'), 'body=(invalid-json)');
});
