'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import Talk from 'talkjs';
import { useAuthContext } from './AuthContext';
import { getAvatarUrl } from '@/lib/file-utils';

interface ChatWindow {
  oderId: string;
  odeName: string;
  oderAvatar?: string;
  minimized: boolean;
}

interface TalkJSContextType {
  session: Talk.Session | null;
  isReady: boolean;
  openChats: ChatWindow[];
  openChat: (userId: string, userName: string, userAvatar?: string) => void;
  closeChat: (userId: string) => void;
  toggleMinimize: (userId: string) => void;
  getOrCreateConversation: (oderId: string, oderName: string, oderAvatar?: string) => Talk.ConversationBuilder | null;
}

const TalkJSContext = createContext<TalkJSContextType | undefined>(undefined);

const TALKJS_APP_ID = 'tlm3s37d';
const MAX_OPEN_CHATS = 3;

export function TalkJSProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuthContext();
  const [session, setSession] = useState<Talk.Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [openChats, setOpenChats] = useState<ChatWindow[]>([]);
  const [talkUser, setTalkUser] = useState<Talk.User | null>(null);

  // Initialize TalkJS session when user is authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setSession(null);
      setIsReady(false);
      setTalkUser(null);
      return;
    }

    let mounted = true;

    const initTalkJS = async () => {
      try {
        await Talk.ready;

        if (!mounted) return;

        const me = new Talk.User({
          id: user.id,
          name: user.name || 'Anonymous',
          email: user.email || undefined,
          photoUrl: getAvatarUrl(user),
          role: 'default',
        });

        setTalkUser(me);

        const talkSession = new Talk.Session({
          appId: TALKJS_APP_ID,
          me: me,
        });

        if (mounted) {
          setSession(talkSession);
          setIsReady(true);
        }
      } catch (error) {
        console.error('Failed to initialize TalkJS:', error);
      }
    };

    initTalkJS();

    return () => {
      mounted = false;
      if (session) {
        session.destroy();
      }
    };
  }, [isAuthenticated, user?.id, user?.name, user?.email]);

  const getOrCreateConversation = useCallback(
    (oderId: string, oderName: string, oderAvatar?: string): Talk.ConversationBuilder | null => {
      if (!session || !talkUser || !user?.id) return null;

      const oder = new Talk.User({
        id: oderId,
        name: oderName,
        photoUrl: oderAvatar || `https://api.dicebear.com/9.x/shapes/png?seed=${oderId}`,
        role: 'default',
      });

      // Create a unique conversation ID based on both user IDs (sorted for consistency)
      const conversationId = [user.id, oderId].sort().join('_');

      const conversation = session.getOrCreateConversation(conversationId);
      conversation.setParticipant(talkUser);
      conversation.setParticipant(oder);

      return conversation;
    },
    [session, talkUser, user?.id]
  );

  const openChat = useCallback((userId: string, userName: string, userAvatar?: string) => {
    setOpenChats((prev) => {
      // Check if chat is already open
      const existing = prev.find((c) => c.oderId === userId);
      if (existing) {
        // Bring to front and unminimize
        return prev.map((c) =>
          c.oderId === userId ? { ...c, minimized: false } : c
        );
      }

      // Add new chat window
      const newChat: ChatWindow = {
        oderId: userId,
        odeName: userName,
        oderAvatar: userAvatar,
        minimized: false,
      };

      // If we're at max, remove the oldest one
      if (prev.length >= MAX_OPEN_CHATS) {
        return [...prev.slice(1), newChat];
      }

      return [...prev, newChat];
    });
  }, []);

  const closeChat = useCallback((userId: string) => {
    setOpenChats((prev) => prev.filter((c) => c.oderId !== userId));
  }, []);

  const toggleMinimize = useCallback((userId: string) => {
    setOpenChats((prev) =>
      prev.map((c) =>
        c.oderId === userId ? { ...c, minimized: !c.minimized } : c
      )
    );
  }, []);

  return (
    <TalkJSContext.Provider
      value={{
        session,
        isReady,
        openChats,
        openChat,
        closeChat,
        toggleMinimize,
        getOrCreateConversation,
      }}
    >
      {children}
    </TalkJSContext.Provider>
  );
}

export function useTalkJS() {
  const context = useContext(TalkJSContext);
  if (context === undefined) {
    throw new Error('useTalkJS must be used within a TalkJSProvider');
  }
  return context;
}

