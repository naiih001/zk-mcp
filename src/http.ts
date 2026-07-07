import type { IncomingHttpHeaders } from 'node:http';

export function getRequestOrigin(reqUrl: string | undefined, headers: IncomingHttpHeaders): string {
  const proto = (headers['x-forwarded-proto'] as string) || 'http';
  const host = headers.host || 'localhost';
  const url = new URL(reqUrl ?? '/', `${proto}://${host}`);
  return `${url.protocol}//${url.host}`;
}

export function parseJsonBody(body: string): unknown | null {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

export function createJsonResponse(status: number, data: unknown) {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function describeJsonRpcRequest(message: unknown): string {
  if (!isJsonObject(message)) {
    return 'body=(invalid-json)';
  }

  const method = typeof message.method === 'string' ? message.method : '(unknown)';
  const id = typeof message.id === 'string' || typeof message.id === 'number'
    ? String(message.id)
    : '(none)';
  const params = isJsonObject(message.params) ? message.params : undefined;
  const tool = method === 'tools/call' && typeof params?.name === 'string'
    ? ` tool=${params.name}`
    : '';

  return `method=${method} id=${id}${tool}`;
}

export function describeMcpMessage(message: unknown | undefined): string {
  if (message === undefined) {
    return 'body=(empty)';
  }

  if (Array.isArray(message)) {
    const methods = message
      .map(item => isJsonObject(item) && typeof item.method === 'string' ? item.method : '(unknown)')
      .join(',');
    const ids = message
      .map(item => {
        if (!isJsonObject(item)) return '(none)';
        return typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : '(none)';
      })
      .join(',');

    return `batch=${message.length} methods=${methods} ids=${ids}`;
  }

  return describeJsonRpcRequest(message);
}
