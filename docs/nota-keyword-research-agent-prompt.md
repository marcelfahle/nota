# Nota keyword research — agent prompt

You are researching market opportunity and organic acquisition for Nota. Use your keyword/SEO API and inspect live search results. Follow the approach in Noah Kagan's Million Dollar Weekend pages supplied by the founder: assess market direction, reachable buyers, price × customers, and profit after costs before committing to an acquisition plan. Produce a decision-ready assessment grounded in measured demand, search intent and Nota's actual capabilities. Then decide which pages and useful tools to build first to acquire activated users and paying customers.

## Start with the business opportunity

The founder wants a practical opportunity assessment inspired by the book, followed by keyword strategy. Address four gates:

1. **Market direction:** Is the customer problem growing, stable or shrinking? Compare closely related terms over five years and the latest 12 months. Separate durable demand from regulatory spikes, seasonality and changing vocabulary. A stable market can still be attractive; a growing graph alone is not sufficient.
2. **Reachable customers:** Estimate unique potential paying businesses in each shortlisted segment/geography using credible public sources. Distinguish broad total market, eligible serviceable market and customers realistically reachable through our channels. Monthly searches, social followers and Meta interest audiences are not interchangeable with unique buyers. Do not sum overlapping keyword volumes as market size. If you have legitimate access to Meta audience estimates or the public Ad Library, use them as optional supporting evidence, with date/location/deduplication caveats; do not create campaigns or spend on ads.
3. **Revenue potential:** Calculate illustrative €1 million annual recurring revenue scenarios at €6, €9 and €12 per month, excluding VAT and assuming customers pay for a full year. These are pricing sensitivities, not approved prices or market forecasts. Show required active paying customers and what proportion of each serviceable market that would imply. At €9/month, roughly 9,260 full-year active subscribers are required. Explain how discounts, churn and customers joining throughout the year change realized revenue.
4. **Profit potential:** Adapt the book's simple model to subscription software. Distinguish contribution margin from operating profit. Include AI usage, payment processing, hosting, transactional email, support, refunds, acquisition and fixed operating costs. Use verified costs where available and label all unknowns. Model typical users plus heavy AI users under the intended flat plan; stress-test churn and acquisition cost. Offer break-even and €1 million annual profit scenarios only with explicit assumptions, including fixed costs. Never present revenue as profit or a hypothetical margin as measured performance.

Compare three candidate entry markets: English-speaking freelancers/consultants, German independent businesses needing electronic invoicing, and developers/AI-agent users seeking programmable invoicing. Recommend a first market and explain evidence, uncertainty and practical reach. Give one cheap willingness-to-pay experiment per finalist, with a specific offer, recruitment channel, success/failure threshold and next action. Propose experiments only; do not contact prospects or run ads. Validation should include creating/sending a real invoice and evidence of payment willingness, rather than email signups alone.

## Product context

- Canonical website: https://www.withnota.com; app: https://app.withnota.com. nota.wtf is an alternate brand domain. Concentrate SEO on the .com.
- Nota is invoicing software for independent work: freelancers, consultants, developers, designers and small service businesses. It has a web app, conversational invoice creation, REST API, CLI and MCP for compatible AI clients.
- Positioning hypotheses: elegant simple invoicing; affordable flat pricing; invoicing from AI/agent workflows; open source and self-hosting. Test these hypotheses rather than assuming they have search demand.
- Nota is not a full accounting, payroll or tax-filing suite. Do not promote unsupported features or blanket legal compliance. Verify XRechnung/ZUGFeRD, integrations, exports, self-hosting maturity and release status before recommending feature claims. Self-hosting improvements are underway, not a verified turnkey offering yet.
- One base plan is intended to include ordinary workflows and AI; no premium workflow tier is planned. A roughly €9 monthly price is under discussion, not a verified advertised price. Check the live website before using pricing in comparisons.
- Existing public content includes the homepage and /freshbooks comparison. Inspect the sitemap and live site for the current inventory, and identify opportunities without duplicating existing intent.

