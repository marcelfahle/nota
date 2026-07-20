import { describe, expect, test } from "bun:test";

import { summarizeInvoiceRows } from "@/lib/invoice-insights";

describe("summarizeInvoiceRows", () => {
  test("separates issued, collected, outstanding, overdue, and draft value", () => {
    const summary = summarizeInvoiceRows([
      row({
        clientId: "acme",
        clientName: "Acme",
        status: "paid",
        total: "1000.00",
      }),
      row({
        clientId: "acme",
        clientName: "Acme",
        status: "overdue",
        total: "500.00",
      }),
      row({
        clientId: "oxide",
        clientName: "Oxide",
        status: "sent",
        total: "250.00",
      }),
      row({
        clientId: "oxide",
        clientName: "Oxide",
        status: "draft",
        total: "900.00",
      }),
      row({
        clientId: "oxide",
        clientName: "Oxide",
        status: "cancelled",
        total: "700.00",
      }),
    ]);

    expect(summary.statusCounts).toEqual({
      cancelled: 1,
      draft: 1,
      overdue: 1,
      paid: 1,
      sent: 1,
    });
    expect(summary.currencies[0]).toMatchObject({
      averageIssuedInvoice: 583.33,
      collected: 1000,
      collectionRate: 57.14,
      currency: "EUR",
      draft: 900,
      issued: 1750,
      outstanding: 750,
      overdue: 500,
    });
    expect(summary.currencies[0].topClients[0]).toMatchObject({
      clientName: "Acme",
      issued: 1500,
      outstanding: 500,
    });
  });

  test("keeps currencies separate and calculates average days to payment", () => {
    const summary = summarizeInvoiceRows([
      row({
        clientId: "acme",
        clientName: "Acme",
        issuedAt: "2026-04-01",
        paidAt: new Date("2026-04-11T00:00:00.000Z"),
        status: "paid",
        total: "1000.00",
      }),
      row({ currency: "USD", status: "sent", total: "2000.00" }),
    ]);

    expect(summary.currencies).toHaveLength(2);
    expect(
      summary.currencies.find((entry) => entry.currency === "EUR"),
    ).toMatchObject({
      averageDaysToPay: 10,
      collected: 1000,
    });
    expect(
      summary.currencies.find((entry) => entry.currency === "USD"),
    ).toMatchObject({
      collected: 0,
      outstanding: 2000,
    });
  });

  test("uses payment dates for collections without changing the issued cohort", () => {
    const summary = summarizeInvoiceRows(
      [
        row({
          issuedAt: "2026-04-10",
          paidAt: null,
          status: "sent",
          total: "500.00",
        }),
      ],
      {
        collectionRows: [
          row({
            issuedAt: "2026-02-01",
            paidAt: "2026-04-15",
            status: "paid",
            total: "900.00",
          }),
        ],
      },
    );

    expect(summary.currencies[0]).toMatchObject({
      averageDaysToPay: 73,
      collected: 900,
      collectionRate: 0,
      issued: 500,
      outstanding: 500,
    });
  });
});

function row(
  overrides: Partial<Parameters<typeof summarizeInvoiceRows>[0][number]> = {},
): Parameters<typeof summarizeInvoiceRows>[0][number] {
  return {
    clientId: "default-client",
    clientName: "Default client",
    currency: "EUR",
    dueAt: "2026-05-01",
    issuedAt: "2026-04-01",
    paidAt: null,
    status: "sent",
    total: "100.00",
    ...overrides,
  };
}
