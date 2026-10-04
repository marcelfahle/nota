import {
  applyVatOutcome,
  cookieValueFromHeader,
  getOnboardingSession,
  saveOnboardingProfile,
} from "@/lib/onboarding-session";
import { clientIp, hit, ipBucket } from "@/lib/site-reader/limits";
import { isViesCountry, normalizeVatNumber, verifyVatNumber } from "@/lib/vat";

const CHECKS_PER_HOUR = 20;

/**
 * The one field onboarding asks for. Whatever the registry says, the visitor
 * keeps going: this step never blocks signup.
 */
export async function POST(request: Request) {
  const session = await getOnboardingSession(cookieValueFromHeader(request.headers.get("cookie")));
  if (!session?.profile) {
    return Response.json({ error: "No website has been read yet" }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as { vatNumber?: unknown } | null;
  let vatNumber = typeof body?.vatNumber === "string" ? normalizeVatNumber(body.vatNumber) : "";
  if (vatNumber.length < 4 || vatNumber.length > 20) {
    return Response.json({ error: "Enter a VAT or tax ID" }, { status: 400 });
  }

  // "B12345678" typed by a Spanish business becomes "ESB12345678".
  const country = session.profile.fields.countryCode?.value?.toUpperCase();
  const prefix = country === "GR" ? "EL" : country;
  if (prefix && isViesCountry(prefix) && !isViesCountry(vatNumber.slice(0, 2))) {
    vatNumber = `${prefix}${vatNumber}`;
  }

  // Outside the EU there is no registry to ask: keep it as a plain tax ID.
  if (!isViesCountry(vatNumber.slice(0, 2))) {
    const profile = applyVatOutcome(session.profile, vatNumber, {
      address: null,
      name: null,
      status: "unavailable",
    });
    delete profile.vat;
    await saveOnboardingProfile(session.id, profile);
    return Response.json({ outcome: "tax-id", profile });
  }

  if ((await hit(`vat:${ipBucket(clientIp(request))}`, 60 * 60 * 1000)) > CHECKS_PER_HOUR) {
    return Response.json({ error: "Too many checks. Try again later." }, { status: 429 });
  }

  const result = await verifyVatNumber(vatNumber);
  const profile = applyVatOutcome(session.profile, result.vatNumber, {
    address: result.address,
    name: result.name,
    status: result.status,
  });
  await saveOnboardingProfile(session.id, profile);
  const outcome =
    result.status !== "valid"
      ? result.status
      : result.name && result.address
        ? "valid-with-details"
        : "valid";
  return Response.json({ outcome, profile });
}
