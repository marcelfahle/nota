"use client";

/**
 * After sign-in or sign-up, Better Auth answers a pending OAuth authorization
 * (ChatGPT, Claude) with `{ redirect: true, url }`. Follow it; otherwise go to
 * the app.
 */
export function continueAfterAuth(data: unknown, fallback = "/invoices") {
  const next =
    data && typeof data === "object" && "url" in data && typeof data.url === "string"
      ? data.url
      : fallback;
  window.location.assign(next);
}
