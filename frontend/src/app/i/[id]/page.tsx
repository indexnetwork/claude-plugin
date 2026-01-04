"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { useAPI } from "@/contexts/APIContext";
import { useDiscoveryFilter } from "@/contexts/DiscoveryFilterContext";
import InboxContent from "@/components/InboxContent";
import { useNotifications } from "@/contexts/NotificationContext";
import { Loader2 } from "lucide-react";
import ClientLayout from "@/components/ClientLayout";

interface IntentPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function IntentPage({ params }: IntentPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthContext();
  const { intentsService } = useAPI();
  const { setDiscoveryIntents } = useDiscoveryFilter();
  const { error } = useNotifications();
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);

  // Redirect to landing if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch intent and set in context
  useEffect(() => {
    const fetchIntent = async () => {
      if (!isAuthenticated || authLoading) {
        return;
      }

      try {
        setIsLoading(true);
        setErrorState(null);
        
        const intent = await intentsService.getIntent(resolvedParams.id);
        
        // Set the intent in discovery filter context
        setDiscoveryIntents([{
          id: intent.id,
          payload: intent.payload,
          summary: intent.summary || undefined,
          createdAt: intent.createdAt
        }]);
        
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to fetch intent:', err);
        setErrorState('Intent not found');
        setIsLoading(false);
        error('Failed to load intent');
        // Redirect to root after a short delay
        setTimeout(() => {
          router.push('/');
        }, 2000);
      }
    };

    fetchIntent();
  }, [resolvedParams.id, isAuthenticated, authLoading, intentsService, setDiscoveryIntents, router, error]);

  // Show loading while checking auth or fetching intent
  if (authLoading || isLoading) {
    return (
      <ClientLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <p className="text-gray-600 font-ibm-plex-mono">Loading intent...</p>
          </div>
        </div>
      </ClientLayout>
    );
  }

  // Show error state
  if (errorState) {
    return (
      <ClientLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
            <p className="text-gray-600 mb-4">{errorState}</p>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 font-ibm-plex-mono"
            >
              Go to Inbox
            </button>
          </div>
        </div>
      </ClientLayout>
    );
  }

  // Render inbox content with intent filter
  return <InboxContent />;
}

