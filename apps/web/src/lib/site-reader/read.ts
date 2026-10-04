import { pickBrandColors } from "./colors";
import { visibleText } from "./html";
import { dominantColors, fetchImage, fromDataUrl } from "./logo";
import { modelConfigured, readLocation, readSiteFacts, type SiteFacts } from "./model";
import { extractPages, parallelConfigured, searchWeb, type ParallelPage } from "./parallel";
import { safeFetch, UnsafeUrlError, type SafeFetchOptions } from "./safe-fetch";
import { EMAIL_NOISE, extractSignals, findVatNumber, type SiteSignals } from "./signals";
import {
  emptyProfile,
  nameFromDomain,
  type ProfileField,
  type ProfileFieldKey,
  type ReaderEvent,
} from "./types";

export type ReadOptions = {
  /** False when the daily spend ceiling is reached: fetch only, no model, no search. */
  paid?: boolean;
  /** Test seams. Production uses the real network, Parallel and the model. */
  services?: Partial<ReaderServices>;
  signal?: AbortSignal;
};

export type ReaderServices = {
  extractPages: typeof extractPages;
  fetch: (url: string, options?: SafeFetchOptions) => ReturnType<typeof safeFetch>;
  fetchImage: typeof fetchImage;
  readLocation: typeof readLocation;
  readSiteFacts: typeof readSiteFacts;
  searchWeb: typeof searchWeb;
};

const SEARCH_SOURCES: Array<[RegExp, string]> = [
  [/(^|\.)crunchbase\.com$/, "Crunchbase"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)tracxn\.com$/, "Tracxn"],
  [/(^|\.)pitchbook\.com$/, "PitchBook"],
  [/(^|\.)dnb\.com$/, "Dun & Bradstreet"],
  [/(^|\.)opencorporates\.com$/, "OpenCorporates"],
  [/(^|\.)northdata\.(com|de)$/, "North Data"],
  [/(^|\.)wikipedia\.org$/, "Wikipedia"],
  [/(^|\.)facebook\.com$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(x|twitter)\.com$/, "X"],
  [/(^|\.)github\.com$/, "GitHub"],
  [/(^|\.)producthunt\.com$/, "Product Hunt"],
  [/(^|\.)wellfound\.com$/, "Wellfound"],
  [/(^|\.)trustpilot\.com$/, "Trustpilot"],
  [/(^|\.)yelp\.[a-z.]+$/, "Yelp"],
  [/(^|\.)clutch\.co$/, "Clutch"],
  [/(^|\.)g2\.com$/, "G2"],
  [/(^|\.)kompass\.com$/, "Kompass"],
  [/(^|\.)gelbeseiten\.de$/, "Gelbe Seiten"],
  [/(^|\.)paginasamarillas\.es$/, "Páginas Amarillas"],
  [/(^|\.)einforma\.com$/, "eInforma"],
  [/(^|\.)company-information\.service\.gov\.uk$/, "Companies House"],
];

/** Business directories, company profiles and the company's own pages. Nothing else. */
export function searchSourceLabel(url: string, domain: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === domain || host.endsWith(`.${domain}`)) {
      return "your own site";
    }
    return SEARCH_SOURCES.find(([pattern]) => pattern.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

function pageLabel(url: string | null | undefined) {
  if (!url) {
    return "your website";
  }
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (/impressum|imprint/.test(path)) {
    return "your Impressum";
  }
  if (/aviso-?legal|mentions|note-?legali|legal/.test(path)) {
    return "your legal page";
  }
  if (/terms|agb/.test(path)) {
    return "your terms";
  }
  if (/privacy|datenschutz|privacidad/.test(path)) {
    return "your privacy page";
  }
  if (/contact|kontakt|contacto/.test(path)) {
    return "your contact page";
  }
  if (/about|uber|ueber|sobre|company/.test(path)) {
    return "your about page";
  }
  return "your website";
}

function decode(body: Buffer, contentType: string) {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? "utf8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder().decode(body);
  }
}

/**
 * Reads a website and yields what it finds, cheapest signal first, so the
 * screen can fill in while the slower work (legal pages, model, outside
 * search) runs behind. Missing values stay missing: nothing here guesses.
 */
