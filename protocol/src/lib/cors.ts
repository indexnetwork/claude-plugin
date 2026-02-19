const isDev = () => process.env.NODE_ENV === 'development' || process.env.ENV === 'dev';

export function getTrustedOrigins(): string[] {
  if (isDev()) {
    return ['http://localhost:*', 'http://127.0.0.1:*'];
  }
  return [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    process.env.EVALUATOR_URL || 'http://localhost:3002',
  ].filter(Boolean);
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
    'Access-Control-Expose-Headers': 'X-Session-Id',
    'Access-Control-Max-Age': '86400',
  };

  if (isDev()) {
    headers['Access-Control-Allow-Origin'] = '*';
  } else {
    const origin = req.headers.get('Origin') ?? '';
    const trusted = getTrustedOrigins();
    if (trusted.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
  }

  return headers;
}
