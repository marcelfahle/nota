import { and, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { activityLog, invoices } from "@/lib/db/schema";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];

  const overdueInvoices = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.status, "sent"), lt(invoices.dueAt, today)));

  if (overdueInvoices.length === 0) {
    return NextResponse.json({ message: "No overdue invoices found", updated: 0 });
  }

  for (const invoice of overdueInvoices) {
    await db
      .update(invoices)
      .set({ status: "overdue", updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id));

    await db.insert(activityLog).values({
      action: "marked_overdue",
      invoiceId: invoice.id,
    });
  }

  return NextResponse.json({
    message: "Overdue invoices updated",
    updated: overdueInvoices.length,
  });
}
