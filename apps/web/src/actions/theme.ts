"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function updateTheme(value: string) {
  const theme = z.enum(["system", "light", "dark"]).parse(value);
  const { user } = await getCurrentUser();
  await db.update(users).set({ theme }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
}
