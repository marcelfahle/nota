import { expect, test } from "bun:test";

import {
  canCancelInvoice,
  canCreateInvoice,
  canDeleteInvoice,
  canEditDraft,
  canManageBankAccounts,
  canManageMembers,
  canManageSettings,
  canMarkInvoicePaid,
  canSendInvoice,
  canSendInvoiceReminder,
} from "@/lib/roles";

test("role permissions follow the owner > admin > member hierarchy", () => {
  expect(canManageMembers("owner")).toBe(true);
  expect(canManageMembers("admin")).toBe(false);
  expect(canManageMembers("member")).toBe(false);

  expect(canManageSettings("owner")).toBe(true);
  expect(canManageSettings("admin")).toBe(false);

  expect(canManageBankAccounts("owner")).toBe(true);
  expect(canManageBankAccounts("admin")).toBe(true);
  expect(canManageBankAccounts("member")).toBe(false);

  expect(canSendInvoice("owner")).toBe(true);
  expect(canSendInvoice("admin")).toBe(true);
  expect(canSendInvoice("member")).toBe(false);
  expect(canSendInvoiceReminder("member")).toBe(false);

  expect(canDeleteInvoice("owner")).toBe(true);
  expect(canDeleteInvoice("admin")).toBe(true);
  expect(canDeleteInvoice("member")).toBe(false);

  expect(canCancelInvoice("owner")).toBe(true);
  expect(canCancelInvoice("admin")).toBe(true);
  expect(canCancelInvoice("member")).toBe(false);

  expect(canMarkInvoicePaid("owner")).toBe(true);
  expect(canMarkInvoicePaid("admin")).toBe(true);
  expect(canMarkInvoicePaid("member")).toBe(false);

  expect(canCreateInvoice("owner")).toBe(true);
  expect(canCreateInvoice("admin")).toBe(true);
  expect(canCreateInvoice("member")).toBe(true);

  expect(canEditDraft("owner")).toBe(true);
  expect(canEditDraft("admin")).toBe(true);
  expect(canEditDraft("member")).toBe(true);
});
