/** Config */
import { config } from "dotenv";
config({ path: '.env.test' });

import { describe, it, expect, mock } from 'bun:test';
import {
  handleDiscoverOpportunities,
  type OpportunityJobDeps,
  type OpportunityJobDatabase,
} from '../opportunity.job';

describe('OpportunityJob', () => {
  describe('handleDiscoverOpportunities', () => {
    it('skips when intent not found', async () => {
      const getIntentForIndexing = mock(async () => null as unknown as Awaited<ReturnType<OpportunityJobDatabase['getIntentForIndexing']>>);
      const invokeOpportunityGraph = mock(async () => {});
      const deps: OpportunityJobDeps = {
        database: {
          getIntentForIndexing,
        },
        invokeOpportunityGraph,
      };
      await handleDiscoverOpportunities(
        { intentId: 'intent-1', userId: 'user-1' },
        deps
      );
      expect(getIntentForIndexing).toHaveBeenCalledWith('intent-1');
      expect(invokeOpportunityGraph).not.toHaveBeenCalled();
    });

    it('invokes opportunity graph with intent payload and options', async () => {
      const invokeOpportunityGraph = mock(async () => {});
      const deps: OpportunityJobDeps = {
        database: {
          getIntentForIndexing: mock(async () => ({
            id: 'intent-1',
            payload: 'Looking for ML engineers',
            userId: 'user-1',
            sourceType: null,
            sourceId: null,
          })),
        },
        invokeOpportunityGraph,
      };
      await handleDiscoverOpportunities(
        { intentId: 'intent-1', userId: 'user-1', indexIds: ['index-1'] },
        deps
      );
      expect(invokeOpportunityGraph).toHaveBeenCalledTimes(1);
      expect(invokeOpportunityGraph).toHaveBeenCalledWith({
        userId: 'user-1',
        searchQuery: 'Looking for ML engineers',
        operationMode: 'create',
        indexId: 'index-1',
        options: { initialStatus: 'latent' },
      });
    });

    it('passes undefined indexId when indexIds not provided', async () => {
      const invokeOpportunityGraph = mock(async () => {});
      const deps: OpportunityJobDeps = {
        database: {
          getIntentForIndexing: mock(async () => ({
            id: 'intent-1',
            payload: 'Some query',
            userId: 'user-1',
            sourceType: null,
            sourceId: null,
          })),
        },
        invokeOpportunityGraph,
      };
      await handleDiscoverOpportunities({ intentId: 'intent-1', userId: 'user-1' }, deps);
      expect(invokeOpportunityGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          searchQuery: 'Some query',
          indexId: undefined,
        })
      );
    });
  });
});
