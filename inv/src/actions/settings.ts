"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const settingsSchema = z.object({
  bankDetails: z.string().optional(),
  businessAddress: z.string().optional(),
  businessName: z.string().optional(),
  defaultCurrency: z.string().optional().default("EUR"),
  invoicePrefix: z.string().optional().default("INV"),
  vatNumber: z.string().optional(),
});

export async function updateSettings(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const raw = {
    bankDetails: (formData.get("bankDetails") as string) || undefined,
    businessAddress: (formData.get("businessAddress") as string) || undefined,
    businessName: (formData.get("businessName") as string) || undefined,
    defaultCurrency: (formData.get("defaultCurrency") as string) || undefined,
    invoicePrefix: (formData.get("invoicePrefix") as string) || undefined,
    vatNumber: (formData.get("vatNumber") as string) || undefined,
  };

  const result = settingsSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const user = await getCurrentUser();

  await db.update(users).set(result.data).where(eq(users.id, user.id));

  revalidatePath("/settings");
  return { success: true };
}
