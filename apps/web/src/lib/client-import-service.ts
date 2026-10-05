import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { previewClientImport } from "@/lib/client-import";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { taxIdentifierFromLegacyVatNumber } from "@/lib/tax-identifier";
import { clientTaxIdentifierFields } from "@/lib/vat";

type ImportContext = { org: { defaultCurrency: string | null; id: string }; user: { id: string } };

export async function previewClientsCsv(auth: ImportContext, csv: string) {
  const existing = await db
    .select({ email: clients.email, name: clients.name })
    .from(clients)
    .where(eq(clients.orgId, auth.org.id));
  return previewClientImport(csv, existing, auth.org.defaultCurrency ?? "EUR");
}

export async function importClientsCsv(auth: ImportContext, csv: string, previewHash: string) {
  // Serialize imports for this workspace; retries/reuploads cannot insert the same batch twice.
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`nota-client-import:${auth.org.id}`}, 0))`,
    );
    const existing = await tx
      .select({ email: clients.email, name: clients.name })
      .from(clients)
      .where(eq(clients.orgId, auth.org.id));
    const preview = previewClientImport(csv, existing, auth.org.defaultCurrency ?? "EUR");
    if (preview.hash !== previewHash) {
      return { preview, stale: true as const };
    }
    const ready = preview.rows.filter((row) => row.status === "ready");
    if (ready.length) {
      const values = await Promise.all(
        ready.map(async (row) => {
          const { taxIdentifier, vatNumber, ...client } = row.client;
          return {
            ...client,
            ...(await clientTaxIdentifierFields(
              taxIdentifier ?? taxIdentifierFromLegacyVatNumber(vatNumber),
            )),
            orgId: auth.org.id,
            userId: auth.user.id,
          };
        }),
      );
      await tx.insert(clients).values(values);
    }
    return { added: ready.length, counts: preview.counts, stale: false as const };
  });
  if (!result.stale) {
    revalidatePath("/clients");
  }
  return result;
}
