"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";

const clientSchema = z.object({
  address: z.string().optional(),
  company: z.string().optional(),
  defaultCurrency: z.string().optional().default("EUR"),
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  notes: z.string().optional(),
  vatNumber: z.string().optional(),
});

export async function createClient(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const raw = {
    address: (formData.get("address") as string) || undefined,
    company: (formData.get("company") as string) || undefined,
    defaultCurrency: (formData.get("defaultCurrency") as string) || undefined,
    email: formData.get("email") as string,
    name: formData.get("name") as string,
    notes: (formData.get("notes") as string) || undefined,
    vatNumber: (formData.get("vatNumber") as string) || undefined,
  };

  const result = clientSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const user = await getCurrentUser();

  await db.insert(clients).values({
    ...result.data,
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
  const raw = {
    address: (formData.get("address") as string) || undefined,
    company: (formData.get("company") as string) || undefined,
    defaultCurrency: (formData.get("defaultCurrency") as string) || undefined,
    email: formData.get("email") as string,
    name: formData.get("name") as string,
    notes: (formData.get("notes") as string) || undefined,
    vatNumber: (formData.get("vatNumber") as string) || undefined,
  };

  const result = clientSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  await db
    .update(clients)
    .set({ ...result.data, updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}

export async function deleteClient(clientId: string) {
  await db.delete(clients).where(eq(clients.id, clientId));
  revalidatePath("/clients");
}
