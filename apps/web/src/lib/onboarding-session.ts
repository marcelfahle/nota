import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { eq, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { onboardingSessions, orgs } from "@/lib/db/schema";
import { storeOrgImage } from "@/lib/logo-storage";
import { fromDataUrl } from "@/lib/site-reader/logo";
import {
  PROFILE_FIELDS,
  type ProfileFieldKey,
  type SiteProfile,
  type VatOutcome,
} from "@/lib/site-reader/types";

// A website read is only a preview: anyone can type anyone's domain. It lives
// here, under a random cookie, for a day, and reaches an account only when its
// visitor registers.

export const ONBOARDING_COOKIE = "nota_onboarding";
export const ONBOARDING_TTL_SECONDS = 24 * 60 * 60;

// The same secret Better Auth signs with (see better-auth.ts), read directly
// so signing a cookie never needs the rest of the auth config.
function secret() {
  const value =
    process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("Set BETTER_AUTH_SECRET, AUTH_SECRET or SESSION_SECRET (32+ characters)");
  }
  return value;
}

function sign(token: string) {
  return createHmac("sha256", secret()).update(`onboarding:${token}`).digest("base64url");
}

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** The token from a signed cookie value, or null when the signature is wrong. */
export function verifyCookieValue(value: string | null | undefined) {
  const [token, signature] = (value ?? "").split(".");
  if (!token || !signature) {
    return null;
  }
  const expected = Buffer.from(sign(token));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? token : null;
}