### German-market capability check (source inspection, 5 October 2026)

Nota has a UBL XRechnung 3.0 XML generator, download routes and SDK access. This is a starting implementation, not independently verified conformance: existing tests check generated strings, with no KoSIT validation integration found. The generator uses the invoice number as BuyerReference, only models standard/zero/reverse-charge tax categories, and parses free-text addresses with a DE fallback. It lacks a dedicated Kleinunternehmer exemption model. The normal invoice email job attaches a regular PDF only, not the XML. PDF labels and formatting are English/en-US. No ZUGFeRD generator, incoming e-invoice viewer/validator, DATEV integration or verified preservation of original issued XML was found in this inspection. Do not recommend marketing those as existing capabilities.

The BMF's March 2026 FAQ distinguishes structured e-invoices from regular PDFs, permits email delivery, and says an email inbox suffices for receiving e-invoices. Kleinunternehmer are exempt from issuing mandatory e-invoices but must be able to receive them. Thus a Nota receiving inbox or ZUGFeRD support may be useful product choices; neither is automatically required for every customer's compliance. Validate all interpretations against https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html and technical conformance against https://xeinkauf.de/xrechnung/ .

## Questions to answer

1. Which attainable queries can bring people likely to create, send and repeatedly use invoices?
2. Where do specific freelancer use cases beat generic competitive head terms?
3. Do AI/chat/CLI/MCP and open-source angles represent measurable search demand, differentiation within existing demand, or distribution opportunities outside Google?
4. Is German e-invoicing an attractive first market? Which queries concern creation versus receiving, viewing, converting, validating or legal information?
5. Which competitor alternatives have a credible reason to switch to Nota, and which would attract people who need capabilities we lack?

## Research scope

Research English separately for the US and UK, German for Germany. Use worldwide English only as a supplementary view. Run a small Spanish/Spain exploratory sample if the API supports it; recommend whether deeper research is justified. Never pool language/country volumes or present worldwide volume as a local estimate.

Expand seeds across these clusters:

- Core: invoice generator, invoice maker, invoicing software, simple invoicing, freelancer invoice, consultant invoice, invoice template, free invoice generator.
- Persona/jobs: invoicing for developers/designers/consultants, freelance invoice template, recurring service invoices, overdue invoice reminder, partial payment invoice, getting paid by clients.
- AI/agents: AI invoice generator, create invoice with ChatGPT, invoicing with Claude, invoice automation, invoicing API, invoice CLI, invoicing MCP server. Distinguish issuing invoices from invoice OCR, accounts payable and document extraction.
- Open source: open source invoicing software, self hosted invoicing, Invoice Ninja alternative, InvoicePlane alternative; discover additional relevant competitors.
- Alternatives: FreshBooks, Wave, Bonsai, Zoho Invoice, Invoice Ninja and relevant local products. In Germany investigate Lexware Office/lexoffice, sevdesk and Papierkram; verify their current names and scope.
- German: Rechnung erstellen, Rechnungsvorlage, Rechnungsprogramm, Rechnungssoftware für Freiberufler, E-Rechnung erstellen, E-Rechnung erstellen kostenlos, XRechnung erstellen, ZUGFeRD erstellen, XRechnung Validator, E-Rechnung empfangen, E-Rechnung Viewer. Explore user language and spelling variants instead of translating English lists mechanically.
- Useful free tools: invoice creation, templates, format viewer/validator, reminder generator and tax/calculation helpers. Separate viable acquisition tools from features requiring substantial correctness or regulatory work.

Begin with a bounded discovery pass; batch requests and deduplicate. State provider, endpoints, location/language settings, retrieval date and usage/cost if available. If the API exposes costs, keep the first pass within $20 and stop before exceeding it. If costs are unavailable, limit expansion rather than making an unbounded crawl.

## Evidence and method

