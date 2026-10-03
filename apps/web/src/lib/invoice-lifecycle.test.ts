import { describe, expect, test } from "bun:test";

import {
  canCancelInvoice,
  canDeleteInvoice,
  canEditInvoice,
  canMarkInvoicePaid,
  canSendInvoice,
  canSendInvoiceReminder,
  isInvoiceSendFinalized,
  normalizeInvoiceStatus,
} from "@/lib/invoice-lifecycle";

describe("invoice lifecycle", () => {
  test("normalizes unknown statuses to draft", () => {
    expect(normalizeInvoiceStatus(null)).toBe("draft");
    expect(normalizeInvoiceStatus("weird")).toBe("draft");
  });

  test("draft invoices are editable and sendable", () => {
    expect(canEditInvoice("draft")).toBe(true);
    expect(canDeleteInvoice("draft")).toBe(true);
    expect(canSendInvoice("draft")).toBe(true);
    expect(canCancelInvoice("draft")).toBe(false);
  });

  test("sent invoices can be reminded or cancelled", () => {
    expect(canSendInvoiceReminder("sent")).toBe(true);
    expect(canSendInvoiceReminder("overdue")).toBe(true);
    expect(canCancelInvoice("sent")).toBe(true);
    expect(canMarkInvoicePaid("sent")).toBe(true);
  });

  test("paid and cancelled invoices are terminal for the key actions", () => {
    expect(canMarkInvoicePaid("paid")).toBe(false);
    expect(canCancelInvoice("paid")).toBe(false);
    expect(canMarkInvoicePaid("cancelled")).toBe(false);
    expect(canCancelInvoice("cancelled")).toBe(false);
  });

  test("cancelled invoices can be deleted", () => {
    expect(canDeleteInvoice("cancelled")).toBe(true);
    expect(canDeleteInvoice("sent")).toBe(false);
    expect(canDeleteInvoice("paid")).toBe(false);
    expect(canDeleteInvoice("overdue")).toBe(false);
  });

  test("bank-transfer invoices finalize after sent activity", () => {
    expect(isInvoiceSendFinalized("sent", true)).toBe(true);
    expect(isInvoiceSendFinalized("sent", false)).toBe(false);
    expect(isInvoiceSendFinalized("draft", true)).toBe(false);
  });
});
