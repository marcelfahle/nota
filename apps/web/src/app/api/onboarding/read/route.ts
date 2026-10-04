import { checkBotId } from "botid/server";

import {
  createOnboardingSession,
  cookieValueFromHeader,
  getOnboardingSession,
  onboardingCookie,
  saveOnboardingProfile,
} from "@/lib/onboarding-session";
import {
  allowPaidRead,
  allowRead,
  cacheRead,
  clientIp,
  getCachedRead,
} from "@/lib/site-reader/limits";
import { readSite } from "@/lib/site-reader/read";
import { normalizeWebsite } from "@/lib/site-reader/safe-fetch";
import { PROFILE_FIELDS, type ReaderEvent, type SiteProfile } from "@/lib/site-reader/types";

export const maxDuration = 60;

const READ_BUDGET_MS = 28_000;

/** A cached read plays back as the same events a live read would send. */
function* replay(profile: SiteProfile): Generator<ReaderEvent> {
  yield { domain: profile.domain, type: "start", website: profile.website };
  for (const key of PROFILE_FIELDS) {
    const field = profile.fields[key];
    if (field) {
      yield { field, key, type: "field" };
    }
  }
  if (profile.logo || profile.favicon) {
    yield { favicon: profile.favicon, logo: profile.logo, type: "logo" };
  }
  if (profile.colors.length > 0) {
    yield { colors: profile.colors, type: "colors" };
  }
  yield { profile, type: "done" };
}

function refuse(status: number, code: "busy" | "invalid", message: string) {
  return Response.json({ code, message, type: "error" } satisfies ReaderEvent, { status });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { website?: unknown } | null;
  const site = typeof body?.website === "string" ? normalizeWebsite(body.website) : null;
  if (!site) {
    return refuse(400, "invalid", "That doesn't look like a website address.");
  }

  // BotID only answers on Vercel; elsewhere the limits below carry the load.
  if (process.env.VERCEL) {
    const verdict = await checkBotId().catch(() => null);
    if (verdict?.isBot) {
      return refuse(403, "busy", "We couldn't read that right now. Try again in a moment.");
    }
  }
  if ((await allowRead(clientIp(request))) === "blocked") {
    return refuse(429, "busy", "That's a lot of websites. Give it a minute and try again.");
  }

  const cookieHeader = request.headers.get("cookie");
  const existing = await getOnboardingSession(cookieValueFromHeader(cookieHeader));
  const session = existing
    ? { cookieValue: null, id: existing.id }
    : await createOnboardingSession();

  const cached = await getCachedRead(site.domain);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(READ_BUDGET_MS)]);
  const events = cached
    ? replay(cached)
    : readSite(site.url, site.domain, { paid: await allowPaidRead(), signal });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          if (event.type === "done") {
            await saveOnboardingProfile(session.id, event.profile);
            // Fetch-only reads are not cached: tomorrow's budget may do better.
            // Nor is a read cut short by the time budget or a closed tab.
            if (!cached && !event.profile.degraded && !signal.aborted) {
              await cacheRead(event.profile);
            }
          }
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              code: "unreachable",
              message: "We couldn't finish reading that website.",
              type: "error",
            } satisfies ReaderEvent)}\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/x-ndjson; charset=utf-8",
    "x-accel-buffering": "no",
  });
  if (session.cookieValue) {
    headers.append("set-cookie", onboardingCookie(session.cookieValue));
  }
  return new Response(stream, { headers });
}
