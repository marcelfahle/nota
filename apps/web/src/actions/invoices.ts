"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { activityLog, invoices } from "@/lib/db/schema";
import { canSendInvoice as canSendInvoiceStatus } from "@/lib/invoice-lifecycle";
import {
  cancelInvoice as cancelInvoiceService,
  createInvoice as createInvoiceService,
  deleteInvoice as deleteInvoiceService,
  duplicateInvoice as duplicateInvoiceService,
  getOwnedInvoice,
  markInvoicePaid as markInvoicePaidService,
  sendInvoice as sendInvoiceService,
  sendReminder as sendReminderService,
  type InvoiceServiceContext,
  updateInvoice as updateInvoiceService,
} from "@/lib/invoice-service";
import { canSendInvoice as canSendInvoiceRole, getInsufficientPermissionsError } from "@/lib/roles";

const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitPrice: z.coerce.number().min(0, "Unit price must be non-negative"),
});

const invoiceSchema = z.object({
  clientId: z.string().uuid("Invalid client"),
  currency: z.string().default("EUR"),
  dueAt: z.string().min(1, "Due date is required"),
  internalNotes: z.string().optional(),
  issuedAt: z.string().min(1, "Issue date is required"),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
  notes: z.string().optional(),
  reverseCharge: z.string().default("false"),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});

function parseInvoiceFormData(formData: FormData) {
  return {
    clientId: formData.get("clientId") as string,
    currency: (formData.get("currency") as string) || "EUR",
    dueAt: formData.get("dueAt") as string,
    internalNotes: (formData.get("internalNotes") as string) || undefined,
    issuedAt: formData.get("issuedAt") as string,
    lineItems: JSON.parse((formData.get("lineItems") as string) || "[]"),
    notes: (formData.get("notes") as string) || undefined,
    reverseCharge: formData.get("reverseCharge") === "true" ? "true" : "false",
    taxRate: formData.get("taxRate") as string,
  };
}

function buildServiceContext(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
): InvoiceServiceContext {
  return {
    orgId: user.org.id,
    role: user.role,
    userId: user.user.id,
  };
}

export async function createInvoice(
  _prevState: { error?: string; invoiceId?: string; success?: boolean } | null,
  formData: FormData,
) {
  const result = invoiceSchema.safeParse(parseInvoiceFormData(formData));
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const currentUser = await getCurrentUser();
  const serviceResult = await createInvoiceService(buildServiceContext(currentUser), result.data);
  if ("error" in serviceResult) {
    return { error: serviceResult.error };
  }

  revalidatePath("/invoices");
  return { invoiceId: serviceResult.invoiceId, success: true };
}

export async function updateInvoice(
  invoiceId: string,
  _prevState: { error?: string; invoiceId?: string; success?: boolean } | null,
  formData: FormData,
) {
  const result = invoiceSchema.safeParse(parseInvoiceFormData(formData));
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const currentUser = await getCurrentUser();
  const serviceResult = await updateInvoiceService(
    buildServiceContext(currentUser),
    invoiceId,
    result.data,
  );
  if ("error" in serviceResult) {
    return { error: serviceResult.error };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  return { invoiceId: serviceResult.invoiceId, success: true };
}

export async function deleteInvoice(invoiceId: string) {
  const currentUser = await getCurrentUser();
  const serviceResult = await deleteInvoiceService(buildServiceContext(currentUser), invoiceId);
  if ("error" in serviceResult) {
    return { error: serviceResult.error };
  }

  revalidatePath("/invoices");
  return { success: true };
}

export async function sendInvoice(invoiceId: string) {
  const currentUser = await getCurrentUser();
  const serviceResult = await sendInvoiceService(buildServiceContext(currentUser), invoiceId);
  if ("error" in serviceResult) {
    return { error: serviceResult.error };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true };
}

export async function sendReminder(invoiceId: string) {
  const currentUser = await getCurrentUser();
  const serviceResult = await sendReminderService(buildServiceContext(currentUser), invoiceId);
  if ("error" in serviceResult) {
    return { error: serviceResult.error };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true };
}

export async function duplicateInvoice(invoiceId: string) {
  const currentUser = await getCurrentUser();
  const serviceResult = await duplicateInvoiceService(buildServiceContext(currentUser), invoiceId);
  if ("error" in serviceResult) {
    return serviceResult.error;
  }

  revalidatePath("/invoices");
  return serviceResult.invoiceId;
}

export async function markInvoiceSent(invoiceId: string) {
  const currentUser = await getCurrentUser();

  if (!canSendInvoiceRole(currentUser.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const invoice = await getOwnedInvoice(currentUser.org.id, invoiceId);
  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (!canSendInvoiceStatus(invoice.status)) {
    return { error: "Only draft invoices can be marked as sent" };
  }

  const sentAt = new Date();
  await db
    .update(invoices)
    .set({
      sentAt,
      status: "sent",
      updatedAt: sentAt,
    })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, currentUser.org.id)));

  await db.insert(activityLog).values({
    action: "sent",
    invoiceId,
    metadata: { manual: true },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  return { success: true };
}

export async function markInvoicePaid(invoiceId: string) {
  const currentUser = await getCurrentUser();
  const serviceResult = await markInvoicePaidService(buildServiceContext(currentUser), invoiceId);
  if ("error" in serviceResult) {
    return { error: serviceResult.error };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true };
}

export async function cancelInvoice(invoiceId: string) {
  const currentUser = await getCurrentUser();
  const serviceResult = await cancelInvoiceService(buildServiceContext(currentUser), invoiceId);
  if ("error" in serviceResult) {
    return { error: serviceResult.error };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true, warning: serviceResult.warning };
}
