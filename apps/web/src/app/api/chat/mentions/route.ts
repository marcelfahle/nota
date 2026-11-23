import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import { getActiveUserOrNull, getViewAs } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankAccounts, clients, invoices } from "@/lib/db/schema";

export async function GET(request: Request) {
  const auth = await getActiveUserOrNull();
  if (!auth || (await getViewAs())) {
    return new Response(null, { status: 403 });
  }
  const orgId = auth.org.id;
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const pattern = `%${query}%`;
  const [accounts, people, documents] = await Promise.all([
    db
      .select({ iban: bankAccounts.iban, id: bankAccounts.id, label: bankAccounts.name })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.orgId, orgId),
          or(
            ilike(bankAccounts.name, pattern),
            ilike(bankAccounts.iban, `%${query.replaceAll(/\s/g, "")}%`),
          ),
        ),
      )
      .orderBy(asc(bankAccounts.name))
      .limit(5),
    db
      .select({ company: clients.company, id: clients.id, label: clients.name })
      .from(clients)
      .where(
        and(
          eq(clients.orgId, orgId),
          or(ilike(clients.name, pattern), ilike(clients.company, pattern)),
        ),
      )
      .orderBy(asc(clients.name))
      .limit(5),
    db
      .select({
        client: clients.name,
        id: invoices.id,
        label: invoices.number,
        status: invoices.status,
      })
      .from(invoices)
      .innerJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, orgId)))
      .where(
        and(
          eq(invoices.orgId, orgId),
          or(ilike(invoices.number, pattern), ilike(clients.name, pattern)),
        ),
      )
      .orderBy(desc(invoices.updatedAt))
      .limit(5),
  ]);
  return Response.json([
    ...accounts.map(({ iban, id, label }) => ({
      detail: iban ? `…${iban.slice(-4)}` : "",
      id,
      kind: "bank",
      label,
    })),
    ...people.map(({ company, id, label }) => ({ detail: company, id, kind: "client", label })),
    ...documents.map(({ client, id, label, status }) => ({
      detail: [client, status].join(" · "),
      id,
      kind: "invoice",
      label,
    })),
  ]);
}
