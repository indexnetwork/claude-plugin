/**
 * Minimal Node IncomingMessage simulator for unit-testing HTTP route handlers.
 * Real IncomingMessage extends Readable; the verifier only needs `headers` and
 * the ability to read the body via `req.on('data', ...)` + `req.on('end', ...)`.
 */

import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';

export function mockRequest(opts: {
  headers: Record<string, string>;
  body: string | Buffer;
}): IncomingMessage {
  const emitter = new EventEmitter() as EventEmitter & {
    headers: Record<string, string>;
  };
  emitter.headers = opts.headers;
  const bodyBuffer = typeof opts.body === 'string' ? Buffer.from(opts.body, 'utf8') : opts.body;

  queueMicrotask(() => {
    emitter.emit('data', bodyBuffer);
    emitter.emit('end');
  });

  return emitter as unknown as IncomingMessage;
}
