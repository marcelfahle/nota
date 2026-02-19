"use server";

import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const scryptAsync = promisify(scrypt);

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  if (!salt || !key) {
    return false;
  }
  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return keyBuffer.length === derivedKey.length && timingSafeEqual(keyBuffer, derivedKey);
}

export async function login(_prevState: { error: string } | null, formData: FormData) {
  const password = formData.get("password") as string;

  if (!password) {
    return { error: "Password is required" };
  }

  const passwordHash = process.env.PASSWORD_HASH;
  if (!passwordHash) {
    return { error: "Server configuration error" };
  }

  const valid = await verifyPassword(password, passwordHash);
  if (!valid) {
    return { error: "Invalid password" };
  }

  const cookieStore = await cookies();
  cookieStore.set("session", process.env.SESSION_SECRET!, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/invoices");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
  redirect("/login");
}
