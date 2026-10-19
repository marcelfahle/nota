"use client";

import { useEffect, useRef, useState } from "react";

import { ChatPanel } from "@/components/chat-panel";

const FIRST_INVOICE_PROMPTS = ["Send your first invoice"] as const;

export function HomeContent({
  chat = true,
  children,
  empty = false,
  summary,
}: {
  /** Off while a super admin views the workspace for support. */
  chat?: boolean;
  children?: React.ReactNode;
  empty?: boolean;
  summary: React.ReactNode;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const chatInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function openChat() {
      if (!chat) {
        return;
      }
      setChatOpen(true);
      requestAnimationFrame(() => chatInput.current?.focus());
    }

    window.addEventListener("nota:open-home-chat", openChat);
    return () => window.removeEventListener("nota:open-home-chat", openChat);
  }, [chat]);

  return (
    <div>
      <div className="mx-auto max-w-[700px]" hidden={chatOpen}>
        {summary}
      </div>
      {chat ? (
        <ChatPanel
          inputRef={chatInput}
          mode="home"
          onOpenChange={setChatOpen}
          open={chatOpen}
          starterPrompts={empty ? FIRST_INVOICE_PROMPTS : undefined}
        />
      ) : null}
      {children ? (
        <div className="mx-auto mt-11 max-w-[700px] space-y-11" hidden={chatOpen}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
