/* eslint-disable no-console */
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

import { Pool } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import { orgMembers, orgs, users } from "../src/lib/db/schema";
import { getDbEnv } from "../src/lib/env";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

function getWorkspaceName(name: string) {
  return `${name}'s Workspace`;
}

const pool = new Pool({ connectionString: getDbEnv().DATABASE_URL });
const db = drizzle({ client: pool });

const email = process.env.SEED_EMAIL || "admin@nota.app";
const name = process.env.SEED_NAME || "Admin";
const password = process.env.SEED_PASSWORD || "changeme";

const passwordHash = await hashPassword(password);

const [user] = await db.transaction(async (tx) => {
  const [existingUser] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const [savedUser] = existingUser
    ? await tx
        .update(users)
        .set({ name, passwordHash })
        .where(eq(users.id, existingUser.id))
        .returning({ id: users.id })
    : await tx
        .insert(users)
        .values({
          email,
          name,
          passwordHash,
        })
        .returning({ id: users.id });

  const [existingMembership] = await tx
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .where(eq(orgMembers.userId, savedUser.id))
    .limit(1);

  if (!existingMembership) {
    const [org] = await tx
      .insert(orgs)
      .values({
        name: getWorkspaceName(name),
      })
      .returning({ id: orgs.id });

    await tx.insert(orgMembers).values({
      orgId: org.id,
      role: "owner",
      userId: savedUser.id,
    });
  }

  return [savedUser];
});

await pool.end();

console.log(`Seeded login email: ${email}`);
console.log(`Seeded user id: ${user.id}`);
console.log("Seeded password from SEED_PASSWORD or default value.");
