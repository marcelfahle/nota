import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";

import { getDbEnv } from "@/lib/env";

const { DATABASE_URL } = getDbEnv();

// Neon's driver speaks WebSockets to Neon only. Plain Postgres (local dev,
// most self-hosted setups) goes through node-postgres instead.
function isNeon(url: string) {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

export const db = isNeon(DATABASE_URL)
  ? drizzleNeon({ client: new NeonPool({ connectionString: DATABASE_URL }) })
  : (drizzlePg({ client: new PgPool({ connectionString: DATABASE_URL }) }) as unknown as ReturnType<
      typeof drizzleNeon
    >);
