import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { bankAccounts } from "@/lib/db/schema";
import {
  normalizeTaxIdentifier,
  TAX_IDENTIFIER_TYPES,
  taxIdentifierFromColumns,
  taxIdentifierFromLegacyVatNumber,
} from "@/lib/tax-identifier";

export const clientPayloadSchema = z.object({
  address: z.string().trim().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  company: z.string().trim().optional(),
  defaultCurrency: z.string().trim().min(1).default("EUR"),
  email: z.email("Enter a valid email address"),
  name: z.string().trim().min(1, "Name is required"),
  notes: z.string().trim().optional(),
  taxIdentifier: z
    .object({
      countryCode: z.string().trim().length(2).nullable().optional(),
      type: z.enum(TAX_IDENTIFIER_TYPES),
      value: z.string().trim().max(100),
    })
    .nullable()
    .optional(),
  vatNumber: z.string().trim().optional(),
});

export type ClientPayload = z.infer<typeof clientPayloadSchema>;

export function getClientValidationError(result: z.ZodSafeParseError<ClientPayload>) {
  return result.error.issues[0]?.message ?? "Invalid client payload";
}

export function normalizeClientPayload(payload: Record<string, unknown>) {
  const bankAccountId = payload.bankAccountId;

  return {
    address:
      typeof payload.address === "string" && payload.address.trim() ? payload.address : undefined,
    bankAccountId:
      typeof bankAccountId === "string" && bankAccountId.trim()
        ? bankAccountId
        : bankAccountId === null
          ? null
          : undefined,
    company:
      typeof payload.company === "string" && payload.company.trim() ? payload.company : undefined,
    defaultCurrency:
      typeof payload.defaultCurrency === "string" && payload.defaultCurrency.trim()
        ? payload.defaultCurrency
        : undefined,
    email: typeof payload.email === "string" ? payload.email.trim().toLowerCase() : payload.email,
    name: typeof payload.name === "string" ? payload.name.trim() : payload.name,
    notes: typeof payload.notes === "string" && payload.notes.trim() ? payload.notes : undefined,
    taxIdentifier:
      payload.taxIdentifier && typeof payload.taxIdentifier === "object"
        ? payload.taxIdentifier
        : payload.taxIdentifier === null
          ? null
          : undefined,
    vatNumber:
      typeof payload.vatNumber === "string" && payload.vatNumber.trim()
        ? payload.vatNumber
        : undefined,
  };
}

export function taxIdentifierFromClientPayload(
  payload: Record<string, unknown>,
  data: ClientPayload,
) {
  if (Object.hasOwn(payload, "taxIdentifier")) {
    return normalizeTaxIdentifier(data.taxIdentifier);
  }
  if (Object.hasOwn(payload, "vatNumber")) {
    return taxIdentifierFromLegacyVatNumber(data.vatNumber);
  }
  return undefined;
}

export function withTaxIdentifier<T extends Parameters<typeof taxIdentifierFromColumns>[0]>(
  row: T,
) {
  return { ...row, taxIdentifier: taxIdentifierFromColumns(row) };
}

export async function bankAccountBelongsToOrg(orgId: string, bankAccountId: string) {
  const [bankAccount] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.orgId, orgId)))
    .limit(1);

  return Boolean(bankAccount);
}
