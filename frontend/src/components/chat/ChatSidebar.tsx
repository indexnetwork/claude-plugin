'use client';

import { useEffect, useRef, useCallback } from 'react';
import Talk from 'talkjs';
import { useTalkJS } from '@/contexts/TalkJSContext';
import { MessageSquare } from 'lucide-react';

export default function ChatSidebar() {
  const { session, isReady, openChat } = useTalkJS();
  const containerRef = useRef<HTMLDivElement>(null);
  const inboxRef = useRef<Talk.Inbox | null>(null);

  const handleConversationSelected = useCallback(
    (event: Talk.InboxSelectConversationEvent) => {
      // Prevent default navigation
      event.preventDefault?.();

      const conversation = event.conversation;
      if (!conversation) return;

      // Get the other participant
      const others = Object.values(event.others || {});
      if (others.length > 0) {
        const other = others[0];
        openChat(other.id, other.name || 'User', other.photoUrl || undefined);
      }
    },
    [openChat]
  );

  useEffect(() => {
    if (!isReady || !session || !containerRef.current) return;

    // Create inbox
    const inbox = session.createInbox({
      showFeedHeader: false,
      showChatHeader: false,
      showMobileBackButton: false,
      feedFilter: { custom: undefined },
    });

    inbox.on('selectConversation', handleConversationSelected);

    inbox.mount(containerRef.current);
    inboxRef.current = inbox;

    return () => {
      inbox.destroy();
      inboxRef.current = null;
    };
  }, [isReady, session, handleConversationSelected]);

  if (!isReady) {
    return (
      <div className="bg-white rounded-sm border-black border p-4 h-full">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-gray-600" />
          <h2 className="font-bold text-sm text-black font-ibm-plex-mono">Messages</h2>
        </div>
        <div className="text-center text-gray-500 text-sm py-8">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-sm border-black border overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-gray-200">
        <MessageSquare className="w-5 h-5 text-gray-600" />
        <h2 className="font-bold text-sm text-black font-ibm-plex-mono">Messages</h2>
      </div>
      <div ref={containerRef} className="flex-1 min-h-[300px]" />
    </div>
  );
}

