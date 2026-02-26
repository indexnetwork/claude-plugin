"use client";

import { use } from "react";
import SharedChatView from "@/components/SharedChatView";

export default function SharedConversationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <SharedChatView token={token} />;
}
