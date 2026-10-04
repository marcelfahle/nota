import { createHash } from "node:crypto";

import { eq, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { readerUsage, siteReads } from "@/lib/db/schema";

import type { SiteProfile } from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function limit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const READER_LIMITS = {
  /** Reads that may spend model and search money per day, across everyone. */
  dailyPaidReads: () => limit("NOTA_READER_DAILY_PAID_READS", 400),
  /** All reads per minute, across everyone. */
  globalPerMinute: () => limit("NOTA_READER_GLOBAL_PER_MINUTE", 40),
  /** Reads per hour from one address. */
  perIpPerHour: () => limit("NOTA_READER_PER_IP_PER_HOUR", 12),
};

/** Atomically counts one hit in a fixed window and returns the new total. */
export async function hit(bucket: string, windowMs: number, now = new Date()) {
  const window = Math.floor(now.getTime() / windowMs);
  const [row] = await db
    .insert(readerUsage)
    .values({
      bucket: `${bucket}:${window}`,
      count: 1,
      expiresAt: new Date((window + 2) * windowMs),
    })
    .onConflictDoUpdate({
      set: { count: sql`${readerUsage.count} + 1` },
      target: readerUsage.bucket,
    })
    .returning({ count: readerUsage.count });
  return row.count;
}

export function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function ipBucket(ip: string) {
  // The address itself is never stored.
  return createHash("sha256").update(`nota-reader:${ip}`).digest("hex").slice(0, 24);
}

export type ReadAllowance = "blocked" | "fetch-only" | "full";

/**
 * Per-address and global limits refuse the read. The daily spend ceiling only
 * degrades it to fetch-only, so onboarding keeps working when the budget is gone.
 */
export async function allowRead(ip: string, now = new Date()): Promise<ReadAllowance> {
  const [perIp, global] = await Promise.all([
    hit(`ip:${ipBucket(ip)}`, HOUR, now),
    hit("global", 60 * 1000, now),
  ]);
  if (perIp > READER_LIMITS.perIpPerHour() || global > READER_LIMITS.globalPerMinute()) {
    return "blocked";
  }
  return "full";
}

export async function allowPaidRead(now = new Date()) {
  return (await hit("paid", DAY, now)) <= READER_LIMITS.dailyPaidReads();
}

export async function getCachedRead(domain: string, now = new Date()) {
  const [row] = await db.select().from(siteReads).where(eq(siteReads.domain, domain)).limit(1);
  return row && now.getTime() - row.readAt.getTime() < DAY ? row.profile : null;
}

export async function cacheRead(profile: SiteProfile, now = new Date()) {
  await db
    .insert(siteReads)
    .values({ domain: profile.domain, profile, readAt: now })
    .onConflictDoUpdate({ set: { profile, readAt: now }, target: siteReads.domain });
}

export async function deleteExpiredReaderData(now = new Date()) {
  await Promise.all([
    db.delete(siteReads).where(lt(siteReads.readAt, new Date(now.getTime() - DAY))),
    db.delete(readerUsage).where(lt(readerUsage.expiresAt, now)),
  ]);
}
