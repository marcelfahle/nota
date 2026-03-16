"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankAccounts, clients } from "@/lib/db/schema";

const clientSchema = z.object({
  address: z.string().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  company: z.string().nullable().optional(),
  defaultCurrency: z.string().optional().default("EUR"),
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  notes: z.string().nullable().optional(),
  vatNumber: z.string().nullable().optional(),
});

function parseClientFormData(formData: FormData) {
  const bankAccountId = formData.get("bankAccountId") as string;
  return {
    address: (formData.get("address") as string) || null,
    bankAccountId: bankAccountId && bankAccountId !== "" ? bankAccountId : null,
    company: (formData.get("company") as string) || null,
    defaultCurrency: (formData.get("defaultCurrency") as string) || undefined,
    email: formData.get("email") as string,
    name: formData.get("name") as string,
    notes: (formData.get("notes") as string) || null,
    vatNumber: (formData.get("vatNumber") as string) || null,
  };
}

export async function createClient(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const raw = parseClientFormData(formData);

  const result = clientSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { org, user } = await getCurrentUser();
  if (result.data.bankAccountId) {
    const [bankAccount] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, result.data.bankAccountId), eq(bankAccounts.orgId, org.id)))
      .limit(1);

    if (!bankAccount) {
      return { error: "Invalid bank account" };
    }
  }

  await db.insert(clients).values({
    ...result.data,
    orgId: org.id,
    userId: user.id,
  });

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
    return { error: result.error.issues[0].message };
  }

  const { org } = await getCurrentUser();
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.orgId, org.id)))
    .limit(1);

  if (!client) {
    return { error: "Client not found" };
  }

  if (result.data.bankAccountId) {
    const [bankAccount] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, result.data.bankAccountId), eq(bankAccounts.orgId, org.id)))
      .limit(1);

    if (!bankAccount) {
      return { error: "Invalid bank account" };
    }
  }

  await db
    .update(clients)
    .set({ ...result.data, updatedAt: new Date() })
    .where(and(eq(clients.id, clientId), eq(clients.orgId, org.id)));

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}

export async function deleteClient(clientId: string) {
  const { org } = await getCurrentUser();

  await db.delete(clients).where(and(eq(clients.id, clientId), eq(clients.orgId, org.id)));
  revalidatePath("/clients");
}
