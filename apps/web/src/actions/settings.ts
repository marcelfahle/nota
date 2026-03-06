"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { canManageSettings, getInsufficientPermissionsError } from "@/lib/roles";

const settingsSchema = z.object({
  businessAddress: z.string().optional(),
  businessName: z.string().optional(),
  defaultCurrency: z.string().optional().default("EUR"),
  invoiceDigits: z.coerce.number().int().min(3).max(10).default(4),
  invoicePrefix: z.string().optional().default("INV"),
  invoiceSeparator: z.enum(["-", "/", ".", ""]).default("-"),
  logoUrl: z.preprocess((value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.url("Invalid logo URL").optional()),
  nextInvoiceNumber: z.coerce.number().int().min(1).optional(),
  vatNumber: z.string().optional(),
});

export async function updateSettings(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const raw = {
    businessAddress: (formData.get("businessAddress") as string) || undefined,
    businessName: (formData.get("businessName") as string) || undefined,
    defaultCurrency: (formData.get("defaultCurrency") as string) || undefined,
    invoiceDigits: formData.get("invoiceDigits") as string,
    invoicePrefix: (formData.get("invoicePrefix") as string) ?? "",
    invoiceSeparator: (formData.get("invoiceSeparator") as string) ?? "-",
    logoUrl: (formData.get("logoUrl") as string) || undefined,
    nextInvoiceNumber: (formData.get("nextInvoiceNumber") as string) || undefined,
    vatNumber: (formData.get("vatNumber") as string) || undefined,
  };

  const result = settingsSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { org, role } = await getCurrentUser();

  if (!canManageSettings(role)) {
    return { error: getInsufficientPermissionsError() };
  }

  await db.update(orgs).set(result.data).where(eq(orgs.id, org.id));

  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true };
}
