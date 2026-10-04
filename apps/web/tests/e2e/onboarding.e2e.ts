import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { onboardingSessions, orgMembers, orgs, readerUsage, users } from "../../src/lib/db/schema";
import {
  createOnboardingSession,
  deleteExpiredOnboardingSessions,
  ONBOARDING_COOKIE,
  saveOnboardingProfile,
} from "../../src/lib/onboarding-session";
import { allowRead } from "../../src/lib/site-reader/limits";
import type { ReaderEvent, SiteProfile } from "../../src/lib/site-reader/types";
import { uniqueSuffix } from "./helpers";

function profileFor(domain: string): SiteProfile {
  return {
    brandColor: "#43C6A6",
    colors: [
      { hex: "#43C6A6", text: "#1F1B16" },
      { hex: "#14705A", text: "#FFFFFF" },
    ],
    domain,
    favicon: null,
    fields: {
      city: {
        confidence: 0.5,
        confirmed: false,
        detail: "Crunchbase",
        source: "search",
        value: "Dénia",
      },
      country: {
        confidence: 0.5,
        confirmed: false,
        detail: "Crunchbase",
        source: "search",
        value: "Spain",
      },
      countryCode: {
        confidence: 0.5,
        confirmed: false,
        detail: "Crunchbase",
        source: "search",
        value: "ES",
      },
      email: { confidence: 0.7, detail: "your website", source: "site", value: `hello@${domain}` },
      name: {
        confidence: 0.8,
        detail: "your site's structured data",
        source: "site",
        value: "Bold Video",
      },
      summary: {
        confidence: 0.7,
        detail: "your website",
        source: "site",
        value: "You build a video platform for courses.",
      },
    },
    logo: null,
    website: `https://${domain}/`,
  };
}

/** A website read that already happened: session row plus its signed cookie. */
async function seedSession(page: Page, profile: SiteProfile) {
  const session = await createOnboardingSession();
  await saveOnboardingProfile(session.id, profile);
  await page.context().addCookies([
    {
      httpOnly: true,
      name: ONBOARDING_COOKIE,
      url: new URL(page.url() === "about:blank" ? test.info().project.use.baseURL! : page.url())
        .origin,
      value: encodeURIComponent(session.cookieValue),
    },
  ]);
  return session.id;
}

test("a visitor goes from website to branded invoice to an account with the same brand", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const domain = `bold-${suffix}.example`;
  const sessionId = await seedSession(page, profileFor(domain));

  await page.goto("/start");
  await expect(page.getByTestId("onboarding-title")).toHaveText("Nice to meet you, Bold Video.");
  await expect(page.getByTestId("onboarding-summary")).toContainText("video platform");
  await expect(page.getByTestId("onboarding-location")).toContainText("Crunchbase says you’re in");
  const invoice = page.getByTestId("onboarding-invoice");
  await expect(invoice).toContainText("Bold Video");
  await expect(invoice).toContainText("Street and number");
  await expect(invoice).toContainText("VAT ID");

  // Every found value is editable in place, and the invoice follows.
  await page.getByTestId("onboarding-chip-name").click();
  await page.getByTestId("onboarding-edit-name").fill("Bold");
  await page.getByTestId("onboarding-edit-name").press("Enter");
  await expect(page.getByTestId("onboarding-title")).toHaveText("Nice to meet you, Bold.");
  await expect(invoice).toContainText("Bold");

  await page.getByTestId("onboarding-color").nth(1).click();
  await expect(page.getByTestId("onboarding-invoice-pay")).toHaveCSS(
    "background-color",
    "rgb(20, 112, 90)",
  );
  await page.getByTestId("onboarding-confirm-location").click();
  await expect(page.getByTestId("onboarding-location")).toContainText("You’re based in");

  // Nothing has reached an account yet.
  expect(
    await db
      .select()
      .from(orgs)
      .where(eq(orgs.website, `https://${domain}/`)),
  ).toHaveLength(0);

  await page.getByTestId("onboarding-keep").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Save your invoice.");
  const email = `onboarding-${suffix}@example.com`;
  await page.getByTestId("onboarding-name").fill("Onboarding Owner");
  await page.getByTestId("onboarding-email").fill(email);
  await page.getByTestId("onboarding-password").fill(`Playwright-${suffix}`);
  await page.getByTestId("onboarding-save-submit").click();
  await expect(page).toHaveURL(/\/home$/);

  const [org] = await db
    .select({ org: orgs })
    .from(users)
    .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
    .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
    .where(eq(users.email, email));
  expect(org.org).toMatchObject({
    brandColor: "#14705A",
    city: "Dénia",
    contactEmail: `hello@${domain}`,
    country: "Spain",
    name: "Bold",
    website: `https://${domain}/`,
  });
  expect(org.org.profileSources?.name).toMatchObject({ confirmed: true, source: "user" });
  expect(org.org.profileSources?.city).toMatchObject({
    confirmed: true,
    detail: "Crunchbase",
    source: "search",
  });
  // The session is gone the moment it has been used.
  expect(
    await db.select().from(onboardingSessions).where(eq(onboardingSessions.id, sessionId)),
  ).toHaveLength(0);

  // Settings › Brand shows the same values.
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Brand" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Bold" })).toBeVisible();
  await expect(page.getByText(`hello@${domain}`).first()).toBeVisible();
  await expect(page.getByText("Dénia", { exact: false }).first()).toBeVisible();
});

