import { expect, mock, test } from "bun:test";

const selectSpy = mock(() => ({
  from: () => ({
    where: () => ({
      limit: async () => [],
    }),
  }),
}));

const sendSpy = mock(async () => ({}));

mock.module("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect should not run in password reset env tests");
  },
}));

mock.module("@/lib/db", () => ({
  db: {
    select: selectSpy,
  },
}));

mock.module("@/lib/email", () => ({
  getResend: () => ({
    emails: {
      send: sendSpy,
    },
  }),
}));

const { requestPasswordReset } = await import("./auth");

test("requestPasswordReset returns a form error when APP_URL is invalid", async () => {
  process.env.APP_URL = "nota.local";
  process.env.RESEND_API_KEY = "re_test_key";

  const formData = new FormData();
  formData.set("email", "owner@example.com");

  const result = await requestPasswordReset(null, formData);

  expect(result).toEqual({ error: "APP_URL must be a valid absolute URL" });
  expect(selectSpy).not.toHaveBeenCalled();
  expect(sendSpy).not.toHaveBeenCalled();
});
