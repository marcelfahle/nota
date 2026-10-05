import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { getCronEnv, getDeploymentEnv, getEmailEnv, getStorageEnv } from "@/lib/env";
import { hasBearerSecret } from "@/lib/ops-auth";

async function databaseCheck() {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

function configured(check: () => unknown) {
  try {
    check();
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!hasBearerSecret(request, getCronEnv().CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const database = await databaseCheck();
  const email = configured(getEmailEnv);
  const storage = configured(getStorageEnv);
  const deployment = getDeploymentEnv();
  return Response.json(
    {
      checks: {
        chat: { configured: Boolean(process.env.ANTHROPIC_API_KEY), required: false },
        database: { ok: database },
        email: { ok: email, provider: email ? getEmailEnv().EMAIL_PROVIDER : null },
        storage: { ok: storage, provider: storage ? getStorageEnv().STORAGE : null },
      },
      deployment: {
        mode: deployment.DEPLOYMENT_MODE,
        payments: deployment.PAYMENT_MODE,
      },
      status: database && email && storage ? "ok" : "error",
    },
    {
      headers: { "Cache-Control": "no-store" },
      status: database && email && storage ? 200 : 503,
    },
  );
}
