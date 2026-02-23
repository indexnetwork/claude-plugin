import { describe, expect, it } from 'bun:test';
import { generatePrivateKey } from 'viem/accounts';

import { createSigner, extractText } from '../xmtp.client';

describe('createSigner', () => {
  const privateKey = generatePrivateKey();
  const signer = createSigner(privateKey);

  it('should return a signer with type EOA', () => {
    expect(signer.type).toBe('EOA');
  });

  it('should return a lowercase Ethereum address as identifier', () => {
    const identity = signer.getIdentifier();
    expect(identity.identifier).toMatch(/^0x[0-9a-f]{40}$/);
    expect(identity.identifierKind).toBe(0);
  });

  it('should produce a deterministic address for the same key', () => {
    const signer2 = createSigner(privateKey);
    expect(signer.getIdentifier().identifier).toBe(signer2.getIdentifier().identifier);
  });

  it('should sign a message and return bytes', async () => {
    const sig = await signer.signMessage('hello');
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBeGreaterThan(0);
  });
});

describe('extractText', () => {
  const textContentType = { authorityId: 'xmtp.org', typeId: 'text', versionMajor: 1, versionMinor: 0 };
  const reactionContentType = { authorityId: 'xmtp.org', typeId: 'reaction', versionMajor: 1, versionMinor: 0 };

  it('should return text content from an XMTP text message', () => {
    const msg = { content: 'hello world', contentType: textContentType };
    expect(extractText(msg)).toBe('hello world');
  });

  it('should return string content even without text contentType', () => {
    const msg = { content: 'fallback text', contentType: reactionContentType };
    expect(extractText(msg)).toBe('fallback text');
  });

  it('should return empty string for non-string content with non-text type', () => {
    const msg = { content: { type: 'attachment' }, contentType: reactionContentType };
    expect(extractText(msg)).toBe('');
  });

  it('should return empty string for null content', () => {
    const msg = { content: null, contentType: reactionContentType };
    expect(extractText(msg)).toBe('');
  });
});
