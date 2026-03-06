import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const apiKey = "nota_test_key";
const org = {
  id: "org_1",
  name: "Nota Test Org",
};
const user = {
  email: "owner@example.com",
  id: "user_1",
  name: "Owner",
};

const clients = [
  {
    id: "client_1",
    name: "Acme GmbH",
    email: "billing@acme.test",
    company: "Acme GmbH",
    address: "Main Street 1\nBerlin",
    defaultCurrency: "EUR",
    notes: null,
    vatNumber: "DE123",
    bankAccountId: null,
    invoiceCount: 1,
    totalInvoiced: "1500.00",
  },
  {
    id: "client_2",
    name: "Globex",
    email: "billing@globex.test",
    company: "Globex Corp",
    address: null,
    defaultCurrency: "EUR",
    notes: null,
    vatNumber: null,
    bankAccountId: null,
    invoiceCount: 0,
    totalInvoiced: "0.00",
  },
];

const invoiceDetails = new Map([
  [
    "inv_1",
    {
      id: "inv_1",
      clientId: "client_1",
      userId: user.id,
      orgId: org.id,
      number: "INV-0001",
      status: "draft",
      currency: "EUR",
      subtotal: "1500.00",
      taxAmount: "0.00",
      taxRate: "0.00",
      total: "1500.00",
      notes: "Initial invoice",
      internalNotes: null,
      reverseCharge: false,
      issuedAt: "2026-03-06",
      dueAt: "2026-04-05",
      paidAt: null,
      sentAt: null,
      stripePaymentLinkId: null,
      stripePaymentLinkUrl: null,
      stripePaymentIntentId: null,
      client: {
        id: "client_1",
        name: "Acme GmbH",
        email: "billing@acme.test",
        defaultCurrency: "EUR",
      },
      lineItems: [
        {
          amount: "1500.00",
          description: "Design work",
          quantity: "1.00",
          unitPrice: "1500.00",
        },
      ],
      activityLog: [],
    },
  ],
]);

const createdInvoices: Array<Record<string, unknown>> = [];
let latestInvoiceId = 1;
let server: Bun.Server | null = null;
let baseUrl = "";

function requireBearer(request: Request) {
  return request.headers.get("authorization") === `Bearer ${apiKey}`;
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status });
}

function getInvoiceSummaryRows(status?: string | null, search?: string | null) {
  const rows = Array.from(invoiceDetails.values()).map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    currency: invoice.currency,
    total: invoice.total,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    client: invoice.client,
  }));

  return rows.filter((invoice) => {
    if (status && invoice.status !== status) {
      return false;
    }

    if (!search) {
      return true;
    }

    const normalized = search.toLowerCase();
    return (
      invoice.number.toLowerCase().includes(normalized) ||
      (invoice.client?.name ?? "").toLowerCase().includes(normalized) ||
      (invoice.client?.email ?? "").toLowerCase().includes(normalized)
    );
  });
}

beforeAll(() => {
  server = Bun.serve({
    fetch(request) {
      if (!requireBearer(request)) {
        return json({ error: "Unauthorized" }, 401);
      }

      const url = new URL(request.url);
      const path = url.pathname;

      if (path === "/api/v1/me") {
        return json({ data: { org, role: "owner", user } });
      }

      if (path === "/api/v1/clients" && request.method === "GET") {
        const search = url.searchParams.get("search")?.toLowerCase() ?? null;
        const data = clients.filter((client) => {
          if (!search) {
            return true;
          }

          return [client.name, client.company, client.email]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLowerCase().includes(search));
        });

        return json({ data, pagination: { page: 1, perPage: data.length || 1, total: data.length } });
      }

      if (path === "/api/v1/clients" && request.method === "POST") {
        return request.json().then((body) => {
          const createdClient = {
            ...body,
            id: `client_${clients.length + 1}`,
            invoiceCount: 0,
            totalInvoiced: "0.00",
          };
          clients.push(createdClient as (typeof clients)[number]);
          return json({ data: createdClient }, 201);
        });
      }

      if (path.startsWith("/api/v1/clients/") && request.method === "GET") {
        const clientId = path.split("/").pop() ?? "";
        const client = clients.find((entry) => entry.id === clientId);
        return client ? json({ data: client }) : json({ error: "Client not found" }, 404);
      }

      if (path === "/api/v1/invoices" && request.method === "GET") {
        const status = url.searchParams.get("status");
        const search = url.searchParams.get("search");
        const data = getInvoiceSummaryRows(status, search);
        return json({ data, pagination: { page: 1, perPage: data.length || 1, total: data.length } });
      }

      if (path === "/api/v1/invoices" && request.method === "POST") {
        return request.json().then((body) => {
          const invoiceId = `inv_${++latestInvoiceId}`;
          createdInvoices.push(body as Record<string, unknown>);
          const detail = {
            id: invoiceId,
            clientId: body.clientId,
            userId: user.id,
            orgId: org.id,
            number: `INV-000${latestInvoiceId}`,
            status: "draft",
            currency: body.currency ?? "EUR",
            subtotal: "3000.00",
            taxAmount: "0.00",
            taxRate: String(body.taxRate ?? 0),
            total: "3000.00",
            notes: body.notes ?? null,
            internalNotes: body.internalNotes ?? null,
            reverseCharge: Boolean(body.reverseCharge),
            issuedAt: body.issuedAt,
            dueAt: body.dueAt,
            paidAt: null,
            sentAt: null,
            stripePaymentLinkId: null,
            stripePaymentLinkUrl: null,
            stripePaymentIntentId: null,
            client: {
              id: body.clientId,
              name: "Acme GmbH",
              email: "billing@acme.test",
              defaultCurrency: "EUR",
            },
            lineItems: (body.lineItems as Array<Record<string, number | string>>).map((lineItem) => ({
              amount: String((Number(lineItem.quantity) * Number(lineItem.unitPrice)).toFixed(2)),
              description: String(lineItem.description),
              quantity: Number(lineItem.quantity).toFixed(2),
              unitPrice: Number(lineItem.unitPrice).toFixed(2),
            })),
            activityLog: [],
          };
          invoiceDetails.set(invoiceId, detail);
          return json({ data: detail }, 201);
        });
      }

      if (path.startsWith("/api/v1/invoices/") && request.method === "GET" && path.endsWith("/pdf")) {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          headers: {
            "content-disposition": 'attachment; filename="INV-0001.pdf"',
            "content-type": "application/pdf",
          },
        });
      }

      if (path.startsWith("/api/v1/invoices/") && request.method === "GET") {
        const invoiceId = path.split("/").pop() ?? "";
        const invoice = invoiceDetails.get(invoiceId);
        return invoice ? json({ data: invoice }) : json({ error: "Invoice not found" }, 404);
      }

      if (path.match(/^\/api\/v1\/invoices\/[^/]+\/(send|remind|mark-paid|cancel|duplicate)$/) && request.method === "POST") {
        const [, , , , invoiceId, action] = path.split("/");
        const invoice = invoiceDetails.get(invoiceId);
        if (!invoice) {
          return json({ error: "Invoice not found" }, 404);
        }

        const updated = {
          ...invoice,
          number: action === "duplicate" ? `INV-000${latestInvoiceId + 1}` : invoice.number,
          status:
            action === "mark-paid"
              ? "paid"
              : action === "cancel"
                ? "cancelled"
                : action === "send"
                  ? "sent"
                  : invoice.status,
        };

        if (action === "duplicate") {
          const duplicatedId = `inv_${++latestInvoiceId}`;
          invoiceDetails.set(duplicatedId, { ...updated, id: duplicatedId, number: `INV-000${latestInvoiceId}` });
          return json({ data: invoiceDetails.get(duplicatedId) }, 201);
        }

        invoiceDetails.set(invoiceId, updated);
        return json({ data: updated });
      }

      return json({ error: `Unhandled route ${request.method} ${path}` }, 404);
    },
    port: 0,
  });

  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  await server?.stop();
});

