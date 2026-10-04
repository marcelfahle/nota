/* eslint-disable no-console */
import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { accounts, users } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/password";

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const email = (argument("email") ?? process.env.SUPER_ADMIN_EMAIL)?.trim().toLowerCase();
const name = (argument("name") ?? process.env.SUPER_ADMIN_NAME ?? "Nota operator").trim();
const temporaryPassword =
  argument("password") ??
  process.env.SUPER_ADMIN_TEMP_PASSWORD ??
  randomBytes(18).toString("base64url");

if (!email) {
  throw new Error("Pass --email operator@example.com or set SUPER_ADMIN_EMAIL.");
}
if (temporaryPassword.length < 8) {
  throw new Error("The temporary password must be at least 8 characters.");
}

const [existingAdmin] = await db
  .select({ email: users.email })
  .from(users)
  .where(eq(users.isSuperAdmin, true))
  .limit(1);
if (existingAdmin) {
  throw new Error(`A super admin already exists (${existingAdmin.email}).`);
}

const password = await hashPassword(temporaryPassword);
const [user] = await db.transaction(async (tx) => {
  const [existingUser] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingUser) {
    throw new Error("That email already belongs to a Nota user.");
  }

  const [created] = await tx
    .insert(users)
    .values({
      email,
      emailVerified: true,
      isSuperAdmin: true,
      mustChangePassword: true,
      name,
    })
    .returning({ id: users.id });
  await tx.insert(accounts).values({
    accountId: created.id,
    password,
    providerId: "credential",
    userId: created.id,
  });
  return [created];
});

console.log(`Created super admin: ${email}`);
console.log(`Temporary password: ${temporaryPassword}`);
console.log(`User id: ${user.id}`);
console.log("The password must be changed on first login.");
process.exit(0);
