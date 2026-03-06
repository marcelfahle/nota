import { defineConfig } from "drizzle-kit";

import { getDbEnv } from "./src/lib/env";

export default defineConfig({
  dbCredentials: {
    url: getDbEnv().DATABASE_URL,
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
});