export function cookieValueFromHeader(header: string | null | undefined) {
  for (const part of (header ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ONBOARDING_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export function onboardingCookie(value: string, maxAge = ONBOARDING_TTL_SECONDS) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ONBOARDING_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createOnboardingSession(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(onboardingSessions)
    .values({
      expiresAt: new Date(now.getTime() + ONBOARDING_TTL_SECONDS * 1000),
      tokenHash: hash(token),
    })
    .returning({ id: onboardingSessions.id });
  return { cookieValue: `${token}.${sign(token)}`, id: row.id };
}

export async function getOnboardingSession(
  cookieValue: string | null | undefined,
  now = new Date(),
) {
  const token = verifyCookieValue(cookieValue);
  if (!token) {
    return null;
  }
  const [row] = await db
    .select()
    .from(onboardingSessions)
    .where(eq(onboardingSessions.tokenHash, hash(token)))
    .limit(1);
  return row && row.expiresAt > now ? row : null;
}

export async function saveOnboardingProfile(id: string, profile: SiteProfile | null) {
  await db.update(onboardingSessions).set({ profile }).where(eq(onboardingSessions.id, id));
}

export async function deleteOnboardingSession(id: string) {
  await db.delete(onboardingSessions).where(eq(onboardingSessions.id, id));
}

export async function deleteExpiredOnboardingSessions(now = new Date()) {
  const deleted = await db
    .delete(onboardingSessions)
    .where(lt(onboardingSessions.expiresAt, now))
    .returning({ id: onboardingSessions.id });
  return deleted.length;
}

const FIELD_LIMITS: Record<ProfileFieldKey, number> = {
  city: 250,
  country: 250,
  countryCode: 2,
  email: 250,
  legalName: 250,
  name: 250,
  postalCode: 40,
  region: 250,
  street: 500,
  summary: 400,
  vatNumber: 100,
};

export type ProfileEdits = {
  brandColor?: string;
  /** Fields found by search that the visitor accepts as they are. */
  confirm?: Array<string>;
  fields?: Record<string, unknown>;
};

/** Applies the visitor's own edits. Whatever they type becomes theirs: source "user". */
export function applyProfileEdits(profile: SiteProfile, edits: ProfileEdits): SiteProfile {
  const next: SiteProfile = { ...profile, fields: { ...profile.fields } };
  for (const [key, raw] of Object.entries(edits.fields ?? {})) {
    if (!PROFILE_FIELDS.includes(key as ProfileFieldKey) || typeof raw !== "string") {
      continue;
    }
    const field = key as ProfileFieldKey;
    const value = raw.trim().slice(0, FIELD_LIMITS[field]);
    if (!value) {
      delete next.fields[field];
    } else if (next.fields[field]?.value !== value) {
      next.fields[field] = { confidence: 1, confirmed: true, source: "user", value };
    }
  }
  for (const key of edits.confirm ?? []) {
    const field = next.fields[key as ProfileFieldKey];
    if (field && PROFILE_FIELDS.includes(key as ProfileFieldKey)) {
      next.fields[key as ProfileFieldKey] = { ...field, confirmed: true };
    }
  }
  if (typeof edits.brandColor === "string" && /^#[\da-f]{6}$/i.test(edits.brandColor)) {
    next.brandColor = edits.brandColor.toUpperCase();
  }
  return next;
}

/** "STREET 1\n12345 CITY" from a registry → street, postal code, city. */
export function splitRegistryAddress(address: string) {
  const lines = address
    .split(/\n|,(?=\s*\d{4,})/)
    .map((line) => line.replaceAll(/\s+/g, " ").trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { street: lines[0] ?? address.trim() };
  }
  const last = lines.at(-1)!;
  const match = last.match(/^([A-Z]{0,2}-?\d[\dA-Z -]{2,8}?)\s+(\D.*)$/i);
  return match
    ? { city: match[2], postalCode: match[1], street: lines.slice(0, -1).join(", ") }
    : { street: lines.join(", ") };
}

function registry(value: string) {
  return {
    confidence: 1,
    confirmed: true,
    detail: "the EU VAT registry",
    source: "registry",
    value,
  } as const;
}

/** Records a registry answer on the profile. Registry details replace what was scraped. */
export function applyVatOutcome(
  profile: SiteProfile,
  vatNumber: string,
  outcome: VatOutcome,
): SiteProfile {
  const next: SiteProfile = { ...profile, fields: { ...profile.fields }, vat: outcome };
  next.fields.vatNumber = { confidence: 1, confirmed: true, source: "user", value: vatNumber };
  if (outcome.status !== "valid") {
    return next;
  }
  if (outcome.name) {
    next.fields.legalName = registry(outcome.name);
  }
  if (outcome.address) {
    const parts = splitRegistryAddress(outcome.address);
    next.fields.street = registry(parts.street);
    if (parts.postalCode && parts.city) {
      next.fields.postalCode = registry(parts.postalCode);
      next.fields.city = registry(parts.city);
    }
  }
  return next;
}

type OrgInsert = typeof orgs.$inferInsert;

/**
 * The org columns a profile becomes at registration, with where each came
 * from. Search results stay unconfirmed until the user says otherwise.
 */
export function orgValuesFromProfile(profile: SiteProfile, now = new Date()) {
  const at = now.toISOString();
  const sources: NonNullable<OrgInsert["profileSources"]> = {};
  const values: Partial<OrgInsert> = {};
  const columns = {
    city: "city",
    country: "country",
    email: "contactEmail",
    legalName: "legalName",
    name: "name",
    postalCode: "postalCode",
    region: "region",
    street: "street",
    vatNumber: "vatNumber",
  } as const;
  for (const [key, column] of Object.entries(columns) as Array<
    [keyof typeof columns, (typeof columns)[keyof typeof columns]]
  >) {
    const field = profile.fields[key];
    if (!field?.value) {
      continue;
    }
    values[column] = field.value;
    sources[column] = {
      at,
      confirmed: field.source === "search" ? Boolean(field.confirmed) : true,
      detail: field.detail,
      source: field.source,
    };
  }
  values.website = profile.website;
  sources.website = { at, confirmed: true, source: "user" };
  if (profile.brandColor) {
    values.brandColor = profile.brandColor;
    sources.brandColor = { at, confirmed: true, detail: "your website", source: "site" };
  }
  if (profile.vat && profile.fields.vatNumber) {
    values.vatStatus = profile.vat.status;
    values.vatRegistryName = profile.vat.name;
    values.vatRegistryAddress = profile.vat.address;
    values.vatVerifiedAt = now;
  }
  values.profileSources = sources;
  return values;
}

/**
 * Moves the logo and favicon from the session into the org's permanent
 * storage, then deletes the session. Called once, right after registration.
 */
export async function finishOnboarding(sessionId: string, orgId: string, profile: SiteProfile) {
  const [logoUrl, faviconUrl] = await Promise.all([
    profile.logo ? storeOrgImage("logo", orgId, fromDataUrl(profile.logo)) : null,
    profile.favicon ? storeOrgImage("favicon", orgId, fromDataUrl(profile.favicon)) : null,
  ]);
  if (logoUrl || faviconUrl) {
    await db
      .update(orgs)
      .set({ ...(logoUrl ? { logoUrl } : {}), ...(faviconUrl ? { faviconUrl } : {}) })
      .where(eq(orgs.id, orgId));
  }
  await deleteOnboardingSession(sessionId);
}
