import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/**
 * Verifies an inbound Index Network webhook and returns the parsed payload.
 *
 * Expects:
 * - Body: JSON wrapper `{ event, payload, timestamp }` (signed as a single string)
 * - Header `x-index-signature: sha256=<hex>` — HMAC-SHA256 of the raw body
 * - Header `x-index-event: <event>` — must match `expectedEvent`
 *
 * Returns the inner `payload` on success, `null` on any verification failure.
 * Uses timing-safe comparison and never throws.
 *
 * @typeParam T - Shape of the inner `payload` object expected by the caller.
 *   No runtime validation is performed — callers must treat the returned
 *   value as untrusted input.
 * @param req - Raw incoming HTTP request. Both headers and the body stream
 *   are consumed.
 * @param secret - Shared HMAC-SHA256 secret. An empty string short-circuits
 *   to `null` so a missing secret cannot be validated-away.
 * @param expectedEvent - Event name the caller requires. Must match both the
 *   `x-index-event` header and the `event` field in the JSON wrapper.
 * @returns The inner `payload` on success, or `null` on any verification
 *   failure (bad signature, wrong event, malformed body, etc.). Never throws.
 */
export async function verifyAndParse<T = unknown>(
  req: IncomingMessage,
  secret: string,
  expectedEvent: string,
): Promise<T | null> {
  if (!secret) return null;

  const signatureHeader = headerValue(req, 'x-index-signature');
  const eventHeader = headerValue(req, 'x-index-event');
  if (!signatureHeader || !eventHeader) return null;
  if (eventHeader !== expectedEvent) return null;

  const rawBody = await readRawBody(req);

  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!timingSafeEqualStrings(signatureHeader, expected)) return null;

  let wrapper: unknown;
  try {
    wrapper = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }

  if (
    typeof wrapper !== 'object' ||
    wrapper === null ||
    !('payload' in wrapper) ||
    !('event' in wrapper)
  ) {
    return null;
  }

  const w = wrapper as { event: unknown; payload: unknown };
  if (w.event !== expectedEvent) return null;

  return w.payload as T;
}

function headerValue(req: IncomingMessage, name: string): string | null {
  const raw = req.headers[name.toLowerCase()];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0] ?? null;
  return null;
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err: Error) => reject(err));
  });
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
