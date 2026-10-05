import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";

test("log email records delivery intent and attachment metadata without delivery", async () => {
  const path = `/tmp/nota-email-${randomUUID()}/sends.jsonl`;
  process.env.EMAIL_FROM = "Nota Test <nota@example.test>";
  process.env.EMAIL_LOG_PATH = path;
  process.env.EMAIL_PROVIDER = "log";
  const { sendEmail } = await import("./email");

  await sendEmail({
    attachments: [
      { content: Buffer.from("pdf"), contentType: "application/pdf", filename: "a.pdf" },
    ],
    react: <p>Private invoice body</p>,
    subject: "Invoice INV-42",
    to: ["client@example.test"],
  });

  const record = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  expect(record).toMatchObject({
    attachments: [{ bytes: 3, contentType: "application/pdf", filename: "a.pdf" }],
    from: "Nota Test <nota@example.test>",
    subject: "Invoice INV-42",
    to: ["client@example.test"],
  });
  expect(record).not.toHaveProperty("html");
  expect(record).not.toHaveProperty("text");
  await rm(path, { force: true });
});
