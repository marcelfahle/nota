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
    expect(canSendInvoiceReminder("sent", true)).toBe(true);
    expect(canSendInvoiceReminder("sent", false)).toBe(false);
    expect(canCancelInvoice("sent")).toBe(true);
    expect(canMarkInvoicePaid("sent")).toBe(true);
  });

  test("paid and cancelled invoices are terminal for the key actions", () => {
    expect(canMarkInvoicePaid("paid")).toBe(false);
    expect(canCancelInvoice("paid")).toBe(false);
    expect(canMarkInvoicePaid("cancelled")).toBe(false);
    expect(canCancelInvoice("cancelled")).toBe(false);
  });

  test("send finalization requires a sent status, activity, and payment link", () => {
    expect(isInvoiceSendFinalized("sent", true, true)).toBe(true);
    expect(isInvoiceSendFinalized("sent", false, true)).toBe(false);
    expect(isInvoiceSendFinalized("sent", true, false)).toBe(false);
    expect(isInvoiceSendFinalized("draft", true, true)).toBe(false);
  });
});
