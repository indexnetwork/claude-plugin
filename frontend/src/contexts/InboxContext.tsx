'use client';

import { createContext, useContext, ReactNode } from 'react';

interface InboxContextType {
  activeTab: 'discover' | 'requests' | 'history';
  setActiveTab: (tab: 'discover' | 'requests' | 'history') => void;
  requestsView: 'received' | 'sent' | 'history';
  setRequestsView: (view: 'received' | 'sent' | 'history') => void;
  inboxConnectionsCount: number;
  pendingConnectionsCount: number;
  historyConnectionsCount: number;
  connectionsLoading: boolean;
  discoverStakesCount: number;
}

const InboxContext = createContext<InboxContextType | undefined>(undefined);

// Global state store for inbox context (used when provider wraps siblings)
let globalInboxState: InboxContextType | null = null;

export function setGlobalInboxState(state: InboxContextType | null) {
  globalInboxState = state;
}

export function InboxProvider({ 
  children, 
  value 
}: { 
  children: ReactNode; 
  value: InboxContextType;
}) {
  // Update global state when value changes
  setGlobalInboxState(value);

  return (
    <InboxContext.Provider value={value}>
      {children}
    </InboxContext.Provider>
  );
}

export function useInboxContext() {
  const context = useContext(InboxContext);
  // If context exists (we're inside provider), use it
  if (context) return context;
  // Otherwise, use global state (for sibling components)
  return globalInboxState || undefined;
}
