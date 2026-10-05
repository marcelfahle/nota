"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import {
  cancelInvoice as cancelInvoiceService,
  createCreditNote as createCreditNoteService,
  createInvoice as createInvoiceService,
  deleteInvoice as deleteInvoiceService,
  duplicateInvoice as duplicateInvoiceService,
  markInvoicePaid as markInvoicePaidService,
  markInvoiceSent as markInvoiceSentService,
  recordInvoicePayment as recordInvoicePaymentService,
  sendInvoice as sendInvoiceService,
  sendReminder as sendReminderService,
  type InvoiceServiceContext,
  updateInvoice as updateInvoiceService,
} from "@/lib/invoice-service";

const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.string().trim().min(1, "Quantity is required"),
  unitPrice: z.string().trim().min(1, "Unit price is required"),
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
  taxRate: z.string().trim().default("0"),
});

const paymentSchema = z.object({
  amount: z.union([z.number().finite(), z.string().trim().min(1)]),
  invoiceId: z.string().uuid("Invalid invoice"),
  method: z.enum(["bank_transfer", "other"]),
  note: z.string().trim().max(500, "Note is too long").optional(),
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
    source: "web",
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

export async function duplicateInvoice(
  invoiceId: string,
): Promise<{ error: string } | { invoiceId: string }> {
  const currentUser = await getCurrentUser();
  const serviceResult = await duplicateInvoiceService(buildServiceContext(currentUser), invoiceId);
  if ("error" in serviceResult) {
    return { error: serviceResult.error };
  }

  revalidatePath("/invoices");
  return { invoiceId: serviceResult.invoiceId };
}

export async function markInvoiceSent(invoiceId: string) {
  const currentUser = await getCurrentUser();
  const serviceResult = await markInvoiceSentService(buildServiceContext(currentUser), invoiceId);
  if ("error" in serviceResult) {
    return { error: serviceResult.error };
  }

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

export async function recordInvoicePayment(
  invoiceId: string,
  input: { amount: number | string; method: "bank_transfer" | "other"; note?: string },
) {
  const parsed = paymentSchema.safeParse({ invoiceId, ...input });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const currentUser = await getCurrentUser();
  const { invoiceId: validatedInvoiceId, ...payment } = parsed.data;
  const serviceResult = await recordInvoicePaymentService(
    buildServiceContext(currentUser),
    validatedInvoiceId,
    payment,
  );
  if ("error" in serviceResult) {
    return { error: serviceResult.error };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true, warning: serviceResult.warning };
}

export async function createCreditNote(invoiceId: string) {
  const currentUser = await getCurrentUser();
  const serviceResult = await createCreditNoteService(buildServiceContext(currentUser), invoiceId);
  if ("error" in serviceResult) {
    return { error: serviceResult.error };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { invoiceId: serviceResult.invoiceId, success: true };
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
