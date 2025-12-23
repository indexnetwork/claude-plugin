'use client';

import { useEffect, useRef } from 'react';
import Talk from 'talkjs';
import { useTalkJS } from '@/contexts/TalkJSContext';
import { X, Minus, Maximize2 } from 'lucide-react';
import Image from 'next/image';

interface ChatWindowProps {
  oderId: string;
  oderName: string;
  oderAvatar?: string;
  minimized: boolean;
  onClose: () => void;
  onToggleMinimize: () => void;
}

export default function ChatWindow({
  oderId,
  oderName,
  oderAvatar,
  minimized,
  onClose,
  onToggleMinimize,
}: ChatWindowProps) {
  const { session, isReady, getOrCreateConversation } = useTalkJS();
  const containerRef = useRef<HTMLDivElement>(null);
  const chatboxRef = useRef<Talk.Chatbox | null>(null);

  useEffect(() => {
    if (!isReady || !session || !containerRef.current || minimized) return;

    const conversation = getOrCreateConversation(oderId, oderName, oderAvatar);
    if (!conversation) return;

    const chatbox = session.createChatbox();
    chatbox.select(conversation);
    chatbox.mount(containerRef.current);
    chatboxRef.current = chatbox;

    return () => {
      chatbox.destroy();
      chatboxRef.current = null;
    };
  }, [isReady, session, oderId, oderName, oderAvatar, minimized, getOrCreateConversation]);

  const avatarUrl = oderAvatar || `https://api.dicebear.com/9.x/shapes/png?seed=${oderId}`;

  return (
    <div
      className={`bg-white border border-black rounded-t-lg shadow-lg flex flex-col transition-all duration-200 ${
        minimized ? 'h-12' : 'h-96'
      }`}
      style={{ width: '328px' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-gray-200 cursor-pointer bg-gray-50 rounded-t-lg"
        onClick={onToggleMinimize}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
            <Image
              src={avatarUrl}
              alt={oderName}
              width={32}
              height={32}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="font-medium text-sm text-black truncate font-ibm-plex-mono">
            {oderName}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMinimize();
            }}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            {minimized ? (
              <Maximize2 className="w-4 h-4 text-gray-600" />
            ) : (
              <Minus className="w-4 h-4 text-gray-600" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Chat container */}
      {!minimized && (
        <div ref={containerRef} className="flex-1 overflow-hidden" />
      )}
    </div>
  );
}

