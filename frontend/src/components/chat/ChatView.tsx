'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStreamChat } from '@/contexts/StreamChatContext';
import { X, ArrowLeft, Send } from 'lucide-react';
import Image from 'next/image';

interface ChatViewProps {
  userId: string;
  userName: string;
  userAvatar?: string;
  minimized: boolean; // Kept for compatibility but not used
  onClose: () => void;
  onToggleMinimize: () => void; // Kept for compatibility but not used
}

export default function ChatView({
  userId,
  userName,
  userAvatar,
  minimized: _minimized,
  onClose,
  onToggleMinimize: _onToggleMinimize,
}: ChatViewProps) {
  const { client, isReady, getOrCreateChannel, clearActiveChat } = useStreamChat();
  const [channel, setChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [sendingMessageId, setSendingMessageId] = useState<string | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, []);

  // Initialize channel
  useEffect(() => {
    if (!isReady || !client) {
      setChannel(null);
      setMessages([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    let currentChannel: any = null;

    const initChannel = async () => {
      try {
        const ch = await getOrCreateChannel(userId, userName, userAvatar);
        if (!ch) {
          setLoading(false);
          return;
        }

        currentChannel = ch;
        await ch.watch();

        if (!mounted) return;

        setChannel(ch);

        // Load messages
        const response = await ch.query({
          messages: { limit: 50 },
        });
        
        if (!mounted) return;
        
        setMessages(response.messages || []);
        setLoading(false);

        // Sync messages from channel state
        const syncMessages = () => {
          if (mounted && ch.state.messages) {
            setMessages([...ch.state.messages]);
            scrollToBottom();
          }
        };

        // Listen for new messages
        const handleMessage = (event: any) => {
          if (mounted && event.channel?.id === ch.id) {
            syncMessages();
          }
        };

        // Listen for message updates (including sent messages)
        const handleMessageUpdated = (event: any) => {
          if (mounted && event.channel?.id === ch.id) {
            syncMessages();
          }
        };

        ch.on('message.new', handleMessage);
        ch.on('message.updated', handleMessageUpdated);
        
        // Also listen to channel state changes
        ch.on('channel.updated', syncMessages);
      } catch (error) {
        console.error('Error initializing channel:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initChannel();

    return () => {
      mounted = false;
      if (currentChannel) {
        currentChannel.off('message.new');
        currentChannel.off('message.updated');
        currentChannel.off('channel.updated');
      }
    };
  }, [isReady, client, userId, userName, userAvatar, getOrCreateChannel, scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(async () => {
    if (!channel || !messageText.trim() || sendingMessageId) return;

    const text = messageText.trim();
    setMessageText('');
    
    // Optimistic update - add message immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      text,
      user: { id: client?.userID, name: client?.user?.name },
      created_at: new Date(),
      status: 'sending',
    };
    
    setSendingMessageId(tempId);
    setMessages((prev) => [...prev, optimisticMessage]);
    scrollToBottom();

    try {
      const response = await channel.sendMessage({
        text,
      });
      
      // Replace optimistic message with real one
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempId);
        return [...filtered, response.message];
      });
      setSendingMessageId(null);
      scrollToBottom();
      inputRef.current?.focus();
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove failed optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setSendingMessageId(null);
      setMessageText(text); // Restore message text
    }
  }, [channel, messageText, client, sendingMessageId, scrollToBottom]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const avatarUrl = userAvatar || `https://api.dicebear.com/9.x/shapes/png?seed=${userId}`;

  const handleBack = () => {
    clearActiveChat();
  };

  return (
    <div className="bg-white border border-b-2 border-gray-800 rounded-sm flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-white">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={handleBack}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
            aria-label="Back to main content"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <Image
            src={avatarUrl}
            alt={userName}
            width={32}
            height={32}
            className="rounded-full flex-shrink-0"
          />
          <span className="font-bold text-base text-gray-900 truncate font-ibm-plex-mono">
            {userName}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1.5 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
          aria-label="Close chat"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Chat container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col">
        {loading ? (
          <div className="text-center text-gray-500 text-sm py-8">
            Loading...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <>
            {messages.map((message) => {
              const isOwn = message.user?.id === client?.userID;
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] px-3 py-2 rounded-sm ${
                      isOwn
                        ? 'bg-black text-white font-ibm-plex-mono'
                        : 'bg-gray-100 text-gray-900 font-ibm-plex-mono'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {message.text}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message input */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-sm text-sm font-ibm-plex-mono text-black focus:outline-none focus:border-black"
          />
          <button
            onClick={handleSend}
            disabled={!messageText.trim()}
            className="p-2 bg-black text-white rounded-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
