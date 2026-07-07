import { randomUUID } from 'node:crypto';

type LogLevel = 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function jsonRpcId(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

export function createRequestId(): string {
  return `req_${randomUUID()}`;
}

export function getMcpMetadata(message: unknown): LogFields {
  if (Array.isArray(message)) {
    return {
      batchSize: message.length,
      mcpMethods: message.map(item => isJsonObject(item) && typeof item.method === 'string' ? item.method : '(unknown)'),
      mcpIds: message.map(item => isJsonObject(item) ? jsonRpcId(item.id) ?? null : null),
    };
  }

  if (!isJsonObject(message)) {
    return {};
  }

  const metadata: LogFields = {};
  if (typeof message.method === 'string') metadata.mcpMethod = message.method;
  const id = jsonRpcId(message.id);
  if (id !== undefined) metadata.mcpId = id;

  const params = isJsonObject(message.params) ? message.params : undefined;
  if (message.method === 'tools/call' && typeof params?.name === 'string') {
    metadata.tool = params.name;
  }

  return metadata;
}

export function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    const fields: LogFields = {
      errorName: err.name,
      errorMessage: err.message,
    };
    if ('code' in err && typeof err.code === 'string') {
      fields.prismaCode = err.code;
    }
    return fields;
  }

  return {
    errorName: typeof err,
    errorMessage: String(err),
  };
}

export function structuredLogLine(level: LogLevel, event: string, fields: LogFields = {}): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
}

export function logInfo(event: string, fields: LogFields = {}): void {
  console.error(structuredLogLine('info', event, fields));
}

export function logWarn(event: string, fields: LogFields = {}): void {
  console.error(structuredLogLine('warn', event, fields));
}

export function logError(event: string, fields: LogFields = {}): void {
  console.error(structuredLogLine('error', event, fields));
}
