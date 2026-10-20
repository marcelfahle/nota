"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ChatPanel } from "@/components/chat-panel";
import type { Locale } from "@/lib/utils";

export function HomeContent({
  children,
  empty = false,
  locale,
  summary,
}: {
  children?: React.ReactNode;
  empty?: boolean;
  locale?: Locale;
  summary: React.ReactNode;
}) {
  const t = useTranslations("home");
  const [chatOpen, setChatOpen] = useState(false);
  const chatInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function openChat() {
      setChatOpen(true);
      requestAnimationFrame(() => chatInput.current?.focus());
    }

    window.addEventListener("nota:open-home-chat", openChat);
    return () => window.removeEventListener("nota:open-home-chat", openChat);
  }, []);

  return (
    <div>
      <div className="mx-auto max-w-[700px]" hidden={chatOpen}>
        {summary}
      </div>
      <ChatPanel
        inputRef={chatInput}
        locale={locale}
        mode="home"
        onOpenChange={setChatOpen}
        open={chatOpen}
        starterPrompts={empty ? [t("firstInvoicePrompt")] : undefined}
      />
      {children ? (
        <div className="mx-auto mt-11 max-w-[700px] space-y-11" hidden={chatOpen}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
