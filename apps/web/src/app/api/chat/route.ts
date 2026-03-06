import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { getCurrentUserOrNull } from "@/lib/auth";
import { buildChatSystemContext, buildChatSystemPrompt, createChatTools } from "@/lib/chat-tools";
import { getAiEnv } from "@/lib/env";

const MAX_CHAT_MESSAGES = 24;
const MAX_CHAT_PAYLOAD_SIZE = 50_000;

type ChatRequestBody = {
  messages?: Array<UIMessage>;
};

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

  const messages = body.messages.slice(-MAX_CHAT_MESSAGES);
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

      stopWhen: stepCountIs(6),
      system: buildChatSystemPrompt(auth, context),
      tools: createChatTools(auth),
    });

    return result.toUIMessageStreamResponse({
      onError: () => "Nota chat failed. Try again.",
    });
  } catch {
    return Response.json({ error: "Nota chat is unavailable right now" }, { status: 500 });
  }
}
