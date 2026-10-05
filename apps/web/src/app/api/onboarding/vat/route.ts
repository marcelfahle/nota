import {
  applyTaxIdentifierOutcome,
  cookieValueFromHeader,
  getOnboardingSession,
  saveOnboardingProfile,
} from "@/lib/onboarding-session";
import { clientIp, hit, ipBucket } from "@/lib/site-reader/limits";
import {
  normalizeTaxIdentifier,
  TAX_IDENTIFIER_TYPES,
  TaxIdentifierValidationError,
  type TaxIdentifierInput,
  type TaxIdentifierType,
} from "@/lib/tax-identifier";
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
  const body = (await request.json().catch(() => null)) as {
    taxIdentifier?: Record<string, unknown>;
    vatNumber?: unknown;
  } | null;

  const country = session.profile.fields.countryCode?.value?.toUpperCase();
  const prefix = country === "GR" ? "EL" : country;
  const explicit = body?.taxIdentifier;
  const type = explicit?.type;
  const value = explicit?.value ?? body?.vatNumber;
  if (
    typeof value !== "string" ||
    (explicit &&
      (typeof type !== "string" || !TAX_IDENTIFIER_TYPES.includes(type as TaxIdentifierType)))
  ) {
    return Response.json(
      { error: "Choose a tax identifier type and enter its value" },
      { status: 400 },
    );
  }
  const normalizedInput = normalizeVatNumber(value);
  const selectedType =
    (type as TaxIdentifierType | undefined) ??
    (isViesCountry(normalizedInput.slice(0, 2)) || (prefix && isViesCountry(prefix))
      ? "eu_vat"
      : "tax_id");
  let inputValue = value;
  // Add an EU country prefix only after EU VAT was selected. Country data never
  // changes an explicit EIN or generic tax-ID choice.
  if (
    selectedType === "eu_vat" &&
    prefix &&
    isViesCountry(prefix) &&
    !isViesCountry(normalizeVatNumber(inputValue).slice(0, 2))
  ) {
    inputValue = `${prefix}${inputValue}`;
  }

  let taxIdentifier;
  try {
    taxIdentifier = normalizeTaxIdentifier({
      countryCode: selectedType === "tax_id" ? country : undefined,
      type: selectedType,
      value: inputValue,
    } satisfies TaxIdentifierInput);
  } catch (error) {
    const message =
      error instanceof TaxIdentifierValidationError ? error.message : "Enter a VAT or tax ID";
    return Response.json({ error: message }, { status: 400 });
  }
  if (!taxIdentifier) {
    return Response.json({ error: "Enter a VAT or tax ID" }, { status: 400 });
  }

  if (taxIdentifier.type !== "eu_vat") {
    const profile = applyTaxIdentifierOutcome(session.profile, taxIdentifier);
    await saveOnboardingProfile(session.id, profile);
    return Response.json({ outcome: "tax-id", profile });
  }

  if ((await hit(`vat:${ipBucket(clientIp(request))}`, 60 * 60 * 1000)) > CHECKS_PER_HOUR) {
    return Response.json({ error: "Too many checks. Try again later." }, { status: 429 });
  }

  const result = await verifyVatNumber(taxIdentifier.canonicalValue);
  const profile = applyTaxIdentifierOutcome(session.profile, taxIdentifier, {
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
