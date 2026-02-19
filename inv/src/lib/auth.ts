import { cache } from "react";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const getCurrentUser = cache(async () => {
  const [user] = await db.select().from(users).limit(1);
  if (!user) {
    throw new Error("No user found. Run: bun run scripts/seed.ts");
  }
  return user;
});
