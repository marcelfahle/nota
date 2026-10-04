// Deterministic signals from a homepage's HTML. No parser dependency: the few
// tags we need are matched directly, and nothing from the page is executed.

export type SiteSignals = {
  address: {
    city?: string;
    country?: string;
    postalCode?: string;
    region?: string;
    street?: string;
  } | null;
  description: string | null;
  email: string | null;
  icons: Array<string>;
  inlineCss: string;
  legalLinks: Array<{ label: string; url: string }>;
  legalName: string | null;
  logos: Array<string>;
  name: { detail: string; value: string } | null;
  stylesheets: Array<string>;
  themeColor: string | null;
  vatNumber: string | null;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function decodeEntities(value: string) {
  return value.replaceAll(/&(#x?[\da-f]+|\w+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const point =
        code[1].toLowerCase() === "x"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point < 0x10_ff_ff
        ? String.fromCodePoint(point)
        : "";
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") {
    return null;
  }
  const text = decodeEntities(value).replaceAll(/\s+/g, " ").trim();
  return text && text.length <= max ? text : null;
}

function attributes(tag: string) {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function tags(html: string, name: string) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((match) =>
    attributes(match[0]),
  );
}

function rel(tag: Record<string, string>) {
  return (tag.rel ?? "").toLowerCase();
}

function isString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function bareHost(url: string) {
  return new URL(url).hostname.replace(/^www\./, "");
}

function resolve(href: string | undefined, base: string) {
  if (!href) {
    return null;
  }
  try {
    const url = new URL(href, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function sameSite(url: string, base: string) {
  return bareHost(url) === bareHost(base);
}

type JsonLdNode = Record<string, unknown>;

function jsonLdNodes(html: string) {
  const nodes: Array<JsonLdNode> = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 4 || !value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value.slice(0, 50)) {
        walk(entry, depth + 1);
      }
      return;
    }
    const node = value as JsonLdNode;
    nodes.push(node);
    walk(node["@graph"], depth + 1);
    walk(node.publisher, depth + 1);
  };
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      walk(JSON.parse(match[1]), 0);
    } catch {
      // Broken JSON-LD is common; the other signals carry on.
    }
  }
  return nodes;
}

const ORGANIZATION_TYPES =
  /^(Organization|Corporation|LocalBusiness|ProfessionalService|OnlineBusiness|Store|NGO|EducationalOrganization|MedicalBusiness|LegalService|FinancialService)$/;

function isType(node: JsonLdNode, pattern: RegExp) {
  const type = node["@type"];
  return (Array.isArray(type) ? type : [type]).some(
    (entry) => typeof entry === "string" && pattern.test(entry),
  );
}

function imageUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return imageUrl(value[0]);
  }
  if (value && typeof value === "object" && "url" in value) {
    return imageUrl(value.url);
  }
  return null;
}

// Start-anchored: each is tried against the compacted text after a VAT label.
const VAT_PATTERNS: Array<RegExp> = [
  /^ATU\d{8}/,
  /^BE[01]\d{9}/,
  /^DE\d{9}/,
  /^DK\d{8}/,
  /^ES[A-Z\d]\d{7}[A-Z\d]/,
  /^FI\d{8}/,
  /^FR[A-HJ-NP-Z\d]{2}\d{9}/,
  /^IE\d[A-Z\d+*]\d{5}[A-Z]{1,2}/,
  /^IT\d{11}/,
  /^LU\d{8}/,
  /^NL\d{9}B\d{2}/,
  /^PL\d{10}/,
  /^PT\d{9}/,
  /^SE\d{12}/,
  /^GB\d{9}/,
  /^CHE\d{9}/,
];
const VAT_LABEL =
  /(?:VAT|USt\.?-?\s?Id(?:Nr|ent)?\.?(?:-?Nr\.?)?|Umsatzsteuer-?(?:Id|Identifikations)(?:-?nummer|-?Nr\.?)?|UID(?:-Nr\.?)?|TVA|IVA|BTW|NIF|CIF|P\.?\s?IVA)[^A-Z\d]{0,40}([A-Z]{2,3}[\s.-]?[A-Z\d][A-Z\d\s.-]{6,18})/gi;

/**
 * A VAT ID printed next to a VAT label in page text, or null. Unlabelled
 * lookalikes are ignored: a wrong VAT ID on an invoice is worse than none.
 */
export function findVatNumber(text: string) {
  for (const match of text.matchAll(VAT_LABEL)) {
    const compact = match[1].replaceAll(/[\s.-]/g, "").toUpperCase();
    for (const pattern of VAT_PATTERNS) {
      const found = compact.match(pattern);
      if (found) {
        return found[0];
      }
    }
  }
  return null;
}

