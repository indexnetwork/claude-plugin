'use client';

import { use, useState, useCallback } from 'react';
import ClientLayout from '@/components/ClientLayout';
import DiscoveryForm, { MentionUser } from '@/components/DiscoveryForm';
import OpportunityCard from '@/components/OpportunityCard';
import { useAdmin, useIndexes } from '@/contexts/APIContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { DiscoveredOpportunity } from '@/services/admin';
import { Loader2, Sparkles } from 'lucide-react';

// Quick action suggestions
const QUICK_ACTIONS = [
  { label: 'Hot opportunities', prompt: 'Find the most promising opportunities right now' },
  { label: 'Investors', prompt: 'Find investors and funding opportunities' },
  { label: 'Advisors', prompt: 'Find advisors and mentors' },
  { label: 'Collaborators', prompt: 'Find potential collaborators with similar interests' },
];

export default function OpportunitiesPage({ params }: { params: Promise<{ indexId: string }> }) {
  const { indexId } = use(params);
  const adminService = useAdmin();
  const indexesService = useIndexes();
  const { error: showError } = useNotifications();

  // State
  const [opportunities, setOpportunities] = useState<DiscoveredOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);

  // Search members for @mention
  const handleMentionSearch = useCallback(async (query: string): Promise<MentionUser[]> => {
    if (!query.trim()) return [];
    
    try {
      const users = await indexesService.searchUsers(query, indexId);
      return users.map(u => ({
        id: u.id,
        name: u.name,
        avatar: u.avatar
      }));
    } catch (err) {
      console.error('Member search failed:', err);
      return [];
    }
  }, [indexesService, indexId]);

  // Handle prompt submission
  const handlePromptSubmit = useCallback(async (prompt: string, currentMentions: MentionUser[]) => {
    if (!prompt.trim()) {
      showError('Please enter a prompt');
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setDismissedIds(new Set());

    try {
      const memberIds = currentMentions.length > 0 
        ? currentMentions.map(m => m.id)
        : undefined; // If no mentions, backend will use all index members

      const response = await adminService.discoverOpportunities(indexId, {
        prompt,
        memberIds,
        limit: 20
      });

      setOpportunities(response.opportunities);
    } catch (err) {
      console.error('Opportunity discovery failed:', err);
      showError(err instanceof Error ? err.message : 'Failed to discover opportunities');
      setOpportunities([]);
    } finally {
      setIsLoading(false);
    }
  }, [adminService, indexId, showError]);

  // Handle quick action click
  const handleQuickAction = (prompt: string) => {
    handlePromptSubmit(prompt, mentions);
  };

  // Handle dismiss
  const handleDismiss = (opportunity: DiscoveredOpportunity) => {
    const id = `${opportunity.sourceUser.id}-${opportunity.targetUser.id}`;
    setDismissedIds(prev => new Set([...prev, id]));
  };

  // Filter out dismissed opportunities
  const visibleOpportunities = opportunities.filter(opp => {
    const id = `${opp.sourceUser.id}-${opp.targetUser.id}`;
    return !dismissedIds.has(id);
  });

  return (
    <ClientLayout>
      <div className="w-full border border-gray-800 rounded-md px-2 sm:px-4 py-4 sm:py-8" style={{
        backgroundImage: 'url(/grid.png)',
        backgroundColor: 'white',
        backgroundSize: '888px'
      }}>
        {/* Header */}
        <div className="bg-white border border-b-2 border-gray-800 mb-6">
          <div className="py-4 px-2 sm:px-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-gray-700" />
              <h2 className="text-2xl font-bold text-gray-900 font-ibm-plex-mono">
                Opportunities
              </h2>
            </div>
            <p className="text-sm text-gray-500 font-ibm-plex-mono">
              Discover opportunities for your members using natural language
            </p>
          </div>
        </div>

        {/* Discovery Form */}
        <div className="mb-4">
          <DiscoveryForm
            enableMentions={true}
            onMentionSearch={handleMentionSearch}
            mentions={mentions}
            onMentionsChange={setMentions}
            onPromptSubmit={handlePromptSubmit}
            placeholder="Find investors for @member, or try 'hot opportunities'..."
          />
        </div>

        {/* Quick Actions */}
        <div className="mb-6 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action.prompt)}
              disabled={isLoading}
              className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded text-xs font-ibm-plex-mono text-gray-700 hover:bg-gray-200 hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex flex-col justify-center items-center py-12 bg-white border border-b-2 border-gray-800">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-3" />
            <p className="text-sm text-gray-500 font-ibm-plex-mono">
              Discovering opportunities...
            </p>
          </div>
        ) : hasSearched && visibleOpportunities.length === 0 ? (
          <div className="text-center py-12 bg-white border border-b-2 border-gray-800">
            <p className="text-gray-500 font-ibm-plex-mono">
              No opportunities found. Try a different prompt or add more members.
            </p>
          </div>
        ) : visibleOpportunities.length > 0 ? (
          <div className="space-y-2">
            {visibleOpportunities.map((opp, index) => (
              <OpportunityCard
                key={`${opp.sourceUser.id}-${opp.targetUser.id}-${index}`}
                opportunity={opp}
                onDismiss={() => handleDismiss(opp)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white border border-b-2 border-gray-800">
            <p className="text-gray-500 font-ibm-plex-mono">
              Enter a prompt above to discover opportunities for your members
            </p>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
