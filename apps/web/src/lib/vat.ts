import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { vatChecks } from "@/lib/db/schema";

const CACHE_MS = 24 * 60 * 60 * 1000;
const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";
const VIES_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "EL",
  "ES",
  "FI",
  "FR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  "XI",
]);

export type VatResult = {
  address: string | null;
  checkedAt: Date;
  name: string | null;
  status: "invalid" | "unavailable" | "valid";
  vatNumber: string;
};

export function normalizeVatNumber(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export async function verifyVatNumber(
  value: string,
  options: { fetch?: typeof fetch; now?: Date } = {},
): Promise<VatResult> {
  const vatNumber = normalizeVatNumber(value);
  const now = options.now ?? new Date();
  const [cached] = await db.select().from(vatChecks).where(eq(vatChecks.vatNumber, vatNumber));
  if (cached && now.getTime() - cached.checkedAt.getTime() < CACHE_MS) {
    return { ...cached, vatNumber };
  }

  const countryCode = vatNumber.slice(0, 2);
  const number = vatNumber.slice(2);
  let result: VatResult;
  if (!/^[A-Z]{2}$/.test(countryCode) || !number) {
    result = { address: null, checkedAt: now, name: null, status: "invalid", vatNumber };
  } else if (!VIES_COUNTRIES.has(countryCode)) {
    result = { address: null, checkedAt: now, name: null, status: "unavailable", vatNumber };
  } else {
    try {
      const response = await (options.fetch ?? fetch)(VIES_URL, {
        body: JSON.stringify({ countryCode, vatNumber: number }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error("VIES unavailable");
      }
      const payload = (await response.json()) as Record<string, unknown>;
      if (typeof payload.valid !== "boolean") {
        throw new Error("Invalid VIES response");
      }
      result = {
        address:
          typeof payload.address === "string" && payload.address.trim() ? payload.address : null,
        checkedAt: now,
        name: typeof payload.name === "string" && payload.name.trim() ? payload.name : null,
        status: payload.valid ? "valid" : "invalid",
        vatNumber,
      };
    } catch {
      result = { address: null, checkedAt: now, name: null, status: "unavailable", vatNumber };
    }
  }

  await db
    .insert(vatChecks)
    .values(result)
    .onConflictDoUpdate({
      set: {
        address: result.address,
        checkedAt: result.checkedAt,
        name: result.name,
        status: result.status,
      },
      target: vatChecks.vatNumber,
    });
  return result;
}

export async function clientVatFields(vatNumber?: string | null) {
  if (!vatNumber?.trim()) {
    return {
      vatNumber: vatNumber ?? null,
      vatRegistryAddress: null,
      vatRegistryName: null,
      vatStatus: null,
      vatVerifiedAt: null,
    } as const;
  }

  const result = await verifyVatNumber(vatNumber);
  return {
    vatNumber: result.vatNumber,
    vatRegistryAddress: result.address,
    vatRegistryName: result.name,
    vatStatus: result.status,
    vatVerifiedAt: result.checkedAt,
  };
}
