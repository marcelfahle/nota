import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { getDbEnv } from "@/lib/env";

const pool = new Pool({ connectionString: getDbEnv().DATABASE_URL });
export const db = drizzle({ client: pool });
