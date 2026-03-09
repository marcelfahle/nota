import { expect, test } from "bun:test";

import { buildInvitePath, buildInviteUrl, getInviteLink } from "@/lib/invites";

test("invite helpers build absolute and relative links", () => {
  expect(buildInvitePath("token_123")).toBe("/register?invite=token_123");
  expect(buildInviteUrl("https://nota.example", "token_123")).toBe(
    "https://nota.example/register?invite=token_123",
  );
});

test("getInviteLink falls back to a relative path when APP_URL is invalid", () => {
  process.env.APP_URL = "nota.local";
  expect(getInviteLink("token_123")).toBe("/register?invite=token_123");

  process.env.APP_URL = "https://nota.example";
  expect(getInviteLink("token_456")).toBe("https://nota.example/register?invite=token_456");
});
