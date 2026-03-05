/* eslint-disable no-console */
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import { users } from "../src/lib/db/schema";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required. Set it in .env");
  process.exit(1);
}

const sql = neon(databaseUrl);
const db = drizzle({ client: sql });

const email = process.env.SEED_EMAIL || "admin@inv.app";
const name = process.env.SEED_NAME || "Admin";
const password = process.env.SEED_PASSWORD || "changeme";

const passwordHash = await hashPassword(password);

const [existing] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);

if (existing) {
  await db.update(users).set({ name, passwordHash }).where(eq(users.id, existing.id));
  console.log(`Updated user: ${email}`);
} else {
  await db.insert(users).values({
    email,
    name,
    passwordHash,
  });
  console.log(`Created user: ${email}`);
}

console.log(`Seeded login email: ${email}`);
console.log("Seeded password from SEED_PASSWORD or default value.");