test("abandoning onboarding leaves no org, no user and, after expiry, no stored profile", async ({
  page,
}) => {
  const domain = `abandoned-${uniqueSuffix()}.example`;
  const sessionId = await seedSession(page, profileFor(domain));
  await page.goto("/start");
  await expect(page.getByTestId("onboarding-title")).toContainText("Bold Video");

  expect(
    await db
      .select()
      .from(orgs)
      .where(eq(orgs.website, `https://${domain}/`)),
  ).toHaveLength(0);
  await db
    .update(onboardingSessions)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(onboardingSessions.id, sessionId));

  // An expired session is not restored, and the cleanup removes it.
  await page.goto("/start");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What’s your website?");
  expect(await deleteExpiredOnboardingSessions()).toBeGreaterThanOrEqual(1);
  expect(
    await db.select().from(onboardingSessions).where(eq(onboardingSessions.id, sessionId)),
  ).toHaveLength(0);
});

test("the read streams in, and an unreachable site returns to the question", async ({ page }) => {
  const events: Array<ReaderEvent> = [
    { domain: "studio.example", type: "start", website: "https://studio.example/" },
    { state: "active", step: "site", type: "step" },
    {
      field: { confidence: 0.8, detail: "your site's title", source: "site", value: "Studio Ruiz" },
      key: "name",
      type: "field",
    },
    { colors: [{ hex: "#C4261A", text: "#FFFFFF" }], type: "colors" },
    { profile: { ...profileFor("studio.example"), fields: {} }, type: "done" },
  ];
  let unreachable = false;
  await page.route("**/api/onboarding/read", async (route) => {
    const body = unreachable
      ? [
          { domain: "nowhere.example", type: "start", website: "https://nowhere.example/" },
          { code: "unreachable", message: "We couldn't reach that website.", type: "error" },
        ]
      : events;
    await route.fulfill({
      body: body.map((event) => JSON.stringify(event)).join("\n") + "\n",
      contentType: "application/x-ndjson",
    });
  });
  await page.route("**/api/onboarding/session", (route) => route.fulfill({ status: 204 }));

  // The favicon is fetched by the browser while the address is typed.
  let iconRequests = 0;
  await page.route("https://studio.example/**", async (route) => {
    iconRequests += 1;
    await route.fulfill({
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGNwPraMJMQwqmFUw/DVAAC+ra8QmbUsDQAAAABJRU5ErkJggg==",
        "base64",
      ),
      contentType: "image/png",
    });
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/start");
  await expect(page.getByTestId("onboarding-read")).toBeDisabled();
  await page.getByTestId("onboarding-website").fill("studio");
  await expect(page.getByTestId("onboarding-typed-icon").locator("img")).toHaveCount(0);
  expect(iconRequests).toBe(0);
  await page.getByTestId("onboarding-website").fill("studio.example");
  await expect(page.getByTestId("onboarding-typed-icon").locator("img")).toHaveAttribute(
    "src",
    /^https:\/\/studio\.example\//,
  );
  expect(iconRequests).toBeGreaterThan(0);
  await page.getByTestId("onboarding-read").click();
  await expect(page.getByTestId("onboarding-title")).toHaveText("Nice to meet you, Studio Ruiz.");
  await expect(page.getByTestId("onboarding-status")).toHaveText("From studio.example");
  // On a phone the invoice sits at the top of the screen, in the site's colour.
  await expect(page.getByTestId("onboarding-invoice-mobile")).toBeInViewport();
  await expect(page.getByTestId("onboarding-invoice-mobile-pay")).toHaveCSS(
    "background-color",
    "rgb(196, 38, 26)",
  );
  // Works on a phone: nothing overflows sideways and the action stays reachable.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByTestId("onboarding-keep-mobile")).toBeVisible();

  unreachable = true;
  await page.getByRole("button", { name: "Different site" }).click();
  await page.getByTestId("onboarding-website").fill("nowhere.example");
  await page.getByTestId("onboarding-read").click();
  await expect(page.getByTestId("onboarding-error")).toContainText("couldn't reach that website");
  await expect(page.getByTestId("onboarding-blank")).toHaveAttribute("href", "/register");
});

test("the reader refuses internal addresses and non-websites before doing any work", async ({
  request,
}) => {
  for (const website of [
    "http://169.254.169.254/latest",
    "localhost:3000",
    "10.0.0.8",
    "file:///etc/passwd",
    "",
  ]) {
    const response = await request.post("/api/onboarding/read", { data: { website } });
    expect(response.status(), website).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid", type: "error" });
  }
});

test("the limiter holds under a burst from one address", async () => {
  const ip = `203.0.113.${Math.floor(Math.random() * 250)}-${uniqueSuffix()}`;
  const now = new Date();
  await db.delete(readerUsage);
  const verdicts = await Promise.all(Array.from({ length: 30 }, () => allowRead(ip, now)));
  // 12 reads an hour per address; the other 18 of the burst are refused.
  expect(verdicts.filter((verdict) => verdict === "full")).toHaveLength(12);
  expect(verdicts.filter((verdict) => verdict === "blocked")).toHaveLength(18);
  await db.delete(readerUsage);
});
