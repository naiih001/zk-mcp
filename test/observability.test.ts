import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRequestId,
  getMcpMetadata,
  serializeError,
  structuredLogLine,
} from '../src/observability.js';

test('createRequestId creates a request-scoped identifier', () => {
  const id = createRequestId();

  assert.match(id, /^req_[0-9a-f-]{36}$/);
});

test('getMcpMetadata extracts safe JSON-RPC tool metadata without arguments', () => {
  const metadata = getMcpMetadata({
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
  });

  assert.deepEqual(metadata, {
    mcpMethod: 'tools/call',
    mcpId: 4,
    tool: 'create_note',
  });
  assert.equal(JSON.stringify(metadata).includes('Private title'), false);
});

test('getMcpMetadata summarizes batch requests without arguments', () => {
  assert.deepEqual(
    getMcpMetadata([
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 'two', method: 'resources/list', params: {} },
    ]),
    {
      batchSize: 2,
      mcpMethods: ['tools/list', 'resources/list'],
      mcpIds: [1, 'two'],
    },
  );
});

test('serializeError includes Prisma code when present', () => {
  const err = Object.assign(new Error('Prisma failure'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P1001',
  });

  assert.deepEqual(serializeError(err), {
    errorName: 'PrismaClientKnownRequestError',
    errorMessage: 'Prisma failure',
    prismaCode: 'P1001',
  });
});

test('structuredLogLine serializes one JSON log object', () => {
  const line = structuredLogLine('info', 'http_request_end', {
    requestId: 'req_123',
    status: 200,
  });

  const parsed = JSON.parse(line);
  assert.equal(parsed.level, 'info');
  assert.equal(parsed.event, 'http_request_end');
  assert.equal(parsed.requestId, 'req_123');
  assert.equal(parsed.status, 200);
  assert.equal(typeof parsed.timestamp, 'string');
}
);
