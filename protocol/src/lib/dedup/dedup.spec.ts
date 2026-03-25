import { describe, expect, it } from 'bun:test';
import { jaroWinkler, isCommonProvider, emailSimilarity, getPreset, type DedupPreset } from './dedup';

describe('jaroWinkler', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaroWinkler('hello', 'hello')).toBe(1.0);
  });

  it('returns 0.0 when both strings are empty', () => {
    expect(jaroWinkler('', '')).toBe(0.0);
  });

  it('returns 0.0 when one string is empty', () => {
    expect(jaroWinkler('hello', '')).toBe(0.0);
    expect(jaroWinkler('', 'hello')).toBe(0.0);
  });

  it('scores prefix-sharing strings higher (Winkler boost)', () => {
    const score = jaroWinkler('john', 'johnny');
    expect(score).toBeGreaterThan(0.85);
  });

  it('handles transpositions', () => {
    const score = jaroWinkler('martha', 'marhta');
    expect(score).toBeGreaterThan(0.95);
  });

  it('scores completely different strings low', () => {
    const score = jaroWinkler('abc', 'xyz');
    expect(score).toBeLessThan(0.5);
  });

  it('is case-sensitive (caller normalizes)', () => {
    const lower = jaroWinkler('john', 'john');
    const mixed = jaroWinkler('John', 'john');
    expect(lower).toBeGreaterThan(mixed);
  });
});

describe('isCommonProvider', () => {
  it('recognizes gmail.com', () => {
    expect(isCommonProvider('gmail.com')).toBe(true);
  });

  it('recognizes outlook.com', () => {
    expect(isCommonProvider('outlook.com')).toBe(true);
  });

  it('rejects custom domains', () => {
    expect(isCommonProvider('smith.dev')).toBe(false);
    expect(isCommonProvider('acme.com')).toBe(false);
  });
});

describe('emailSimilarity', () => {
  it('scores identical emails as 1.0', () => {
    expect(emailSimilarity('john@gmail.com', 'john@gmail.com', 0.25)).toBe(1.0);
  });

  it('scores only local-part for common providers', () => {
    const score = emailSimilarity('john.smith@gmail.com', 'johnsmith@yahoo.com', 0.25);
    // Domain mismatch ignored (both common), only local-part Jaro-Winkler
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('adds domain bonus for matching custom domains', () => {
    const withBonus = emailSimilarity('sarah@connor.io', 's.connor@connor.io', 0.25);
    const withoutBonus = emailSimilarity('sarah@connor.io', 's.connor@other.io', 0.25);
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('caps score at 1.0 after domain bonus', () => {
    const score = emailSimilarity('john@smith.dev', 'john@smith.dev', 0.25);
    expect(score).toBe(1.0);
  });

  it('gives no domain bonus when custom domains differ', () => {
    const score = emailSimilarity('john@smith.dev', 'john@doe.io', 0.25);
    // Same local-part, different custom domains — no bonus
    const localOnly = emailSimilarity('john@gmail.com', 'john@yahoo.com', 0.25);
    expect(score).toBeCloseTo(localOnly, 2);
  });
});

describe('getPreset', () => {
  it('returns conservative thresholds by default', () => {
    const preset = getPreset(undefined);
    expect(preset).toEqual({
      nameThreshold: 0.92,
      emailThreshold: 0.85,
      domainBonus: 0.25,
    });
  });

  it('returns null for "off"', () => {
    expect(getPreset('off')).toBeNull();
  });

  it('returns conservative preset', () => {
    const preset = getPreset('conservative');
    expect(preset?.nameThreshold).toBe(0.92);
  });

  it('returns balanced preset', () => {
    const preset = getPreset('balanced');
    expect(preset?.nameThreshold).toBe(0.85);
    expect(preset?.emailThreshold).toBe(0.75);
    expect(preset?.domainBonus).toBe(0.30);
  });

  it('returns aggressive preset', () => {
    const preset = getPreset('aggressive');
    expect(preset?.nameThreshold).toBe(0.78);
    expect(preset?.emailThreshold).toBe(0.65);
    expect(preset?.domainBonus).toBe(0.35);
  });

  it('defaults to conservative for unknown values', () => {
    const preset = getPreset('invalid');
    expect(preset?.nameThreshold).toBe(0.92);
  });
});
