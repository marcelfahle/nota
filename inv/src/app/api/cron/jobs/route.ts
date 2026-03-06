import { NextResponse } from "next/server";

import { getCronEnv } from "@/lib/env";
import { processPendingEmailJobs } from "@/lib/jobs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${getCronEnv().CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processPendingEmailJobs();
  return NextResponse.json(result);
}
