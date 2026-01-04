'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { StreamChat, Channel, User as StreamUser } from 'stream-chat';
import { useAuthContext } from './AuthContext';
import { getAvatarUrl } from '@/lib/file-utils';
import { useAuthenticatedAPI } from '@/lib/api';

interface ChatWindow {
  userId: string;
  userName: string;
  userAvatar?: string;
  minimized: boolean;
}

interface StreamChatContextType {
  client: StreamChat | null;
  isReady: boolean;
  openChats: ChatWindow[];
  activeChatId: string | null;
  openChat: (userId: string, userName: string, userAvatar?: string) => void;
  closeChat: (userId: string) => void;
  toggleMinimize: (userId: string) => void;
  setActiveChat: (userId: string | null) => void;
  clearActiveChat: () => void;
  getOrCreateChannel: (userId: string, userName: string, userAvatar?: string) => Promise<Channel | null>;
}

const StreamChatContext = createContext<StreamChatContextType | undefined>(undefined);

const STREAM_API_KEY = '6238du93us6h';
const MAX_OPEN_CHATS = 3;

export function StreamChatProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuthContext();
  const api = useAuthenticatedAPI();
  const [client, setClient] = useState<StreamChat | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [openChats, setOpenChats] = useState<ChatWindow[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Generate token via backend API
  const generateToken = useCallback(async (userId: string): Promise<string> => {
    const response = await api.post<{ token: string }>('/chat/token', { userId });
    return response.token;
  }, [api]);

  // Initialize Stream Chat client when user is authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      if (client) {
        client.disconnectUser();
        setClient(null);
      }
      setIsReady(false);
      return;
    }

    let mounted = true;

    const initStreamChat = async () => {
      try {
        // Create Stream Chat client
        const streamClient = StreamChat.getInstance(STREAM_API_KEY);

        // Generate token via backend API
        const token = await generateToken(user.id);

        // Connect user
        await streamClient.connectUser(
          {
            id: user.id,
            name: user.name || 'Anonymous',
            image: getAvatarUrl(user),
          },
          token
        );

        if (mounted) {
          setClient(streamClient);
          setIsReady(true);
        }
      } catch (error) {
        console.error('Failed to initialize Stream Chat:', error);
      }
    };

    initStreamChat();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, user?.id, user?.name, generateToken]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (client) {
        client.disconnectUser();
      }
    };
  }, [client]);

  const getOrCreateChannel = useCallback(
    async (otherUserId: string, otherUserName: string, otherUserAvatar?: string): Promise<Channel | null> => {
      if (!client || !user?.id) return null;

      // Check if the other user exists in Stream Chat, upsert if not
      try {
        const usersResponse = await client.queryUsers({ id: { $eq: otherUserId } });
        if (usersResponse.users.length === 0) {
          // User doesn't exist, upsert them via backend API
          await api.post('/chat/user', {
            userId: otherUserId,
            userName: otherUserName,
            userAvatar: otherUserAvatar,
          });
        }
      } catch (error) {
        console.error('Failed to check/upsert user in Stream Chat:', error);
        // Continue anyway - channel creation might still work
      }

      // Create a unique channel ID based on both user IDs (sorted for consistency)
      const sortedIds = [user.id, otherUserId].sort().join('_');
      // Hash to ensure it's under 64 characters if needed
      const channelId = sortedIds.length > 64 
        ? (() => {
            let hash = 0;
            for (let i = 0; i < sortedIds.length; i++) {
              const char = sortedIds.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash;
            }
            return Math.abs(hash).toString(36).slice(0, 63);
          })()
        : sortedIds;

      // Get or create channel
      const channel = client.channel('messaging', channelId, {
        members: [user.id, otherUserId],
      });

      return channel;
    },
    [client, user?.id, api]
  );

  const openChat = useCallback((userId: string, userName: string, userAvatar?: string) => {
    setOpenChats((prev) => {
      // Check if chat is already open
      const existing = prev.find((c) => c.userId === userId);
      if (existing) {
        // Bring to front and unminimize
        return prev.map((c) =>
          c.userId === userId ? { ...c, minimized: false } : c
        );
      }

      // Add new chat window
      const newChat: ChatWindow = {
        userId,
        userName,
        userAvatar,
        minimized: false,
      };

      // If we're at max, remove the oldest one
      if (prev.length >= MAX_OPEN_CHATS) {
        return [...prev.slice(1), newChat];
      }

      return [...prev, newChat];
    });
    // Automatically set as active chat
    setActiveChatId(userId);
  }, []);

  const closeChat = useCallback((userId: string) => {
    setOpenChats((prev) => prev.filter((c) => c.userId !== userId));
    // Clear active chat if it's the one being closed
    setActiveChatId((prev) => prev === userId ? null : prev);
  }, []);

  const setActiveChat = useCallback((userId: string | null) => {
    setActiveChatId(userId);
  }, []);

  const clearActiveChat = useCallback(() => {
    setActiveChatId(null);
  }, []);

  const toggleMinimize = useCallback((userId: string) => {
    setOpenChats((prev) =>
      prev.map((c) =>
        c.userId === userId ? { ...c, minimized: !c.minimized } : c
      )
    );
  }, []);

  return (
    <StreamChatContext.Provider
      value={{
        client,
        isReady,
        openChats,
        activeChatId,
        openChat,
        closeChat,
        toggleMinimize,
        setActiveChat,
        clearActiveChat,
        getOrCreateChannel,
      }}
    >
      {children}
    </StreamChatContext.Provider>
  );
}

export function useStreamChat() {
  const context = useContext(StreamChatContext);
  if (context === undefined) {
    throw new Error('useStreamChat must be used within a StreamChatProvider');
  }
  return context;
}
