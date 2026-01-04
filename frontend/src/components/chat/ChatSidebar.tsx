'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useStreamChat } from '@/contexts/StreamChatContext';
import { useInboxContext } from '@/contexts/InboxContext';
import { MessageSquare } from 'lucide-react';
import Image from 'next/image';
import { getAvatarUrl } from '@/lib/file-utils';

export default function ChatSidebar() {
  const pathname = usePathname();
  const isInboxPage = pathname === '/' || pathname?.startsWith('/i/');
  const inboxContext = useInboxContext();
  const { client, isReady, openChat, activeChatId, setActiveChat } = useStreamChat();
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch channels/conversations
  useEffect(() => {
    if (!isReady || !client) {
      setLoading(false);
      return;
    }

    const fetchChannels = async () => {
      try {
        // Get channels where current user is a member
        const filter = {
          type: 'messaging',
          members: { $in: [client.userID || ''] },
        };

        const sort = [{ last_message_at: -1 }];

        const response = await client.queryChannels(filter, sort, {
          watch: true,
          state: true,
          message_limit: 100,
          member_limit: 100,
        });

        setChannels(response);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching channels:', error);
        setLoading(false);
      }
    };

    fetchChannels();

    // Listen for new messages to update channel list
    const handleEvent = () => {
      fetchChannels();
    };

    client.on('message.new', handleEvent);
    client.on('channel.updated', handleEvent);

    return () => {
      client.off('message.new', handleEvent);
      client.off('channel.updated', handleEvent);
    };
  }, [isReady, client]);

  const handleChannelClick = useCallback(
    (channel: any) => {
      // Get the other member (not current user)
      const members = Object.values(channel.state.members || {});
      const otherMember = members.find(
        (m: any) => m.user?.id !== client?.userID
      ) as any;

      if (otherMember?.user) {
        // Open chat and set as active
        openChat(
          otherMember.user.id,
          otherMember.user.name || 'User',
          otherMember.user.image
        );
        setActiveChat(otherMember.user.id);
      }
    },
    [client, openChat, setActiveChat]
  );

  if (!isReady) {
    return (
      <div className="bg-white rounded-sm border-black border p-3">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-gray-600" />
          <h2 className="font-bold text-sm text-black font-ibm-plex-mono">Conversations</h2>
        </div>
        <div className="text-center text-gray-500 text-sm py-8">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-sm border-black border overflow-hidden flex flex-col">
      {/* Inbox Tabs - only show on inbox page */}
      {isInboxPage && inboxContext && (
        <>
          {/* View Requests button - show when on discover tab */}
          {inboxContext.activeTab === 'discover' && (
            <button
              onClick={() => inboxContext.setActiveTab('requests')}
              className="w-full font-ibm-plex-mono px-4 py-3 border-b-2 border-black flex items-center justify-between bg-white text-black hover:bg-gray-50 border-b border-gray-200"
            >
              <span>View Requests</span>
              {inboxContext.connectionsLoading ? (
                <span className="text-xs px-2 py-1 rounded bg-black text-white">
                  0
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded bg-black text-white">
                  {inboxContext.inboxConnectionsCount + inboxContext.pendingConnectionsCount + inboxContext.historyConnectionsCount}
                </span>
              )}
            </button>
          )}

          {/* Sub-tabs: Inbox, Sent, History - always visible when on inbox page */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => {
                inboxContext.setActiveTab('requests');
                inboxContext.setRequestsView('received');
              }}
              className={`flex-1 font-ibm-plex-mono px-4 py-2 border-r border-gray-200 flex items-center justify-center gap-2 ${
                inboxContext.activeTab === 'requests' && inboxContext.requestsView === 'received'
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-gray-50'
              }`}
            >
              Inbox
              {inboxContext.inboxConnectionsCount > 0 && (
                <span className={`text-xs px-2 py-1 rounded ${
                  inboxContext.activeTab === 'requests' && inboxContext.requestsView === 'received'
                    ? 'bg-white text-black'
                    : 'bg-black text-white'
                }`}>
                  {inboxContext.inboxConnectionsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                inboxContext.setActiveTab('requests');
                inboxContext.setRequestsView('sent');
              }}
              className={`flex-1 font-ibm-plex-mono px-4 py-2 border-r border-gray-200 flex items-center justify-center gap-2 ${
                inboxContext.activeTab === 'requests' && inboxContext.requestsView === 'sent'
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-gray-50'
              }`}
            >
              Sent
              {inboxContext.pendingConnectionsCount > 0 && (
                <span className={`text-xs px-2 py-1 rounded ${
                  inboxContext.activeTab === 'requests' && inboxContext.requestsView === 'sent'
                    ? 'bg-white text-black'
                    : 'bg-black text-white'
                }`}>
                  {inboxContext.pendingConnectionsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                inboxContext.setActiveTab('requests');
                inboxContext.setRequestsView('history');
              }}
              className={`flex-1 font-ibm-plex-mono px-4 py-2 flex items-center justify-center gap-2 ${
                inboxContext.activeTab === 'requests' && inboxContext.requestsView === 'history'
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-gray-50'
              }`}
            >
              History
              {inboxContext.historyConnectionsCount > 0 && (
                <span className={`text-xs px-2 py-1 rounded ${
                  inboxContext.activeTab === 'requests' && inboxContext.requestsView === 'history'
                    ? 'bg-white text-black'
                    : 'bg-black text-white'
                }`}>
                  {inboxContext.historyConnectionsCount}
                </span>
              )}
            </button>
          </div>

          {/* Back to Discovery button - show when on requests tab */}
          {inboxContext.activeTab === 'requests' && (
            <button
              onClick={() => {
                inboxContext.setActiveTab('discover');
              }}
              className="w-full font-ibm-plex-mono px-4 py-2 border-t border-gray-200 bg-black text-white hover:bg-gray-800 flex items-center justify-between"
            >
              <span>Back to Discovery</span>
              <span className="bg-white text-black text-xs px-2 py-1 rounded">
                {inboxContext.discoverStakesCount}
              </span>
            </button>
          )}
        </>
      )}

      {/* Conversations header */}
      <div className="flex items-center gap-2 px-3 py-3">
        <MessageSquare className="w-5 h-5 text-gray-600" />
        <h2 className="font-bold text-sm text-black font-ibm-plex-mono">Conversations</h2>
      </div>
      <div className="flex-1 overflow-y-auto min-h-[300px]">
        {loading ? (
          <div className="text-center text-gray-500 text-sm py-8">
            Loading conversations...
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8 px-3">
            No conversations yet
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {channels.map((channel) => {
              const members = Object.values(channel.state.members || {});
              const otherMember = members.find(
                (m: any) => m.user?.id !== client?.userID
              ) as any;
              const otherUser = otherMember?.user;

              if (!otherUser) return null;

              const lastMessage = channel.state.messages[channel.state.messages.length - 1];
              const unreadCount = channel.state.unreadCount || 0;

              const isActive = activeChatId === otherUser.id;

              return (
                <button
                  key={channel.id}
                  onClick={() => handleChannelClick(channel)}
                  className={`w-full px-3 py-3 transition-colors text-left ${
                    isActive
                      ? 'bg-gray-100 border-l-2 border-black'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Image
                      src={getAvatarUrl({ avatar: otherUser.image, id: otherUser.id, name: otherUser.name })}
                      alt={otherUser.name || 'User'}
                      width={40}
                      height={40}
                      className="rounded-full flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-bold text-sm font-ibm-plex-mono truncate ${
                          isActive ? 'text-black' : 'text-gray-900'
                        }`}>
                          {otherUser.name || 'User'}
                        </span>
                        {unreadCount > 0 && (
                          <span className="bg-black text-white text-xs px-2 py-0.5 rounded-full font-ibm-plex-mono">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                      {lastMessage && (
                        <p className={`text-xs font-ibm-plex-mono truncate ${
                          isActive ? 'text-gray-700' : 'text-gray-500'
                        }`}>
                          {lastMessage.text || 'Attachment'}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
