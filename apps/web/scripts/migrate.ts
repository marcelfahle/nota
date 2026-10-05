import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/* eslint-disable no-console */
import { Client } from "pg";

const LOCK_ID = "5289652749052";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  console.log("Waiting for the Nota migration lock...");
  await client.query("select pg_advisory_lock($1)", [LOCK_ID]);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const child = spawn("bunx", ["drizzle-kit", "migrate", "--config=drizzle.config.ts"], {
      cwd: dirname(dirname(fileURLToPath(import.meta.url))),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`Migration failed with exit code ${exitCode}`);
  }
  console.log("Migrations complete.");
} finally {
  await client.query("select pg_advisory_unlock($1)", [LOCK_ID]).catch(() => null);
  await client.end();
}
