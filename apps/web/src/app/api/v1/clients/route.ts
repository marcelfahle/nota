import { and, asc, eq, ilike, or, sql } from "drizzle-orm";

import {
  bankAccountBelongsToOrg,
  clientPayloadSchema,
  getClientValidationError,
  normalizeClientPayload,
  taxIdentifierFromClientPayload,
  withTaxIdentifier,
} from "@/lib/api-clients";
import { error as apiError, json, paginated, requireAuth } from "@/lib/api-response";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";
import { TaxIdentifierValidationError } from "@/lib/tax-identifier";
import { clientTaxIdentifierFields } from "@/lib/vat";

function getPagination(url: URL) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("per_page") ?? "20", 10) || 20),
  );

  return {
    page,
    perPage,
  };
}

function getClientWhereClause(orgId: string, search: string | null) {
  const filters = [eq(clients.orgId, orgId)];

  if (!search) {
    return and(...filters);
  }

  const pattern = `%${search}%`;
  filters.push(
    or(
      ilike(clients.company, pattern),
      ilike(clients.email, pattern),
      ilike(clients.name, pattern),
    )!,
  );

  return and(...filters);
}

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() || null;
  const { page, perPage } = getPagination(url);
  const offset = (page - 1) * perPage;
  const whereClause = getClientWhereClause(authResult.auth.org.id, search);

  const [clientRows, [totalRow]] = await Promise.all([
    db
      .select({
        address: clients.address,
        bankAccountId: clients.bankAccountId,
        company: clients.company,
        createdAt: clients.createdAt,
        defaultCurrency: clients.defaultCurrency,
        email: clients.email,
        id: clients.id,
        invoiceCount: sql<number>`count(${invoices.id})::int`,
        name: clients.name,
        notes: clients.notes,
        taxIdentifierCanonicalValue: clients.taxIdentifierCanonicalValue,
        taxIdentifierCountryCode: clients.taxIdentifierCountryCode,
        taxIdentifierType: clients.taxIdentifierType,
        taxIdentifierValue: clients.taxIdentifierValue,
        totalInvoiced: sql<string>`coalesce(sum(${invoices.total}::numeric), 0)`,
        updatedAt: clients.updatedAt,
        vatNumber: clients.vatNumber,
        vatRegistryAddress: clients.vatRegistryAddress,
        vatRegistryName: clients.vatRegistryName,
        vatStatus: clients.vatStatus,
        vatVerifiedAt: clients.vatVerifiedAt,
      })
      .from(clients)
      .leftJoin(
        invoices,
        and(eq(clients.id, invoices.clientId), eq(invoices.orgId, authResult.auth.org.id)),
      )
      .where(whereClause)
      .groupBy(clients.id)
      .orderBy(asc(clients.name))
      .limit(perPage)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(clients)
      .where(whereClause)
      .limit(1),
  ]);

  return paginated(clientRows.map(withTaxIdentifier), {
    page,
    perPage,
    total: totalRow?.total ?? 0,
  });
}

export async function POST(request: Request) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body");
  }

  const result = clientPayloadSchema.safeParse(normalizeClientPayload(payload));
  if (!result.success) {
    return apiError(getClientValidationError(result));
  }

  if (
    result.data.bankAccountId &&
    !(await bankAccountBelongsToOrg(authResult.auth.org.id, result.data.bankAccountId))
  ) {
    return apiError("Invalid bank account");
  }

  let taxIdentifierFields;
  try {
    taxIdentifierFields = await clientTaxIdentifierFields(
      taxIdentifierFromClientPayload(payload, result.data),
    );
  } catch (error) {
    return apiError(
      error instanceof TaxIdentifierValidationError ? error.message : "Invalid tax identifier",
    );
  }
  const { taxIdentifier: _taxIdentifier, vatNumber: _vatNumber, ...values } = result.data;
  const [client] = await db
    .insert(clients)
    .values({
      ...values,
      ...taxIdentifierFields,
      orgId: authResult.auth.org.id,
      userId: authResult.auth.user.id,
    })
    .returning();

  return json({ data: withTaxIdentifier(client) }, 201);
}
