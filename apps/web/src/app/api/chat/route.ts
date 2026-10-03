import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { getCurrentUserOrNull } from "@/lib/auth";
import { getChatThread, loadChatMessages, saveChatMessage } from "@/lib/chat-store";
import { buildChatSystemContext, buildChatSystemPrompt, createChatTools } from "@/lib/chat-tools";
import { getAiEnv } from "@/lib/env";

const MAX_CHAT_MESSAGES = 24;
const MAX_CHAT_PAYLOAD_SIZE = 50_000;

type ChatRequestBody = {
  messages?: Array<UIMessage>;
  pageContext?: { entityId?: string; route?: string };
};

export async function GET() {
  const auth = await getCurrentUserOrNull();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const thread = await getChatThread({ orgId: auth.org.id, userId: auth.user.id });
  return Response.json({ messages: await loadChatMessages(thread.id), threadId: thread.id });
}

export async function POST(request: Request) {
  const auth = await getCurrentUserOrNull();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Messages are required" }, { status: 400 });
  }

  const incoming = body.messages.at(-1);
  if (!incoming || incoming.role !== "user") {
    return Response.json({ error: "A user message is required" }, { status: 400 });
  }
  const thread = await getChatThread({ orgId: auth.org.id, userId: auth.user.id });
  await saveChatMessage(thread.id, incoming, body.pageContext);
  const messages = await loadChatMessages(thread.id, MAX_CHAT_MESSAGES);
  if (JSON.stringify(messages).length > MAX_CHAT_PAYLOAD_SIZE) {
    return Response.json(
      { error: "Chat history is too large. Start a new chat." },
      { status: 400 },
    );
  }

  let chatModel: string;
  try {
    chatModel = getAiEnv().NOTA_CHAT_MODEL;
  } catch {
    return Response.json({ error: "AI chat is not configured" }, { status: 503 });
  }

  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  try {
    modelMessages = await convertToModelMessages(
      messages.map(({ id: _id, ...message }) => message),
    );
  } catch {
    return Response.json({ error: "Invalid chat history" }, { status: 400 });
  }

  try {
    const context = await buildChatSystemContext(auth);
    const result = streamText({
      maxOutputTokens: 1200,
      messages: modelMessages,
      model: anthropic(chatModel),
      providerOptions:
        chatModel === "claude-sonnet-5-5"
          ? { anthropic: { effort: "low", thinking: { type: "adaptive" } } }
          : undefined,

      stopWhen: stepCountIs(6),
      system: buildChatSystemPrompt(auth, context),
      tools: createChatTools(auth),
    });

    return result.toUIMessageStreamResponse({
      generateMessageId: () => crypto.randomUUID(),
      onError: (error) => {
        // eslint-disable-next-line no-console -- Preserve provider failures in server logs.
        console.error("[chat] stream error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return `Nota chat failed: ${message}`;
      },
      onFinish: async ({ responseMessage }) => {
        await saveChatMessage(thread.id, responseMessage, body.pageContext);
      },
      originalMessages: messages,
    });
  } catch {
    return Response.json({ error: "Nota chat is unavailable right now" }, { status: 500 });
  }
}
