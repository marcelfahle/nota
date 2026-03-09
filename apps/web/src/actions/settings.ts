"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { deleteManagedLogo, uploadOrgLogo } from "@/lib/logo-storage";
import { canManageSettings, getInsufficientPermissionsError } from "@/lib/roles";

const settingsSchema = z.object({
  businessAddress: z.string().optional(),
  businessName: z.string().optional(),
  defaultCurrency: z.string().optional().default("EUR"),
  invoiceDigits: z.coerce.number().int().min(3).max(10).default(4),
  invoicePrefix: z.string().optional().default("INV"),
  invoiceSeparator: z.enum(["-", "/", ".", ""]).default("-"),
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
    invoiceSeparator:
      ((formData.get("invoiceSeparator") as string) ?? "-") === "none"
        ? ""
        : ((formData.get("invoiceSeparator") as string) ?? "-"),
    nextInvoiceNumber: (formData.get("nextInvoiceNumber") as string) || undefined,
    vatNumber: (formData.get("vatNumber") as string) || undefined,
  };

  const result = settingsSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const logoFile = formData.get("logoFile");
  const hasLogoFile = typeof logoFile !== "string" && logoFile !== null && logoFile.size > 0;
  const shouldRemoveLogo = formData.get("removeLogo") === "true";
  const { org, role } = await getCurrentUser();

  if (!canManageSettings(role)) {
    return { error: getInsufficientPermissionsError() };
  }

  let nextLogoUrl = org.logoUrl;
  let uploadedLogoUrl: string | null = null;
  if (hasLogoFile) {
    const uploadResult = await uploadOrgLogo(org.id, logoFile);
    if ("error" in uploadResult) {
      return { error: uploadResult.error };
    }

    nextLogoUrl = uploadResult.url;
    uploadedLogoUrl = uploadResult.url;
  } else if (shouldRemoveLogo) {
    nextLogoUrl = null;
  }

  try {
    await db
      .update(orgs)
      .set({
        ...result.data,
        logoUrl: nextLogoUrl,
      })
      .where(eq(orgs.id, org.id));
  } catch {
    if (uploadedLogoUrl) {
      await deleteManagedLogo(uploadedLogoUrl);
    }

    return { error: "Could not update settings right now" };
  }

  if (nextLogoUrl !== org.logoUrl) {
    await deleteManagedLogo(org.logoUrl);
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true };
}
