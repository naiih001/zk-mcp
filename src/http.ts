import type { IncomingHttpHeaders } from 'node:http';

export function getRequestOrigin(reqUrl: string | undefined, headers: IncomingHttpHeaders): string {
  const proto = (headers['x-forwarded-proto'] as string) || 'http';
  const url = new URL(reqUrl ?? '/', `${proto}://${headers.host}`);
  return `${url.protocol}//${url.host}`;
}

export function isAuthorized(authorizationHeader: string | undefined, authToken: string | undefined): boolean {
  return !authToken || authorizationHeader === `Bearer ${authToken}`;
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

export function authorizationRedirectLocation(url: URL, fallbackRedirectUri: string, code: string): string {
  const redirectUri = url.searchParams.get('redirect_uri') || fallbackRedirectUri;
  const state = url.searchParams.get('state') || '';
  return `${redirectUri}?code=${code}&state=${encodeURIComponent(state)}`;
}

export function tokenResponse(accessToken: string, refreshToken: string) {
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 86400,
    refresh_token: refreshToken,
  };
}
