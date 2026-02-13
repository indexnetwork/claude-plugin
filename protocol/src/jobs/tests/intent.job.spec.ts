/** Config */
import { config } from "dotenv";
config({ path: '.env.test' });

import { describe, it, expect, mock } from 'bun:test';
import {
  handleGenerateHyde,
  handleDeleteHyde,
  type IntentJobDeps,
  type IntentJobDatabase,
} from '../intent.job';

describe('IntentJob', () => {
  describe('handleGenerateHyde', () => {
    it('skips when intent not found', async () => {
      const getIntentForIndexing = mock(async () => null as unknown as Awaited<ReturnType<IntentJobDatabase['getIntentForIndexing']>>);
      const deps: IntentJobDeps = {
        database: {
          getIntentForIndexing,
          getUserIndexIds: mock(async () => []),
          assignIntentToIndex: mock(async () => {}),
          deleteHydeDocumentsForSource: mock(async () => 0),
        },
        invokeHyde: mock(async () => {}),
        addOpportunityJob: mock(async () => ({ id: 'job-1' })),
      };
      await handleGenerateHyde({ intentId: 'intent-1', userId: 'user-1' }, deps);
      expect(getIntentForIndexing).toHaveBeenCalledWith('intent-1');
      expect(deps.invokeHyde).not.toHaveBeenCalled();
      expect(deps.addOpportunityJob).not.toHaveBeenCalled();
    });

    it('assigns intent to user indexes, invokes HyDE, and enqueues opportunity job', async () => {
      const getUserIndexIds = mock(async () => ['index-1', 'index-2']);
      const assignIntentToIndex = mock(async () => {});
      const invokeHyde = mock(async () => {});
      const addOpportunityJob = mock(async () => ({ id: 'job-1' }));
      const deps: IntentJobDeps = {
        database: {
          getIntentForIndexing: mock(async () => ({
            id: 'intent-1',
            payload: 'Looking for co-founders',
            userId: 'user-1',
            sourceType: null,
            sourceId: null,
          })),
          getUserIndexIds,
          assignIntentToIndex: assignIntentToIndex as IntentJobDatabase['assignIntentToIndex'],
          deleteHydeDocumentsForSource: mock(async () => 0),
        },
        invokeHyde,
        addOpportunityJob,
      };
      await handleGenerateHyde({ intentId: 'intent-1', userId: 'user-1' }, deps);
      expect(getUserIndexIds).toHaveBeenCalledWith('user-1');
      expect(assignIntentToIndex).toHaveBeenCalledTimes(2);
      expect(assignIntentToIndex).toHaveBeenCalledWith('intent-1', 'index-1');
      expect(assignIntentToIndex).toHaveBeenCalledWith('intent-1', 'index-2');
      expect(invokeHyde).toHaveBeenCalledTimes(1);
      expect(invokeHyde).toHaveBeenCalledWith({
        sourceText: 'Looking for co-founders',
        sourceType: 'intent',
        sourceId: 'intent-1',
        strategies: ['mirror', 'reciprocal'],
        forceRegenerate: true,
      });
      expect(addOpportunityJob).toHaveBeenCalledWith({ intentId: 'intent-1', userId: 'user-1' });
    });

    it('continues when getUserIndexIds throws and still invokes HyDE and enqueues opportunity', async () => {
      const getUserIndexIds = mock(async () => {
        throw new Error('DB error');
      });
      const invokeHyde = mock(async () => {});
      const addOpportunityJob = mock(async () => ({ id: 'job-1' }));
      const deps: IntentJobDeps = {
        database: {
          getIntentForIndexing: mock(async () => ({
            id: 'intent-1',
            payload: 'x',
            userId: 'user-1',
            sourceType: null,
            sourceId: null,
          })),
          getUserIndexIds: getUserIndexIds as IntentJobDatabase['getUserIndexIds'],
          assignIntentToIndex: mock(async () => {}),
          deleteHydeDocumentsForSource: mock(async () => 0),
        },
        invokeHyde,
        addOpportunityJob,
      };
      await handleGenerateHyde({ intentId: 'intent-1', userId: 'user-1' }, deps);
      expect(invokeHyde).toHaveBeenCalled();
      expect(addOpportunityJob).toHaveBeenCalled();
    });

    it('continues when assignIntentToIndex throws (e.g. duplicate)', async () => {
      const assignIntentToIndex = mock(async () => {
        throw new Error('duplicate key');
      });
      const invokeHyde = mock(async () => {});
      const addOpportunityJob = mock(async () => ({ id: 'job-1' }));
      const deps: IntentJobDeps = {
        database: {
          getIntentForIndexing: mock(async () => ({
            id: 'intent-1',
            payload: 'x',
            userId: 'user-1',
            sourceType: null,
            sourceId: null,
          })),
          getUserIndexIds: mock(async () => ['index-1']),
          assignIntentToIndex: assignIntentToIndex as IntentJobDatabase['assignIntentToIndex'],
          deleteHydeDocumentsForSource: mock(async () => 0),
        },
        invokeHyde,
        addOpportunityJob,
      };
      await handleGenerateHyde({ intentId: 'intent-1', userId: 'user-1' }, deps);
      expect(invokeHyde).toHaveBeenCalled();
      expect(addOpportunityJob).toHaveBeenCalled();
    });
  });

  describe('handleDeleteHyde', () => {
    it('calls deleteHydeDocumentsForSource with intent source', async () => {
      const deleteHydeDocumentsForSource = mock(async () => 0);
      const deps: { database: IntentJobDatabase } = {
        database: {
          getIntentForIndexing: mock(async () => null as unknown as Awaited<ReturnType<IntentJobDatabase['getIntentForIndexing']>>),
          getUserIndexIds: mock(async () => []),
          assignIntentToIndex: mock(async () => {}),
          deleteHydeDocumentsForSource,
        },
      };
      await handleDeleteHyde({ intentId: 'intent-1' }, deps);
      expect(deleteHydeDocumentsForSource).toHaveBeenCalledWith('intent', 'intent-1');
    });
  });
});
