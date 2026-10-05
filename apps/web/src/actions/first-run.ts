"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { auth } from "@/lib/better-auth";
import { formatOrgAddress } from "@/lib/branding";
import { db } from "@/lib/db";
import { bankAccounts, invoices, jobs, orgs } from "@/lib/db/schema";
import { formatIban, formatIbanDisplay, validateIban } from "@/lib/iban";
import { EMAIL_VERIFICATION_REQUIRED, getOwnedInvoice, sendInvoice } from "@/lib/invoice-service";
import { processPendingEmailJobs } from "@/lib/jobs";
import {
  canManageBankAccounts,
  canManageSettings,
  canSendInvoice,
  getInsufficientPermissionsError,
} from "@/lib/roles";
import { TAX_IDENTIFIER_TYPES, TaxIdentifierValidationError } from "@/lib/tax-identifier";
import { clientTaxIdentifierFields } from "@/lib/vat";

const MAX_UNCONFIRMED_TEST_COPIES = 3;

const profileSchema = z.object({
  city: z.string().trim().min(1, "City is required").max(250),
  country: z.string().trim().min(1, "Country is required").max(250),
  legalName: z.string().trim().min(1, "Legal name is required").max(250),
  postalCode: z.string().trim().max(40),
  street: z.string().trim().min(1, "Street and number are required").max(500),
  taxIdentifierType: z.enum(TAX_IDENTIFIER_TYPES),
  taxIdentifierValue: z.string().trim().max(100),
});

const bankSchema = z.object({
  accountHolder: z.string().trim().min(1, "Account holder is required").max(250),
  bic: z.string().trim().max(11),
  iban: z
    .string()
    .trim()
    .min(1, "IBAN is required")
    .refine((value) => validateIban(value).valid, "Enter a valid IBAN"),
});

function serviceContext(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  return {
    orgId: user.org.id,
    role: user.role,
    source: "web" as const,
    userId: user.user.id,
  };
}

export async function saveFirstRunProfile(
  _state: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const parsed = profileSchema.safeParse({
    city: formData.get("city"),
    country: formData.get("country"),
    legalName: formData.get("legalName"),
    postalCode: formData.get("postalCode"),
    street: formData.get("street"),
    taxIdentifierType: formData.get("taxIdentifierType"),
    taxIdentifierValue: formData.get("taxIdentifierValue"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { org, role } = await getCurrentUser();
  if (!canManageSettings(role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const profileSources = { ...(org.profileSources ?? {}) };
  const at = new Date().toISOString();
  for (const [field, value] of Object.entries(parsed.data)) {
    if (value !== org[field as keyof typeof parsed.data]) {
      profileSources[field] = { at, confirmed: true, source: "user" };
    }
  }
  try {
    const { taxIdentifierType, taxIdentifierValue, ...profile } = parsed.data;
    await db
      .update(orgs)
      .set({
        ...profile,
        ...(await clientTaxIdentifierFields({
          type: taxIdentifierType,
          value: taxIdentifierValue,
        })),
        profileSources,
      })
      .where(eq(orgs.id, org.id));
  } catch (error) {
    return {
      error:
        error instanceof TaxIdentifierValidationError
          ? error.message
          : "Could not save legal details",
    };
  }
  revalidatePath("/home");
  return { success: true };
}

export async function saveFirstRunBankDetails(
  _state: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const parsed = bankSchema.safeParse({
    accountHolder: formData.get("accountHolder"),
    bic: formData.get("bic"),
    iban: formData.get("iban"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { org, role, user } = await getCurrentUser();
  if (!canManageBankAccounts(role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const iban = formatIban(parsed.data.iban);
  const details = [
    `Account holder: ${parsed.data.accountHolder}`,
    `IBAN: ${formatIbanDisplay(iban)}`,
    parsed.data.bic ? `BIC: ${parsed.data.bic.toUpperCase()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await db.transaction(async (tx) => {
    await tx.update(bankAccounts).set({ isDefault: false }).where(eq(bankAccounts.orgId, org.id));
    await tx.insert(bankAccounts).values({
      accountType: "iban",
      bic: parsed.data.bic.toUpperCase() || null,
      details,
      iban,
      isDefault: true,
      name: parsed.data.accountHolder,
      orgId: org.id,
      userId: user.id,
    });
  });
  revalidatePath("/home");
  revalidatePath("/settings");
  return { success: true };
}

export async function sendFirstRunTestInvoice(invoiceId: string) {
  const currentUser = await getCurrentUser();
  if (!canSendInvoice(currentUser.role)) {
    return { error: getInsufficientPermissionsError() };
  }
  const invoice = await getOwnedInvoice(currentUser.org.id, invoiceId);
  if (!invoice || invoice.kind !== "invoice") {
    return { error: "Invoice not found" };
  }
  if (!currentUser.org.legalName || !formatOrgAddress(currentUser.org)) {
    return { error: "Add your legal name and address first." };
  }
  const [bank] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.orgId, currentUser.org.id), eq(bankAccounts.isDefault, true)))
    .limit(1);
  if (!bank) {
    return { error: "Add your bank details first." };
  }

  // Until the address is confirmed it could be someone else's, so an
  // unconfirmed account gets a few labelled test copies and no more.
  if (!currentUser.user.emailVerified) {
    const [{ sent }] = await db
      .select({ sent: count() })
      .from(jobs)
      .innerJoin(invoices, eq(invoices.id, jobs.invoiceId))
      .where(and(eq(invoices.orgId, currentUser.org.id), eq(jobs.type, "send_invoice_test_email")));
    if (sent >= MAX_UNCONFIRMED_TEST_COPIES) {
      return { error: "Confirm your email address to send more test copies." };
    }
  }

  await db.insert(jobs).values({
    invoiceId,
    payload: { invoiceId, recipient: currentUser.user.email },
    type: "send_invoice_test_email",
  });
  await processPendingEmailJobs(1).catch(() => null);
  revalidatePath("/home");
  return { success: true };
}

export async function requestFirstSendVerification() {
  const { user } = await getCurrentUser();
  if (user.emailVerified) {
    return { success: true };
  }
  try {
    await auth.api.sendVerificationEmail({
      body: { callbackURL: "/home", email: user.email },
    });
    return { success: true };
  } catch {
    return { error: "Could not send the confirmation email. Try again shortly." };
  }
}

export async function sendFirstInvoice(invoiceId: string) {
  const currentUser = await getCurrentUser();
  const invoice = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, currentUser.org.id)))
    .limit(1);
  if (!invoice[0]) {
    return { error: "Invoice not found" };
  }
  const result = await sendInvoice(serviceContext(currentUser), invoiceId);
  if ("error" in result) {
    return {
      error: result.error,
      verificationRequired: result.error === EMAIL_VERIFICATION_REQUIRED,
    };
  }
  revalidatePath("/home");
  revalidatePath("/invoices");
  return { success: true };
}
