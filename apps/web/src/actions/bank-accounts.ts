"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankAccounts } from "@/lib/db/schema";

const bankAccountSchema = z.object({
  details: z.string().min(1, "Bank details are required"),
  isDefault: z.boolean().default(false),
  name: z.string().min(1, "Account name is required"),
});

function parseBankAccountFormData(formData: FormData) {
  return {
    details: formData.get("details") as string,
    isDefault: formData.get("isDefault") === "true",
    name: formData.get("name") as string,
  };
}

export async function createBankAccount(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const result = bankAccountSchema.safeParse(parseBankAccountFormData(formData));
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const user = await getCurrentUser();

  await db.transaction(async (tx) => {
    // If this is the first account or marked as default, ensure only one default
    const existing = await tx
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, user.id));

    const shouldBeDefault = result.data.isDefault || existing.length === 0;

    if (shouldBeDefault) {
      await tx
        .update(bankAccounts)
        .set({ isDefault: false })
        .where(eq(bankAccounts.userId, user.id));
    }

    await tx.insert(bankAccounts).values({
      details: result.data.details,
      isDefault: shouldBeDefault,
      name: result.data.name,
      userId: user.id,
    });
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function updateBankAccount(
  accountId: string,
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const result = bankAccountSchema.safeParse(parseBankAccountFormData(formData));
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const user = await getCurrentUser();

  await db.transaction(async (tx) => {
    if (result.data.isDefault) {
      await tx
        .update(bankAccounts)
        .set({ isDefault: false })
        .where(eq(bankAccounts.userId, user.id));
    }

    await tx
      .update(bankAccounts)
      .set({
        details: result.data.details,
        isDefault: result.data.isDefault,
        name: result.data.name,
        updatedAt: new Date(),
      })
      .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, user.id)));
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function deleteBankAccount(accountId: string) {
  const user = await getCurrentUser();

  // Prevent deleting the default account
  const [account] = await db
    .select({ isDefault: bankAccounts.isDefault })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, user.id)))
    .limit(1);

  if (!account) {
    return { error: "Account not found" };
  }

  if (account.isDefault) {
    return { error: "Cannot delete the default account. Set another account as default first." };
  }

  await db
    .delete(bankAccounts)
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, user.id)));

  revalidatePath("/settings");
  return { success: true };
}