export async function* readSite(
  website: string,
  domain: string,
  options: ReadOptions = {},
): AsyncGenerator<ReaderEvent> {
  const services: ReaderServices = {
    extractPages,
    fetch: safeFetch,
    fetchImage,
    readLocation,
    readSiteFacts,
    searchWeb,
    ...options.services,
  };
  const paid = options.paid !== false;
  const canExtract = paid && (Boolean(options.services?.extractPages) || parallelConfigured());
  const canModel = paid && (Boolean(options.services?.readSiteFacts) || modelConfigured());
  const profile = emptyProfile(website, domain);
  if (!paid) {
    profile.degraded = true;
  }

  // Events from concurrent work are queued and drained in arrival order.
  const queue: Array<ReaderEvent> = [];
  let wake: (() => void) | null = null;
  const emit = (event: ReaderEvent) => {
    queue.push(event);
    wake?.();
  };
  const setField = (key: ProfileFieldKey, field: ProfileField | null | undefined) => {
    if (!field?.value) {
      return;
    }
    const current = profile.fields[key];
    if (current && current.confidence >= field.confidence) {
      return;
    }
    profile.fields[key] = field;
    emit({ field, key, type: "field" });
  };
  const site = (value: string | null | undefined, detail: string, confidence: number) =>
    value ? ({ confidence, detail, source: "site", value } satisfies ProfileField) : null;

  yield { domain, type: "start", website };
  yield { state: "active", step: "site", type: "step" };

  // 1. The homepage, fetched by us through the guarded fetcher.
  let signals: SiteSignals | null = null;
  let homepage: ParallelPage | null = null;
  let finalUrl = website;
  try {
    const response = await services.fetch(website, { signal: options.signal });
    if (response.status < 400 && /html|^$/i.test(response.contentType)) {
      const html = decode(response.body, response.contentType);
      finalUrl = response.url;
      signals = extractSignals(html, response.url);
      homepage = { text: visibleText(html).slice(0, 9000), title: null, url: response.url };
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      yield { code: "invalid", message: "That address is not a public website.", type: "error" };
      return;
    }
  }

  if (signals) {
    // A name cut out of a <title> is a guess the model's reading may improve on.
    const fromTitle = signals.name?.detail === "your site's title";
    setField(
      "name",
      site(signals.name?.value, signals.name?.detail ?? "your website", fromTitle ? 0.55 : 0.8),
    );
    setField("email", site(signals.email, "your website", 0.7));
    setField("legalName", site(signals.legalName, "your site's structured data", 0.85));
    setField("vatNumber", site(signals.vatNumber, "your website", 0.85));
    const address = signals.address;
    if (address) {
      for (const key of ["street", "postalCode", "city", "region", "country"] as const) {
        setField(key, site(address[key], "your site's structured data", 0.85));
      }
    }
  }
  yield* queue.splice(0);

  // 2. Everything else runs at once.
  const tasks: Array<Promise<void>> = [];
  const run = (task: () => Promise<void>) => {
    tasks.push(
      task().catch(() => {
        // A failed side task never fails the read.
      }),
    );
  };

  run(async () => {
    emit({ state: "active", step: "colors", type: "step" });
    const [logo, favicon, sheets] = await Promise.all([
      services.fetchImage(signals?.logos ?? [new URL("/favicon.ico", finalUrl).href], 320, {
        signal: options.signal,
      }),
      services.fetchImage(signals?.icons ?? [new URL("/favicon.ico", finalUrl).href], 96, {
        signal: options.signal,
      }),
      Promise.all(
        (signals?.stylesheets ?? []).slice(0, 3).map((url) =>
          services
            .fetch(url, {
              accept: "text/css,*/*;q=0.5",
              maxBytes: 600_000,
              signal: options.signal,
              timeoutMs: 5000,
            })
            .then((response) => (response.status === 200 ? response.body.toString("utf8") : ""))
            .catch(() => ""),
        ),
      ),
    ]);
    profile.logo = logo;
    profile.favicon = favicon;
    if (logo || favicon) {
      emit({ favicon, logo, type: "logo" });
    }
    profile.colors = pickBrandColors(
      [signals?.inlineCss ?? "", ...sheets].join("\n"),
      signals?.themeColor,
      // A black wordmark says nothing about colour; the favicon often does.
      [
        ...(logo ? await dominantColors(fromDataUrl(logo)) : []),
        ...(favicon ? await dominantColors(fromDataUrl(favicon)) : []),
      ],
    );
    profile.brandColor = profile.colors[0]?.hex ?? null;
    if (profile.colors.length > 0) {
      emit({ colors: profile.colors, type: "colors" });
    }
    emit({
      state: profile.colors.length > 0 || logo ? "done" : "skipped",
      step: "colors",
      type: "step",
    });
  });

  const legal = (async () => {
    emit({ state: "active", step: "legal", type: "step" });
    const urls = [finalUrl, ...(signals?.legalLinks ?? []).map((link) => link.url)].slice(0, 6);
    let pages = canExtract ? await services.extractPages(urls, { signal: options.signal }) : [];
    if (pages.length === 0 && homepage) {
      pages = [homepage];
    }
    const corpus = pages.map((page) => page.text).join("\n");
    setField("vatNumber", site(findVatNumber(corpus), "your website", 0.85));
    let facts: SiteFacts | null = null;
    if (canModel && pages.length > 0) {
      facts = await services.readSiteFacts({ domain, pages }, { signal: options.signal });
    }
    if (facts) {
      const where = pageLabel(facts.legalPage);
      setField("name", site(facts.displayName, "your website", signals?.name ? 0.6 : 0.75));
      setField("summary", site(facts.summary, "your website", 0.7));
      setField(
        "email",
        site(
          facts.email && !EMAIL_NOISE.test(facts.email) ? facts.email : null,
          "your website",
          0.6,
        ),
      );
      setField("legalName", site(facts.legalName, where, 0.8));
      setField("vatNumber", site(facts.vatNumber, where, 0.8));
      for (const key of [
        "street",
        "postalCode",
        "city",
        "region",
        "country",
        "countryCode",
      ] as const) {
        setField(key, site(facts[key], where, 0.8));
      }
    }
    if (!profile.fields.summary && signals?.description) {
      setField("summary", site(signals.description, "your site's description", 0.4));
    }
    emit({ state: pages.length > 0 ? "done" : "skipped", step: "legal", type: "step" });
    return pages.length;
  })().catch(() => 0);

  // 3. Outside search for city and country, started early for speed and used
  // only when the site itself gave no location.
  const knownName = profile.fields.name?.value;
  const search =
    canExtract && canModel && knownName && !profile.fields.city
      ? services
          .searchWeb(
            `Where is the company ${knownName} (${domain}) based? City, region and country.`,
            `${knownName} ${domain} company location headquarters`,
            { signal: options.signal },
          )
          .catch(() => [])
      : null;

  run(async () => {
    const pagesRead = await legal;
    if (!signals && pagesRead === 0) {
      return;
    }
    if (profile.fields.city || !search) {
      emit({ state: "skipped", step: "location", type: "step" });
      return;
    }
    emit({ state: "active", step: "location", type: "step" });
    const results = (await search).filter((result) => searchSourceLabel(result.url, domain));
    const location = await services.readLocation(
      {
        domain,
        name: profile.fields.name?.value ?? knownName!,
        results,
        summary: profile.fields.summary?.value,
      },
      { signal: options.signal },
    );
    const label = location?.sourceUrl ? searchSourceLabel(location.sourceUrl, domain) : null;
    if (location?.country && label) {
      // Never confirmed until the visitor says so.
      const found = (value: string | null): ProfileField | null =>
        value
          ? { confidence: 0.5, confirmed: false, detail: label, source: "search", value }
          : null;
      setField("city", found(location.city));
      setField("region", found(location.region));
      setField("country", found(location.country));
      setField(
        "countryCode",
        found(/^[A-Z]{2}$/.test(location.countryCode ?? "") ? location.countryCode : null),
      );
    }
    emit({
      state: location?.country && label ? "done" : "skipped",
      step: "location",
      type: "step",
    });
  });

  let pending = tasks.length;
  for (const task of tasks) {
    void task.then(() => {
      pending -= 1;
      wake?.();
    });
  }
  while (pending > 0 || queue.length > 0) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = null;
    }
    yield* queue.splice(0);
  }

  const pagesRead = await legal;
  if (!signals && pagesRead === 0) {
    yield {
      code: "unreachable",
      message: "We couldn't reach that website.",
      type: "error",
    };
    return;
  }

  // Nothing useful found: fall back to a name guessed from the domain, marked as a guess.
  if (!profile.fields.name) {
    setField("name", {
      confidence: 0.2,
      detail: "guessed from your domain",
      source: "site",
      value: nameFromDomain(domain),
    });
    yield* queue.splice(0);
  }
  yield { state: "done", step: "site", type: "step" };
  yield { profile, type: "done" };
}