const EMAIL = /[a-z\d][\w.+-]*@[a-z\d-]+(?:\.[a-z\d-]+)*\.[a-z]{2,}/gi;
export const EMAIL_NOISE =
  /(example\.|your-?(company|domain|email|name)|@(domain|email|company|test)\.|sentry|wixpress|@\dx|\.(png|jpe?g|gif|webp|svg)$|^(noreply|no-reply|donotreply)@)/i;

export function findEmail(html: string, domain: string) {
  const found = new Map<string, number>();
  const add = (raw: string, score: number) => {
    const email = raw
      .toLowerCase()
      .replace(/^mailto:/, "")
      .split("?")[0];
    if (!EMAIL.test(email) || EMAIL_NOISE.test(email) || email.length > 100) {
      EMAIL.lastIndex = 0;
      return;
    }
    EMAIL.lastIndex = 0;
    const local = email.split("@")[0];
    const boost =
      (email.endsWith(`@${domain}`) ? 4 : 0) +
      (/^(hello|hi|hola|hallo|info|contact|kontakt|office|team|mail|billing|invoices?|accounts?)$/.test(
        local,
      )
        ? 2
        : 0);
    found.set(email, (found.get(email) ?? 0) + score + boost);
  };
  for (const match of html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)) {
    add(decodeEntities(match[1]), 3);
  }
  for (const match of html.replaceAll(/<script[\s\S]*?<\/script>/gi, " ").matchAll(EMAIL)) {
    add(match[0], 1);
  }
  return [...found].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

const LEGAL_LINK =
  /impressum|imprint|legal|aviso-?legal|mentions-?legales|note-?legali|terms|agb|privacy|datenschutz|privacidad|about|ueber-?uns|uber-?uns|sobre|contact|kontakt|contacto|company/i;
const LEGAL_RANK = [
  /impressum|imprint|aviso-?legal|mentions-?legales|note-?legali|legal-?notice/i,
  /contact|kontakt|contacto/i,
  /about|ueber-?uns|uber-?uns|sobre|company/i,
  /legal|terms|agb/i,
  /privacy|datenschutz|privacidad/i,
];

function letters(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^a-z\d]/g, "");
}

function titleName(title: string, domain: string) {
  // "Bold — video for courses" or "Möbel nach Maß | Tischlerei Brandt": the
  // part that resembles the domain is the brand; failing that, the shortest.
  const parts = title
    .split(/\s+[|–—·•:-]\s+/)
    .map((part) => part.replaceAll(/^[\s|–—·•:-]+|[\s|–—·•:-]+$/g, ""))
    .filter(Boolean);
  if (parts.length < 2) {
    return parts[0] && parts[0].length <= 40 ? parts[0] : null;
  }
  const host = letters(domain.split(".").slice(0, -1).join(""));
  const match = parts.find((part) => {
    const name = letters(part);
    return name.length > 2 && (host.includes(name) || name.includes(host));
  });
  return match ?? parts.toSorted((left, right) => left.length - right.length)[0];
}

