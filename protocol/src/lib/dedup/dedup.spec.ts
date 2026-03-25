import { describe, expect, it } from 'bun:test';
import { jaroWinkler } from './dedup';

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
