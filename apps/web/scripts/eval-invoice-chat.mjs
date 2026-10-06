import process from "node:process";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs } from "ai";

import { resolveChatInvoiceLineItems } from "../src/lib/chat-parser.ts";
import { buildChatSystemPrompt, createChatTools } from "../src/lib/chat-tools.ts";
import { withAiObservability } from "../src/lib/posthog-ai.ts";
const clientId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const client = {
  company: "Ranger Marketing & Vertriebs GmbH",
  defaultCurrency: "EUR",
  email: "invoice@ranger.test",
  id: clientId,
  name: "Ranger Marketing & Vertriebs GmbH",
};
const invoice = {
  client,
  currency: "EUR",
  dueAt: "2026-09-07",
  id: invoiceId,
  issuedAt: "2026-08-31",
  lineItems: [
    {
      amount: "1000.00",
      description: "Video Streaming & Server Betreuung - July 2026",
      quantity: "1",
      unitPrice: "1000.00",
    },
  ],
  number: "0000097",
  reverseCharge: false,
  status: "sent",
  taxRate: "0.00",
  total: "1000.00",
};
const auth = {
  org: {
    businessName: "No Rules Software",
    defaultCurrency: "EUR",
    id: "test",
    invoicePrefix: "",
    name: "Nota",
  },
  role: "owner",
  user: { id: "test", name: "Owner" },
};
const model = process.env.NOTA_EVAL_MODEL ?? "claude-sonnet-5-5";
const effort = process.env.NOTA_EVAL_EFFORT ?? (model === "claude-sonnet-5-5" ? "low" : undefined);
const providerOptions = effort
  ? { anthropic: { effort, thinking: { type: "adaptive" } } }
  : undefined;
const schemaTools = createChatTools(auth);
const sessionId = `invoice-chat-eval-${process.pid}`;
for (const prompt of [
  "All right, create another invoice for Ranger with services for September. The date of the invoice should be October 1st and should be paid within seven days.",
  "change the due date on invoice 97 to oct 8",
]) {
  const calls = [];
  let createdInvoice;
  // Override EVERY executor. This evaluation cannot write to the database or send mail.
  const tools = Object.fromEntries(
    Object.entries(schemaTools).map(([name, definition]) => [
      name,
      {
        ...definition,
        execute: async (input) => {
          calls.push({ input, name });
          if (name === "list_clients") {
            return { clients: [client], kind: "clients" };
          }
          if (name === "get_client_billing_history") {
            return { client, invoices: [invoice], kind: "billing-history" };
          }
          if (name === "get_invoice") {
            return {
              invoice: input.invoiceNumber === "0000099" ? createdInvoice : invoice,
              kind: "invoice",
            };
          }
          if (name === "list_invoices") {
            return { invoices: [invoice], kind: "invoices" };
          }
          if (name === "create_invoice") {
            const resolved = resolveChatInvoiceLineItems({
              ...input,
              templateLineItems: invoice.lineItems.map((item) => ({
                description: item.description,
                quantity: Number(item.quantity),
                unitPrice: Number(item.unitPrice),
              })),
            });
            createdInvoice = {
              ...invoice,
              dueAt: input.dueAt,
              issuedAt: input.issuedAt,
              lineItems: resolved,
              number: "0000099",
              status: "draft",
            };
            return {
              invoice: createdInvoice,
              kind: "invoice",
              message: "Created draft",
            };
          }
          if (name === "change_invoice_due_date") {
            return {
              invoice: { ...invoice, dueAt: input.dueAt },
              kind: "invoice",
              message: "Updated due date",
            };
          }
          throw Error("Unexpected evaluation tool " + name);
        },
      },
    ]),
  );
  const started = Date.now();
  const observability = withAiObservability(anthropic(model), {
    sessionId,
    traceId: globalThis.crypto.randomUUID(),
  });
  const result = await generateText({
    maxOutputTokens: 1200,
    model: observability.model,
    prompt,
    providerOptions,
    stopWhen: stepCountIs(6),
    system: buildChatSystemPrompt(auth, { clients: [client], recentInvoices: [invoice] }).replace(
      /^Today's date is .*\.$/m,
      "Today's date is 2026-09-30.",
    ),
    tools,
  }).finally(observability.flush);
  const create = calls.find((c) => c.name === "create_invoice");
  const change = calls.find((c) => c.name === "change_invoice_due_date");
  const expectsCreate = prompt.startsWith("All right,");
  const expectedMutation = expectsCreate ? "create_invoice" : "change_invoice_due_date";
  const passed =
    (expectsCreate
      ? create &&
        calls
          .slice(0, calls.indexOf(create))
          .some((c) => c.name === "get_client_billing_history") &&
        create.input.serviceMonth === "2026-09" &&
        create.input.issuedAt === "2026-10-01" &&
        create.input.dueAt === "2026-10-08" &&
        createdInvoice.lineItems.every((item) => /September/i.test(item.description))
      : change &&
        (change.input.invoiceNumber === "97" || change.input.invoiceId === invoiceId) &&
        change.input.dueAt === "2026-10-08") &&
    calls.filter((call) => call.name === expectedMutation).length === 1 &&
    calls.every((call) =>
      [
        "list_clients",
        "get_client_billing_history",
        "get_invoice",
        "list_invoices",
        expectedMutation,
      ].includes(call.name),
    );
  process.stdout.write(
    JSON.stringify({
      calls,
      elapsedMs: Date.now() - started,
      model,
      passed,
      prompt,
      usage: result.totalUsage,
    }) + "\n",
  );
  if (!passed) {
    process.exitCode = 1;
  }
}
