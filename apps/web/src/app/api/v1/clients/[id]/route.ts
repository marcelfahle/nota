import { and, eq, sql } from "drizzle-orm";

import {
  bankAccountBelongsToOrg,
  clientPayloadSchema,
  getClientValidationError,
  normalizeClientPayload,
} from "@/lib/api-clients";
import { error, json, requireAuth } from "@/lib/api-response";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";

async function getScopedClient(clientId: string, orgId: string) {
  const [client] = await db
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
      totalInvoiced: sql<string>`coalesce(sum(${invoices.total}::numeric), 0)`,
      updatedAt: clients.updatedAt,
      userId: clients.userId,
      vatNumber: clients.vatNumber,
    })
    .from(clients)
    .leftJoin(invoices, and(eq(invoices.clientId, clients.id), eq(invoices.orgId, orgId)))
    .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
    .groupBy(clients.id)
    .limit(1);

  return client ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const client = await getScopedClient(id, authResult.auth.org.id);
  if (!client) {
    return error("Client not found", 404);
  }

  return json({ data: client });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const existingClient = await getScopedClient(id, authResult.auth.org.id);
  if (!existingClient) {
    return error("Client not found", 404);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return error("Invalid JSON body");
  }

  const result = clientPayloadSchema.safeParse(normalizeClientPayload(payload));
  if (!result.success) {
    return error(getClientValidationError(result));
  }

  if (
    result.data.bankAccountId &&
    !(await bankAccountBelongsToOrg(authResult.auth.org.id, result.data.bankAccountId))
  ) {
    return error("Invalid bank account");
  }

  const [client] = await db
    .update(clients)
    .set({
      ...result.data,
      updatedAt: new Date(),
    })
    .where(and(eq(clients.id, id), eq(clients.orgId, authResult.auth.org.id)))
    .returning();

  return json({ data: client });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const client = await getScopedClient(id, authResult.auth.org.id);
  if (!client) {
    return error("Client not found", 404);
  }

  if (client.invoiceCount > 0) {
    return error("Client cannot be deleted while invoices exist", 409);
  }

  await db
    .delete(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, authResult.auth.org.id)));
  return json({ success: true });
}
