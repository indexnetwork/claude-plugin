/**
 * Unit tests: HyDE strategy registry and config validity.
 */

import { describe, expect, it } from 'bun:test';
import { type HydeStrategy, HYDE_STRATEGIES } from './hyde.strategies';

const ALL_STRATEGIES: HydeStrategy[] = [
  'mirror',
  'reciprocal',
  'mentor',
  'investor',
  'collaborator',
  'hiree',
];

describe('HyDE Strategies', () => {
  it('should define all six strategies', () => {
    expect(Object.keys(HYDE_STRATEGIES).sort()).toEqual(ALL_STRATEGIES.slice().sort());
  });

  it('each strategy config should be valid', () => {
    for (const strategy of ALL_STRATEGIES) {
      const config = HYDE_STRATEGIES[strategy];
      expect(config).toBeDefined();
      expect(['profiles', 'intents']).toContain(config.targetCorpus);
      expect(typeof config.prompt).toBe('function');
      expect(typeof config.persist).toBe('boolean');
      const promptResult = config.prompt('Looking for a React co-founder');
      expect(typeof promptResult).toBe('string');
      expect(promptResult.length).toBeGreaterThan(0);
      expect(promptResult).toContain('Looking for a React co-founder');
      if (!config.persist) {
        expect(config.cacheTTL).toBeDefined();
        expect(typeof config.cacheTTL).toBe('number');
        expect(config.cacheTTL).toBeGreaterThan(0);
      }
    }
  });

  it('mirror and reciprocal should be persisted; others ephemeral', () => {
    expect(HYDE_STRATEGIES.mirror.persist).toBe(true);
    expect(HYDE_STRATEGIES.reciprocal.persist).toBe(true);
    expect(HYDE_STRATEGIES.mentor.persist).toBe(false);
    expect(HYDE_STRATEGIES.investor.persist).toBe(false);
    expect(HYDE_STRATEGIES.collaborator.persist).toBe(false);
    expect(HYDE_STRATEGIES.hiree.persist).toBe(false);
  });

  it('profile strategies should be mirror, mentor, investor', () => {
    expect(HYDE_STRATEGIES.mirror.targetCorpus).toBe('profiles');
    expect(HYDE_STRATEGIES.mentor.targetCorpus).toBe('profiles');
    expect(HYDE_STRATEGIES.investor.targetCorpus).toBe('profiles');
  });

  it('intent strategies should be reciprocal, collaborator, hiree', () => {
    expect(HYDE_STRATEGIES.reciprocal.targetCorpus).toBe('intents');
    expect(HYDE_STRATEGIES.collaborator.targetCorpus).toBe('intents');
    expect(HYDE_STRATEGIES.hiree.targetCorpus).toBe('intents');
  });

  it('prompt with context returns non-empty string', () => {
    const config = HYDE_STRATEGIES.mirror;
    const withContext = config.prompt('Build a SaaS', {
      category: 'startup',
      indexId: 'idx-1',
      customPrompt: 'Focus on B2B.',
    });
    expect(withContext).toContain('Build a SaaS');
    expect(withContext.length).toBeGreaterThan(0);
  });
});
