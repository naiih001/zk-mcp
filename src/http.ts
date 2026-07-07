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
