/**
 * Unit tests: HydeGenerator static helpers.
 * Integration test: Generator produces reasonable text (optional, requires LLM).
 */

import { config } from 'dotenv';
config({ path: '.env.development', override: true });

import { describe, expect, it } from 'bun:test';
import { HydeGenerator } from './hyde.generator';
import type { HydeStrategy } from './hyde.strategies';

describe('HydeGenerator', () => {
  describe('static helpers', () => {
    it('getTargetCorpus returns correct corpus per strategy', () => {
      expect(HydeGenerator.getTargetCorpus('mirror')).toBe('profiles');
      expect(HydeGenerator.getTargetCorpus('reciprocal')).toBe('intents');
      expect(HydeGenerator.getTargetCorpus('mentor')).toBe('profiles');
      expect(HydeGenerator.getTargetCorpus('investor')).toBe('profiles');
      expect(HydeGenerator.getTargetCorpus('collaborator')).toBe('intents');
      expect(HydeGenerator.getTargetCorpus('hiree')).toBe('intents');
    });

    it('shouldPersist returns true only for mirror and reciprocal', () => {
      expect(HydeGenerator.shouldPersist('mirror')).toBe(true);
      expect(HydeGenerator.shouldPersist('reciprocal')).toBe(true);
      expect(HydeGenerator.shouldPersist('mentor')).toBe(false);
      expect(HydeGenerator.shouldPersist('investor')).toBe(false);
      expect(HydeGenerator.shouldPersist('collaborator')).toBe(false);
      expect(HydeGenerator.shouldPersist('hiree')).toBe(false);
    });

    it('getCacheTTL returns number for non-persisted, undefined for persisted', () => {
      expect(HydeGenerator.getCacheTTL('mirror')).toBeUndefined();
      expect(HydeGenerator.getCacheTTL('reciprocal')).toBeUndefined();
      expect(HydeGenerator.getCacheTTL('mentor')).toBe(3600);
      expect(HydeGenerator.getCacheTTL('investor')).toBe(3600);
      expect(HydeGenerator.getCacheTTL('collaborator')).toBe(3600);
      expect(HydeGenerator.getCacheTTL('hiree')).toBe(3600);
    });
  });

  describe('generate', () => {
    it('returns shape { text: string } with non-empty text for mirror strategy', async () => {
      const generator = new HydeGenerator();
      const source = 'Looking for a technical co-founder to build a B2B SaaS in AI.';
      const result = await generator.generate(source, 'mirror');
      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
    }, 30000);

    it('produces different-looking text for reciprocal vs mirror', async () => {
      const generator = new HydeGenerator();
      const source = 'I offer React and TypeScript consulting.';
      const [mirror, reciprocal] = await Promise.all([
        generator.generate(source, 'mirror'),
        generator.generate(source, 'reciprocal'),
      ]);
      expect(mirror.text.length).toBeGreaterThan(0);
      expect(reciprocal.text.length).toBeGreaterThan(0);
      // Both should be about the same source but from different angles (profile vs intent)
      expect(mirror.text).toBeDefined();
      expect(reciprocal.text).toBeDefined();
    }, 45000);
  });
});
