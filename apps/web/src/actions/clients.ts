"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { localizeError } from "@/lib/action-errors";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankAccounts, clients } from "@/lib/db/schema";
import { TAX_IDENTIFIER_TYPES, TaxIdentifierValidationError } from "@/lib/tax-identifier";
import { clientTaxIdentifierFields } from "@/lib/vat";

const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Country must be a two-letter code such as DE")
  .nullable();

const clientSchema = z.object({
  address: z.string().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  city: z.string().trim().max(250).nullable(),
  company: z.string().nullable().optional(),
  countryCode: countryCodeSchema,
  defaultBuyerReference: z.string().trim().max(200).nullable(),
  defaultCurrency: z.string().optional().default("EUR"),
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  notes: z.string().nullable().optional(),
  postalCode: z.string().trim().max(40).nullable(),
  publicSector: z.boolean(),
  street: z.string().trim().max(500).nullable(),
  taxIdentifierType: z.enum(TAX_IDENTIFIER_TYPES),
  taxIdentifierValue: z.string().max(100),
});

function parseClientFormData(formData: FormData) {
  const bankAccountId = formData.get("bankAccountId") as string;
  return {
    address: (formData.get("address") as string) || null,
    bankAccountId: bankAccountId && bankAccountId !== "" ? bankAccountId : null,
    city: (formData.get("city") as string) || null,
    company: (formData.get("company") as string) || null,
    countryCode: (formData.get("countryCode") as string) || null,
    defaultBuyerReference: (formData.get("defaultBuyerReference") as string) || null,
    defaultCurrency: (formData.get("defaultCurrency") as string) || undefined,
    email: formData.get("email") as string,
    name: formData.get("name") as string,
    notes: (formData.get("notes") as string) || null,
    postalCode: (formData.get("postalCode") as string) || null,
    publicSector: formData.get("publicSector") === "true",
    street: (formData.get("street") as string) || null,
    taxIdentifierType: formData.get("taxIdentifierType") as string,
    taxIdentifierValue: (formData.get("taxIdentifierValue") as string) || "",
  };
}

async function taxFields(data: z.infer<typeof clientSchema>) {
  return clientTaxIdentifierFields({
    type: data.taxIdentifierType,
    value: data.taxIdentifierValue,
  });
}

export async function createClient(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const raw = parseClientFormData(formData);

  const result = clientSchema.safeParse(raw);
  if (!result.success) {
    return { error: await localizeError(result.error.issues[0].message) };
  }

  const { org, user } = await getCurrentUser();
  if (result.data.bankAccountId) {
    const [bankAccount] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, result.data.bankAccountId), eq(bankAccounts.orgId, org.id)))
      .limit(1);

    if (!bankAccount) {
      return { error: await localizeError("Invalid bank account") };
    }
  }

  try {
    const { taxIdentifierType: _type, taxIdentifierValue: _value, ...values } = result.data;
    await db.insert(clients).values({
      ...values,
      ...(await taxFields(result.data)),
      orgId: org.id,
      userId: user.id,
    });
  } catch (error) {
    return {
      error: await localizeError(
        error instanceof TaxIdentifierValidationError ? error.message : "Could not save the client",
      ),
    };
  }

  revalidatePath("/clients");
  return { success: true };
}

export async function updateClient(
  clientId: string,
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const raw = parseClientFormData(formData);

  const result = clientSchema.safeParse(raw);
  if (!result.success) {
    return { error: await localizeError(result.error.issues[0].message) };
  }

  const { org } = await getCurrentUser();
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.orgId, org.id)))
    .limit(1);

  if (!client) {
    return { error: await localizeError("Client not found") };
  }

  if (result.data.bankAccountId) {
    const [bankAccount] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, result.data.bankAccountId), eq(bankAccounts.orgId, org.id)))
      .limit(1);

    if (!bankAccount) {
      return { error: await localizeError("Invalid bank account") };
    }
  }

  try {
    const { taxIdentifierType: _type, taxIdentifierValue: _value, ...values } = result.data;
    await db
      .update(clients)
      .set({
        ...values,
        ...(await taxFields(result.data)),
        updatedAt: new Date(),
      })
      .where(and(eq(clients.id, clientId), eq(clients.orgId, org.id)));
  } catch (error) {
    return {
      error: await localizeError(
        error instanceof TaxIdentifierValidationError ? error.message : "Could not save the client",
      ),
    };
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}

export async function deleteClient(clientId: string) {
  const { org } = await getCurrentUser();

  await db.delete(clients).where(and(eq(clients.id, clientId), eq(clients.orgId, org.id)));
  revalidatePath("/clients");
}
