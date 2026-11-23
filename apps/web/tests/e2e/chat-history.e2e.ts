import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { chatMessages, chatThreads } from "../../src/lib/db/schema";
import { registerAccount } from "./helpers";

test("reopens yesterday's conversation, rates a reply, and starts fresh", async ({
  browser,
  page,
}) => {
  await registerAccount(page);
  const threadId = (await (await page.request.get("/api/chat")).json()).threadId;
  const replyId = crypto.randomUUID();
  await db.insert(chatMessages).values([
    {
      id: crypto.randomUUID(),
      parts: [{ text: "Show my draft invoices", type: "text" }],
      role: "user",
      threadId,
    },
    {
      id: replyId,
      parts: [{ text: "You have two drafts.", type: "text" }],
      role: "assistant",
      threadId,
    },
  ]);
  await db
    .update(chatThreads)
    .set({ updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
    .where(eq(chatThreads.id, threadId));
  await page.goto("/invoices");
  await page.getByTestId("chat-panel-toggle").click();
  const fresh = await (await page.request.get("/api/chat")).json();
  expect(fresh.threadId).not.toBe(threadId);
  expect(fresh.messages).toEqual([]);
  await page.getByRole("button", { name: "Chat history" }).click();
  await page.getByRole("button", { name: /Show my draft invoices/ }).click();
  await expect(page.getByText("You have two drafts.")).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Helpful reply" }).click();
  await expect(page.getByRole("button", { exact: true, name: "Helpful reply" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const getSaved = async () =>
    (await (await page.request.get("/api/chat?threadId=" + threadId)).json()).messages.find(
      (m: { id: string }) => m.id === replyId,
    );
  expect((await getSaved()).metadata.rating).toBe("up");
  await page.getByRole("button", { exact: true, name: "Unhelpful reply" }).click();
  await expect(page.getByRole("button", { exact: true, name: "Unhelpful reply" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByText("You have two drafts.")).toHaveCount(0);
  await page.getByRole("button", { name: "Chat history" }).click();
  await page.getByRole("button", { name: /Show my draft invoices/ }).click();
  await expect(page.getByRole("button", { exact: true, name: "Unhelpful reply" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const other = await browser.newContext();
  await registerAccount(await other.newPage());
  expect((await other.request.get("/api/chat?threadId=" + threadId)).status()).toBe(404);
  expect(
    (
      await other.request.patch("/api/chat", { data: { messageId: replyId, rating: "up" } })
    ).status(),
  ).toBe(404);
  expect((await getSaved()).metadata.rating).toBe("down");
  await other.close();
});