- Collect monthly search volume and monthly history, CPC with currency, organic difficulty if actually supplied, paid competition separately, and SERP results/features. Record null when unavailable; never invent metrics or infer organic difficulty from ad competition.
- Inspect current SERPs for the top 30 candidates across clusters. Record country, language, device, top ranking pages/domains, actual intent and whether results favor tools, templates, product pages or articles. Note ads, AI answers and other click-reducing features where observed.
- Cluster by shared intent and SERP overlap, not word similarity alone. Assign one primary page per intent, related queries and internal links. Avoid duplicate persona pages with interchangeable copy.
- Assess attainability for a young site: strength of ranking pages, intent fit, useful product advantage, content/tool effort and activation path. Score business fit, intent, attainability and effort transparently; do not let volume dominate.
- Separate evidence from inference. Low/zero API volume means uncertain measured demand, not proof of no market. Brand names and acronyms can be ambiguous. Reject unrelated results and flag suspicious spikes.
- Verify regulation-related statements against current official sources. Search interest is not evidence that a product is compliant.

## Google Trends context to validate

Browser research on 5 October 2026, Web Search, all categories, search terms rather than topics:

- US, past 12 months: complete-week average indices were invoice generator 63.23, invoicing software 52.37, AI invoice generator 2.56, open source invoicing 1.32, within the same comparison. These are normalized relative-interest indices, not search volumes.
- Germany, past 5 years: the latest complete 13-week mean exceeded the first 52-week mean for E-Rechnung (26.69 vs 0.29), XRechnung (17.08 vs 4.56), ZUGFeRD (32.92 vs 2.77), and Rechnung erstellen (10.77 vs 6.65); Rechnungsprogramm was 4.31 vs 4.98. These windows differ and do not constitute year-over-year growth rates.
- Rising German suggestions included e-rechnung erstellen kostenlos, e-rechnung empfangen, e-rechnung software kostenlos and xrechnung validator. Treat these as seed ideas, not validated keyword volumes.
- Broad worldwide AI invoice displayed a large rise, but its intent is ambiguous. Some US related-query results were unrelated to invoicing. Validate phrasing, SERPs and history before drawing conclusions.
- Excluded the incomplete week starting 4 October. Less-than-one observations were represented as 0.5 for these exploratory averages. Never compare indices from independently normalized charts.

## Deliverables

1. A founder-facing opportunity scorecard first: market direction, serviceable/reachable buyers, illustrative ARR/profit scenarios, strongest evidence, confidence and main uncertainty for each candidate market. End with a pursue/test/defer recommendation and a willingness-to-pay experiment. Be willing to conclude evidence is insufficient; do not manufacture a million-euro opportunity.
2. A concise acquisition recommendation: best initial audience/market, positioning supported by demand, three strongest clusters, and where we should avoid spending effort.
3. A CSV keyword inventory with keyword, country, language, source/date, volume/history, CPC/currency, organic difficulty, paid competition, intent, cluster, current SERP evidence, product fit, proposed page type/URL, effort, priority and confidence. Provide raw API exports separately for reproducibility.
4. The best 20 opportunities, each with an explicit reason, attainable first page/tool, conversion path and limitations. Do not force 20 if fewer survive scrutiny.
5. A first 10-page/tool roadmap in build order: target queries, SERP evidence, specific standalone value, differentiation, proposed title/URL, product dependency, internal links and CTA. Mark recommendations as existing-capability, content-only, or feature-dependent. Separate pages worth building now from conditional ideas needing validation; do not turn an uncertain market into a mass-content plan.
6. Competitor/content gaps supported by ranking pages, with honest comparison boundaries. No fabricated competitor deficiencies.
7. A 30/60/90-day plan and measurement: indexing, nonbrand impressions/clicks, first invoice created, first invoice sent, activated workspaces and paid conversion by landing page. Separate Google search acquisition from AI-client referrals and developer distribution. No ranking or revenue guarantees.

Do the research and deliver findings. Do not publish pages, buy links, change the app or domain settings, or spend beyond the bounded research pass. Finish with the five decisions the founder should make next.
