import type { IncomingHttpHeaders } from 'node:http';

export function getRequestOrigin(reqUrl: string | undefined, headers: IncomingHttpHeaders): string {
  const proto = (headers['x-forwarded-proto'] as string) || 'http';
  const url = new URL(reqUrl ?? '/', `${proto}://${headers.host}`);
  return `${url.protocol}//${url.host}`;
}

export function isAuthorized(authorizationHeader: string | undefined, authToken: string | undefined): boolean {
  return !authToken || authorizationHeader === `Bearer ${authToken}`;
}

export function shouldExposeOAuth(authToken: string | undefined): boolean {
  return !!authToken;
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}

export function parseAllowedRedirectOrigins(value: string | undefined): string[] {
  const origins = (value ?? 'https://claude.ai')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
    .flatMap(origin => {
      try {
        const url = new URL(origin);
        return url.protocol === 'https:' ? [`${url.protocol}//${url.host}`] : [];
      } catch {
        return [];
      }
    });

  return [...new Set(origins)];
}

export function authorizationRedirectLocation(
  url: URL,
  fallbackRedirectUri: string,
  code: string,
  allowedRedirectOrigins = parseAllowedRedirectOrigins(undefined),
): string | null {
  const redirectUri = url.searchParams.get('redirect_uri') || fallbackRedirectUri;
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(redirectUri);
  } catch {
    return null;
  }

  if (redirectUrl.protocol !== 'https:' || !allowedRedirectOrigins.includes(redirectUrl.origin)) {
    return null;
  }

  redirectUrl.searchParams.set('code', code);
  redirectUrl.searchParams.set('state', url.searchParams.get('state') || '');
  return redirectUrl.toString();
}

export function oauthAccessToken(authToken: string | undefined, generatedToken: string): string {
  return authToken || generatedToken;
}

export function parseJsonObject(body: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function tokenResponse(accessToken: string, refreshToken: string) {
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 86400,
    refresh_token: refreshToken,
  };
}
