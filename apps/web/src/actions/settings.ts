"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { deleteManagedLogo, uploadOrgFavicon, uploadOrgLogo } from "@/lib/logo-storage";
import { canManageSettings, getInsufficientPermissionsError } from "@/lib/roles";

const settingsSchema = z.object({
  defaultCurrency: z.string().optional().default("EUR"),
  invoiceDigits: z.coerce.number().int().min(3).max(10).default(4),
  invoicePrefix: z.string().optional().default("INV"),
  invoiceSeparator: z.enum(["-", "/", ".", ""]).default("-"),
  nextInvoiceNumber: z.coerce.number().int().min(1).optional(),
});

const brandFieldSchema = z.enum([
  "brandColor",
  "businessName",
  "city",
  "contactEmail",
  "country",
  "invoiceLayout",
  "legalName",
  "name",
  "postalCode",
  "region",
  "street",
  "vatNumber",
  "website",
]);

const brandSettingsSchema = z.object({
  brandColor: z.string().regex(/^#[\da-f]{6}$/i, "Choose a six-digit hex colour"),
  businessName: z.string().trim().max(250),
  city: z.string().trim().max(250),
  contactEmail: z.union([z.literal(""), z.email("Enter a valid email address")]),
  country: z.string().trim().max(250),
  dirtyFields: z
    .string()
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(z.array(brandFieldSchema)),
  invoiceLayout: z.literal("classic"),
  legalName: z.string().trim().max(250),
  name: z.string().trim().min(1, "Shown as is required").max(250),
  postalCode: z.string().trim().max(40),
  region: z.string().trim().max(250),
  street: z.string().trim().max(500),
  vatNumber: z.string().trim().max(100),
  website: z.string().trim().max(500),
});

export async function updateBrandSettings(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const parsed = brandSettingsSchema.safeParse({
    brandColor: formData.get("brandColor"),
    businessName: formData.get("businessName"),
    city: formData.get("city"),
    contactEmail: formData.get("contactEmail"),
    country: formData.get("country"),
    dirtyFields: formData.get("dirtyFields"),
    invoiceLayout: formData.get("invoiceLayout"),
    legalName: formData.get("legalName"),
    name: formData.get("name"),
    postalCode: formData.get("postalCode"),
    region: formData.get("region"),
    street: formData.get("street"),
    vatNumber: formData.get("vatNumber"),
    website: formData.get("website"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { org, role } = await getCurrentUser();
  if (!canManageSettings(role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const logoFile = formData.get("logoFile");
  const faviconFile = formData.get("faviconFile");
  const hasLogoFile = typeof logoFile !== "string" && logoFile !== null && logoFile.size > 0;
  const hasFaviconFile =
    typeof faviconFile !== "string" && faviconFile !== null && faviconFile.size > 0;
  const uploaded: Array<string> = [];
  let logoUrl = formData.get("removeLogo") === "true" ? null : org.logoUrl;
  let faviconUrl = formData.get("removeFavicon") === "true" ? null : org.faviconUrl;

  if (hasLogoFile) {
    const result = await uploadOrgLogo(org.id, logoFile);
    if ("error" in result) {
      return { error: result.error };
    }
    logoUrl = result.url;
    uploaded.push(result.url);
  }
  if (hasFaviconFile) {
    const result = await uploadOrgFavicon(org.id, faviconFile);
    if ("error" in result) {
      await Promise.all(uploaded.map(deleteManagedLogo));
      return { error: result.error.replace("Logo", "Favicon") };
    }
    faviconUrl = result.url;
    uploaded.push(result.url);
  }

  const { dirtyFields, ...values } = parsed.data;
  const update = Object.fromEntries(
    dirtyFields.map((field) => [field, values[field] || null]),
  ) as Partial<typeof values>;
  if (dirtyFields.includes("name")) {
    update.name = values.name;
  }
  const now = new Date().toISOString();
  const profileSources = { ...(org.profileSources ?? {}) };
  for (const field of dirtyFields) {
    profileSources[field] = { at: now, confirmed: true, source: "user" };
  }

  try {
    await db
      .update(orgs)
      .set({ ...update, faviconUrl, logoUrl, profileSources })
      .where(eq(orgs.id, org.id));
  } catch {
    await Promise.all(uploaded.map(deleteManagedLogo));
    return { error: "Could not update brand settings right now" };
  }

  if (logoUrl !== org.logoUrl) {
    await deleteManagedLogo(org.logoUrl);
  }
  if (faviconUrl !== org.faviconUrl) {
    await deleteManagedLogo(org.faviconUrl);
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true };
}

export async function updateSettings(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData,
) {
  const raw = {
    defaultCurrency: (formData.get("defaultCurrency") as string) || undefined,
    invoiceDigits: formData.get("invoiceDigits") as string,
    invoicePrefix: (formData.get("invoicePrefix") as string) ?? "",
    invoiceSeparator:
      ((formData.get("invoiceSeparator") as string) ?? "-") === "none"
        ? ""
        : ((formData.get("invoiceSeparator") as string) ?? "-"),
    nextInvoiceNumber: (formData.get("nextInvoiceNumber") as string) || undefined,
  };

  const result = settingsSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { org, role } = await getCurrentUser();

  if (!canManageSettings(role)) {
    return { error: getInsufficientPermissionsError() };
  }

  try {
    await db.update(orgs).set(result.data).where(eq(orgs.id, org.id));
  } catch {
    return { error: "Could not update settings right now" };
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true };
}