export function extractSignals(html: string, pageUrl: string): SiteSignals {
  const base = resolve(tags(html, "base")[0]?.href, pageUrl) ?? pageUrl;
  const domain = new URL(pageUrl).hostname.replace(/^www\./, "");
  const meta = new Map<string, string>();
  for (const tag of tags(html, "meta")) {
    const key = (tag.property ?? tag.name ?? "").toLowerCase();
    if (key && tag.content && !meta.has(key)) {
      meta.set(key, tag.content);
    }
  }

  const nodes = jsonLdNodes(html);
  const organization = nodes.find((node) => isType(node, ORGANIZATION_TYPES));
  const website = nodes.find((node) => isType(node, /^WebSite$/));
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 300);

  const name =
    (clean(organization?.name, 80) && {
      detail: "your site's structured data",
      value: clean(organization?.name, 80)!,
    }) ||
    (clean(meta.get("og:site_name"), 80) && {
      detail: "your site's title",
      value: clean(meta.get("og:site_name"), 80)!,
    }) ||
    (clean(meta.get("application-name"), 80) && {
      detail: "your site's title",
      value: clean(meta.get("application-name"), 80)!,
    }) ||
    (clean(website?.name, 80) && {
      detail: "your site's structured data",
      value: clean(website?.name, 80)!,
    }) ||
    (title &&
      titleName(title, domain) && {
        detail: "your site's title",
        value: titleName(title, domain)!,
      }) ||
    null;

  const links = tags(html, "link");
  const iconScore = (tag: Record<string, string>) => {
    const href = tag.href ?? "";
    const size = Number.parseInt(tag.sizes ?? "", 10) || 0;
    return (
      (/\.svg(\?|$)/i.test(href) || tag.type === "image/svg+xml" ? 1000 : 0) +
      (rel(tag).includes("apple-touch-icon") ? 300 : 0) +
      Math.min(size, 512)
    );
  };
  const icons = links
    .filter((tag) => /(^|\s)(icon|apple-touch-icon(-precomposed)?|mask-icon)(\s|$)/.test(rel(tag)))
    .sort((left, right) => iconScore(right) - iconScore(left))
    .map((tag) => resolve(tag.href, base))
    .filter(isString);
  icons.push(new URL("/favicon.ico", pageUrl).href);

  // The structured-data logo first, then the site's own icon. A header <img>
  // comes last: it is often white-on-dark and would vanish on invoice paper.
  const logos: Array<string> = [];
  const organizationLogo = resolve(imageUrl(organization?.logo) ?? undefined, base);
  if (organizationLogo) {
    logos.push(organizationLogo);
  }
  logos.push(...icons.slice(0, 2));
  for (const match of html.slice(0, 200_000).matchAll(/<img\b[^>]*>/gi)) {
    const tag = attributes(match[0]);
    const hint = `${tag.class ?? ""} ${tag.id ?? ""} ${tag.alt ?? ""} ${tag.src ?? ""}`;
    const url = resolve(tag.src, base);
    if (
      url &&
      /logo/i.test(hint) &&
      !/(logos\/|partner|client|customer|sponsor|press|trusted|platform)/i.test(hint)
    ) {
      logos.push(url);
      break;
    }
  }

  const stylesheets = links
    .filter((tag) => rel(tag).includes("stylesheet"))
    .map((tag) => resolve(tag.href, base))
    .filter(isString);
  const inlineCss = [
    ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]),
    ...[...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((match) => `x{${match[1]}}`),
  ]
    .join("\n")
    .slice(0, 600_000);

  const legal = new Map<string, { label: string; rank: number; url: string }>();
  for (const match of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const tag = attributes(match[0].slice(0, match[0].indexOf(">") + 1));
    const label = clean(match[1].replaceAll(/<[^>]+>/g, " "), 60) ?? "";
    const url = resolve(tag.href, base)?.split("#")[0];
    if (!url || !sameSite(url, pageUrl) || new URL(url).pathname === "/") {
      continue;
    }
    const subject = `${new URL(url).pathname} ${label}`;
    if (!LEGAL_LINK.test(subject)) {
      continue;
    }
    const rank = LEGAL_RANK.findIndex((pattern) => pattern.test(subject));
    if (!legal.has(url)) {
      legal.set(url, { label: label || new URL(url).pathname, rank: rank < 0 ? 9 : rank, url });
    }
  }

  const postal = organization?.address;
  const addressNode =
    postal && typeof postal === "object" && !Array.isArray(postal) ? (postal as JsonLdNode) : null;
  const country = addressNode?.addressCountry;
  const address = addressNode
    ? {
        city: clean(addressNode.addressLocality, 80) ?? undefined,
        country:
          clean(
            typeof country === "object" && country ? (country as JsonLdNode).name : country,
            80,
          ) ?? undefined,
        postalCode: clean(addressNode.postalCode, 20) ?? undefined,
        region: clean(addressNode.addressRegion, 80) ?? undefined,
        street: clean(addressNode.streetAddress, 160) ?? undefined,
      }
    : null;

  const text = decodeEntities(
    html
      .replaceAll(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
      .replaceAll(/<[^>]+>/g, " "),
  ).replaceAll(/\s+/g, " ");

  return {
    address: address && Object.values(address).some(Boolean) ? address : null,
    description:
      clean(meta.get("og:description"), 400) ??
      clean(meta.get("description"), 400) ??
      clean(organization?.description, 400),
    email: clean(organization?.email, 100)?.replace(/^mailto:/i, "") ?? findEmail(html, domain),
    icons: [...new Set(icons)].slice(0, 4),
    inlineCss,
    legalLinks: [...legal.values()]
      .sort((left, right) => left.rank - right.rank)
      .slice(0, 5)
      .map(({ label, url }) => ({ label, url })),
    legalName: clean(organization?.legalName, 120),
    logos: [...new Set(logos)].slice(0, 4),
    name,
    stylesheets: [...new Set(stylesheets)].slice(0, 4),
    themeColor:
      clean(meta.get("theme-color"), 40) ?? clean(meta.get("msapplication-tilecolor"), 40),
    vatNumber:
      clean(organization?.vatID, 20)
        ?.replaceAll(/[\s.-]/g, "")
        .toUpperCase() ?? findVatNumber(text),
  };
}
