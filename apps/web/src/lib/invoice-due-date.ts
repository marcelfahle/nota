import { z } from "zod";

import type { AuthenticatedRole } from "@/lib/auth";
import { canEditDraft, canSendInvoice, getInsufficientPermissionsError } from "@/lib/roles";

export function resolveDueDateChange(input: {
  dueAt: string;
  issuedAt: string;
  role: AuthenticatedRole;
  status: string | null;
  today?: string;
}) {
  if (!["draft", "sent", "overdue"].includes(input.status ?? "")) {
    throw new Error("Only draft, sent, or overdue invoices can have their due dates changed.");
  }
  if (!(input.status === "draft" ? canEditDraft(input.role) : canSendInvoice(input.role))) {
    throw new Error(getInsufficientPermissionsError());
  }
  if (!z.iso.date().safeParse(input.dueAt).success) {
    throw new Error("Due date must be a valid date in YYYY-MM-DD format.");
  }
  if (input.dueAt < input.issuedAt) {
    throw new Error("Due date cannot be before the issue date.");
  }
  return {
    dueAt: input.dueAt,
    status:
      input.status === "draft"
        ? ("draft" as const)
        : input.dueAt < (input.today ?? new Date().toISOString().slice(0, 10))
          ? ("overdue" as const)
          : ("sent" as const),
  };
}
