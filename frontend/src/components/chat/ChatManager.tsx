'use client';

import { useTalkJS } from '@/contexts/TalkJSContext';
import ChatWindow from './ChatWindow';

export default function ChatManager() {
  const { openChats, closeChat, toggleMinimize, isReady } = useTalkJS();

  if (!isReady || openChats.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 right-4 z-50 flex gap-2 items-end">
      {openChats.map((chat) => (
        <ChatWindow
          key={chat.oderId}
          oderId={chat.oderId}
          oderName={chat.odeName}
          oderAvatar={chat.oderAvatar}
          minimized={chat.minimized}
          onClose={() => closeChat(chat.oderId)}
          onToggleMinimize={() => toggleMinimize(chat.oderId)}
        />
      ))}
    </div>
  );
}