describe("nota MCP server", () => {
  test("handshake exposes tools, resources, and invoice actions", async () => {
    const client = new Client({ name: "nota-test", version: "0.1.0" });
    const transport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        NOTA_API_KEY: apiKey,
        NOTA_URL: baseUrl,
      },
      stderr: "pipe",
    });

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "list_clients",
        "create_client",
        "list_invoices",
        "create_invoice",
        "get_invoice",
        "send_invoice",
        "send_reminder",
        "mark_paid",
        "cancel_invoice",
        "duplicate_invoice",
        "download_pdf",
      ]),
    );

    const resources = await client.listResources();
    expect(resources.resources.some((resource) => resource.uri === "nota://invoices/summary")).toBe(true);

    const templates = await client.listResourceTemplates();
    expect(templates.resourceTemplates.map((template) => template.uriTemplate)).toEqual(
      expect.arrayContaining(["nota://invoices/{invoiceId}", "nota://clients/{clientId}"]),
    );

    const listInvoicesResult = await client.callTool({
      name: "list_invoices",
      arguments: { status: "draft" },
    });
    expect(listInvoicesResult.isError).toBeFalsy();

    const listClientsResult = await client.callTool({
      name: "list_clients",
      arguments: { search: "acme" },
    });
    expect(listClientsResult.isError).toBeFalsy();
    expect(JSON.stringify(listClientsResult.structuredContent)).toContain("Acme GmbH");

    const createInvoiceResult = await client.callTool({
      name: "create_invoice",
      arguments: {
        clientName: "Acme GmbH",
        lineItemsText: "2 x Strategy workshop @ 1500",
        notes: "Please pay within 30 days",
      },
    });
    expect(createInvoiceResult.isError).toBeFalsy();
    expect(createdInvoices.at(-1)?.clientId).toBe("client_1");
    expect(createdInvoices.at(-1)?.lineItems).toEqual([
      {
        description: "Strategy workshop",
        quantity: 2,
        unitPrice: 1500,
      },
    ]);

    const getInvoiceResult = await client.callTool({
      name: "get_invoice",
      arguments: { invoiceNumber: "INV-0001" },
    });
    expect(getInvoiceResult.isError).toBeFalsy();
    expect(JSON.stringify(getInvoiceResult.structuredContent)).toContain("INV-0001");

    const readSummary = await client.readResource({ uri: "nota://invoices/summary" });
    expect(readSummary.contents[0]?.text).toContain('"totalInvoices"');

    const readClient = await client.readResource({ uri: "nota://clients/client_1" });
    expect(readClient.contents[0]?.text).toContain("Acme GmbH");

    const downloadResult = await client.callTool({
      name: "download_pdf",
      arguments: { invoiceNumber: "INV-0001" },
    });
    expect(downloadResult.isError).toBeFalsy();
    expect(JSON.stringify(downloadResult.structuredContent)).toContain("pdfBase64");

    await client.close();
  });
});
