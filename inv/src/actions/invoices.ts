"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { invoices, lineItems, users, activityLog } from "@/lib/db/schema";

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

async function getUserId(): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).limit(1);
  if (!user) {
    throw new Error("No user found");
  }
  return user.id;
}

function calculateTotals(items: Array<{ quantity: number; unitPrice: number }>, taxRate: number) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return {
    subtotal: subtotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    taxRate: taxRate.toFixed(2),
    total: total.toFixed(2),
  };
}

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

export async function createInvoice(
  _prevState: { error?: string; invoiceId?: string; success?: boolean } | null,
  formData: FormData,
) {
  const result = invoiceSchema.safeParse(parseInvoiceFormData(formData));
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const userId = await getUserId();
  const { lineItems: items, taxRate, ...invoiceData } = result.data;
  const totals = calculateTotals(items, taxRate);

  const inserted = await db.transaction(async (tx) => {
    // Generate invoice number atomically
    const [user] = await tx
      .select({
        invoicePrefix: users.invoicePrefix,
        nextInvoiceNumber: users.nextInvoiceNumber,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const prefix = user.invoicePrefix || "INV";
    const num = user.nextInvoiceNumber || 1;
    const number = `${prefix}-${String(num).padStart(4, "0")}`;

    await tx
      .update(users)
      .set({ nextInvoiceNumber: num + 1 })
      .where(eq(users.id, userId));

    // Insert invoice
    const [inv] = await tx
      .insert(invoices)
      .values({
        userId,
        ...invoiceData,
        number,
        ...totals,
      })
      .returning({ id: invoices.id });

    // Insert line items
    await tx.insert(lineItems).values(
      items.map((item, index) => ({
        amount: (item.quantity * item.unitPrice).toFixed(2),
        description: item.description,
        invoiceId: inv.id,
        quantity: item.quantity.toFixed(2),
        sortOrder: index,
        unitPrice: item.unitPrice.toFixed(2),
      })),
    );

    // Log activity
    await tx.insert(activityLog).values({
      action: "created",
      invoiceId: inv.id,
    });

    return inv;
  });

  revalidatePath("/invoices");
  return { invoiceId: inserted.id, success: true };
}

export async function updateInvoice(
  invoiceId: string,
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const result = invoiceSchema.safeParse(parseInvoiceFormData(formData));
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { lineItems: items, taxRate, ...invoiceData } = result.data;
  const totals = calculateTotals(items, taxRate);

  await db.transaction(async (tx) => {
    // Update invoice
    await tx
      .update(invoices)
      .set({
        ...invoiceData,
        ...totals,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    // Replace line items: delete old, insert new
    await tx.delete(lineItems).where(eq(lineItems.invoiceId, invoiceId));

    await tx.insert(lineItems).values(
      items.map((item, index) => ({
        amount: (item.quantity * item.unitPrice).toFixed(2),
        description: item.description,
        invoiceId,
        quantity: item.quantity.toFixed(2),
        sortOrder: index,
        unitPrice: item.unitPrice.toFixed(2),
      })),
    );
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true };
}

export async function deleteInvoice(invoiceId: string) {
  await db.delete(invoices).where(eq(invoices.id, invoiceId));
  revalidatePath("/invoices");
}
