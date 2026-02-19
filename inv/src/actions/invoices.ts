"use server";

import { renderToBuffer } from "@react-pdf/renderer";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { InvoicePdf } from "@/components/invoice-pdf";
import { InvoiceSentEmail } from "@/emails/invoice-sent";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { activityLog, clients, invoices, lineItems, users } from "@/lib/db/schema";
import { resend } from "@/lib/email";
import { createPaymentLink } from "@/lib/stripe";

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

  const user = await getCurrentUser();
  const userId = user.id;
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
  _prevState: { error?: string; invoiceId?: string; success?: boolean } | null,
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
  return { invoiceId, success: true };
}

export async function deleteInvoice(invoiceId: string) {
  await db.delete(invoices).where(eq(invoices.id, invoiceId));
  revalidatePath("/invoices");
}

export async function sendInvoice(invoiceId: string) {
  // Step 1: Query invoice with client and line items
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) {
    return { error: "Invoice not found" };
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1);
  if (!client) {
    return { error: "Client not found" };
  }

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, invoiceId))
    .orderBy(asc(lineItems.sortOrder));

  const user = await getCurrentUser();

  // Step 2: Generate PDF buffer
  const pdfBuffer = await renderToBuffer(
    InvoicePdf({
      business: {
        address: user.businessAddress,
        bankDetails: user.bankDetails,
        name: user.businessName,
        vatNumber: user.vatNumber,
      },
      client: {
        address: client.address,
        company: client.company,
        email: client.email,
        name: client.name,
        vatNumber: client.vatNumber,
      },
      invoice: {
        currency: invoice.currency ?? "EUR",
        dueAt: invoice.dueAt,
        issuedAt: invoice.issuedAt,
        lineItems: items.map((item) => ({
          amount: item.amount,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        notes: invoice.notes,
        number: invoice.number,
        reverseCharge: invoice.reverseCharge,
        subtotal: invoice.subtotal ?? "0",
        taxAmount: invoice.taxAmount ?? "0",
        taxRate: invoice.taxRate ?? "0",
        total: invoice.total ?? "0",
      },
    }),
  );

  // Step 3: Create Stripe payment link
  const paymentLink = await createPaymentLink({
    currency: invoice.currency,
    id: invoice.id,
    number: invoice.number,
    total: invoice.total,
  });

  // Step 4: Send email via Resend with PDF attachment and payment link
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ?? `${user.businessName ?? "inv."} <invoices@resend.dev>`;
  await resend.emails.send({
    attachments: [
      {
        content: pdfBuffer.toString("base64"),
        filename: `${invoice.number}.pdf`,
      },
    ],
    from: fromEmail,
    react: InvoiceSentEmail({
      businessName: user.businessName ?? "inv.",
      clientName: client.name,
      currency: invoice.currency ?? "EUR",
      dueAt: invoice.dueAt,
      invoiceNumber: invoice.number,
      paymentLinkUrl: paymentLink.url,
      total: invoice.total ?? "0",
    }),
    subject: `Invoice ${invoice.number} from ${user.businessName ?? "inv."}`,
    to: [client.email],
  });

  // Step 5: Update invoice status and Stripe link data
  await db
    .update(invoices)
    .set({
      sentAt: new Date(),
      status: "sent",
      stripePaymentLinkId: paymentLink.id,
      stripePaymentLinkUrl: paymentLink.url,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));

  // Step 6: Log activity
  await db.insert(activityLog).values({
    action: "sent",
    invoiceId,
  });

  // Step 7: Revalidate paths
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  return { success: true };
}

export async function duplicateInvoice(invoiceId: string) {
  const [original] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);

  if (!original) {
    throw new Error("Invoice not found");
  }

  const originalItems = await db.select().from(lineItems).where(eq(lineItems.invoiceId, invoiceId));

  const today = new Date().toISOString().split("T")[0];
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const inserted = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        invoicePrefix: users.invoicePrefix,
        nextInvoiceNumber: users.nextInvoiceNumber,
      })
      .from(users)
      .where(eq(users.id, original.userId))
      .limit(1);

    const prefix = user.invoicePrefix || "INV";
    const num = user.nextInvoiceNumber || 1;
    const number = `${prefix}-${String(num).padStart(4, "0")}`;

    await tx
      .update(users)
      .set({ nextInvoiceNumber: num + 1 })
      .where(eq(users.id, original.userId));

    const [inv] = await tx
      .insert(invoices)
      .values({
        clientId: original.clientId,
        currency: original.currency,
        dueAt: dueDate,
        internalNotes: original.internalNotes,
        issuedAt: today,
        notes: original.notes,
        number,
        reverseCharge: original.reverseCharge,
        subtotal: original.subtotal,
        taxAmount: original.taxAmount,
        taxRate: original.taxRate,
        total: original.total,
        userId: original.userId,
      })
      .returning({ id: invoices.id });

    if (originalItems.length > 0) {
      await tx.insert(lineItems).values(
        originalItems.map((item, index) => ({
          amount: item.amount,
          description: item.description,
          invoiceId: inv.id,
          quantity: item.quantity,
          sortOrder: index,
          unitPrice: item.unitPrice,
        })),
      );
    }

    await tx.insert(activityLog).values({
      action: "created",
      invoiceId: inv.id,
      metadata: { duplicatedFrom: invoiceId },
    });

    return inv;
  });

  revalidatePath("/invoices");
  return inserted.id;
}
