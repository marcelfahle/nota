import { NextResponse } from "next/server";

import { getCronEnv } from "@/lib/env";
import { processPendingEmailJobs } from "@/lib/jobs";
import { deleteExpiredOnboardingSessions } from "@/lib/onboarding-session";
import { deleteExpiredReaderData } from "@/lib/site-reader/limits";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${getCronEnv().CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [result, expiredOnboardingSessions] = await Promise.all([
    processPendingEmailJobs(),
    // Abandoned onboarding leaves nothing behind after a day.
    deleteExpiredOnboardingSessions(),
    deleteExpiredReaderData(),
  ]);
  return NextResponse.json({ ...result, expiredOnboardingSessions });
}
