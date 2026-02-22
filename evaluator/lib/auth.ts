import { jwtVerify, createRemoteJWKSet } from 'jose';

const PROTOCOL_URL = process.env.NEXT_PUBLIC_PROTOCOL_URL || "http://localhost:3001";
const JWKS = createRemoteJWKSet(
  new URL(`${PROTOCOL_URL}/api/auth/jwks`)
);

export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    const { payload } = await jwtVerify(token, JWKS);
    return (payload.id as string) ?? null;
  } catch {
    return null;
  }
}
