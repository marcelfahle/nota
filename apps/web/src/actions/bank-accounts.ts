"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankAccounts } from "@/lib/db/schema";
import { formatIban, formatIbanDisplay, validateIban } from "@/lib/iban";
import { canManageBankAccounts, getInsufficientPermissionsError } from "@/lib/roles";

const ibanAccountSchema = z.object({
  accountType: z.literal("iban"),
  bic: z.string().max(11).transform((v) => v.trim()).default(""),
  iban: z
    .string()
    .min(1, "IBAN is required")
    .check(
      z.refine((val) => validateIban(val).valid, {
        message: "Invalid IBAN",
      }),
    ),
  isDefault: z.boolean().default(false),
  name: z.string().min(1, "Account name is required"),
});

const freeformAccountSchema = z.object({
  accountType: z.literal("freeform"),
  details: z.string().min(1, "Bank details are required"),
  isDefault: z.boolean().default(false),
  name: z.string().min(1, "Account name is required"),
});

const bankAccountSchema = z.discriminatedUnion("accountType", [
  ibanAccountSchema,
  freeformAccountSchema,
]);

function parseBankAccountFormData(formData: FormData) {
  const accountType = (formData.get("accountType") as string) || "freeform";

  if (accountType === "iban") {
    return {
      accountType: "iban" as const,
      bic: (formData.get("bic") as string) || "",
      iban: (formData.get("iban") as string) || "",
      isDefault: formData.get("isDefault") === "true",
      name: formData.get("name") as string,
    };
  }

  return {
    accountType: "freeform" as const,
    details: (formData.get("details") as string) || "",
    isDefault: formData.get("isDefault") === "true",
    name: formData.get("name") as string,
  };
}

function buildInsertValues(data: z.infer<typeof bankAccountSchema>) {
  if (data.accountType === "iban") {
    const normalized = formatIban(data.iban);
    const display = formatIbanDisplay(data.iban);
    const details = data.bic ? `${display}\nBIC: ${data.bic}` : display;
    return {
      accountType: "iban" as const,
      bic: data.bic || null,
      details,
      iban: normalized,
      isDefault: data.isDefault,
      name: data.name,
    };
  }

  return {
    accountType: "freeform" as const,
    bic: null,
    details: data.details,
    iban: null,
    isDefault: data.isDefault,
    name: data.name,
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

  const { org, role, user } = await getCurrentUser();

  if (!canManageBankAccounts(role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const values = buildInsertValues(result.data);

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.orgId, org.id));

    const shouldBeDefault = values.isDefault || existing.length === 0;

    if (shouldBeDefault) {
      await tx.update(bankAccounts).set({ isDefault: false }).where(eq(bankAccounts.orgId, org.id));
    }

    await tx.insert(bankAccounts).values({
      ...values,
      isDefault: shouldBeDefault,
      orgId: org.id,
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

  const { org, role } = await getCurrentUser();

  if (!canManageBankAccounts(role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const values = buildInsertValues(result.data);

  await db.transaction(async (tx) => {
    if (values.isDefault) {
      await tx.update(bankAccounts).set({ isDefault: false }).where(eq(bankAccounts.orgId, org.id));
    }

    await tx
      .update(bankAccounts)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.orgId, org.id)));
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function deleteBankAccount(accountId: string) {
  const { org, role } = await getCurrentUser();

  if (!canManageBankAccounts(role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const [account] = await db
    .select({ isDefault: bankAccounts.isDefault })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.orgId, org.id)))
    .limit(1);

  if (!account) {
    return { error: "Account not found" };
  }

  if (account.isDefault) {
    return { error: "Cannot delete the default account. Set another account as default first." };
  }

  await db
    .delete(bankAccounts)
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.orgId, org.id)));

  revalidatePath("/settings");
  return { success: true };
}
