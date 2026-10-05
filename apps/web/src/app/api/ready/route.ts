import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { status: "unavailable" },
      { headers: { "Cache-Control": "no-store" }, status: 503 },
    );
  }
}
