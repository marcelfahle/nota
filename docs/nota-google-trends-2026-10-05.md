# Nota Google Trends exploratory research — 5 October 2026

Collected in Chrome using Google Trends' own CSV download controls. All categories, Web Search, **search terms**, not Google topic entities. Raw CSV exports and calculated summary are in `.nota/seo/trends-2026-10-05/`. The final week starting 4 October is incomplete and excluded. For exploratory averages `<1` is represented as 0.5.

## US: established demand versus differentiated positioning

[Open comparison](https://trends.google.com/trends/explore?date=today%2012-m&geo=US&q=invoice%20generator,invoicing%20software,AI%20invoice%20generator,open%20source%20invoicing&hl=en)

| Search term | Average index, 52 complete weeks |
| --- | ---: |
| invoice generator | 63.23 |
| invoicing software | 52.37 |
| AI invoice generator | 2.56 |
| open source invoicing | 1.32 |

Inference: start keyword research with ordinary invoice creation and software jobs, then test AI and open-source differentiation in those journeys. This does not establish conversion, keyword difficulty, total market size or demand for other AI/open-source phrasing. Low-volume indices are unstable. Several related suggestions were irrelevant (including automotive/insurance searches under invoicing software); do not use them without SERP validation.

## Germany: format-specific opportunities

[Open comparison](https://trends.google.com/trends/explore?date=today%205-y&geo=DE&q=Rechnung%20erstellen,Rechnungsprogramm,E-Rechnung,XRechnung,ZUGFeRD&hl=en)

| Search term | First 52-week mean | Latest 13 complete weeks |
| --- | ---: | ---: |
| Rechnung erstellen | 6.65 | 10.77 |
| Rechnungsprogramm | 4.98 | 4.31 |
| E-Rechnung | 0.29 | 26.69 |
| XRechnung | 4.56 | 17.08 |
| ZUGFeRD | 2.77 | 32.92 |

Latest included week starts 27 September 2026. These are different-length windows in the same five-year chart; no year-over-year growth rate is claimed. Recent interest in format terms is substantially higher than the early baseline, while the generic software wording is not.

Relevant rising suggestions observed: `e-rechnung erstellen kostenlos`, `e-rechnung empfangen`, `e-rechnung software kostenlos`, `xrechnung validator`, `lexware e rechnung`. Breakout labels can reflect tiny starting baselines; they are not absolute demand estimates.

Inference: investigate useful creation, viewer and validator pages/tools, with separate intent clusters. Verify product capability before offering a tool or promising format compliance. No regulatory deadline or compliance conclusion was researched in this pass.

## Worldwide exploratory comparison

[Open comparison](https://trends.google.com/trends/explore?date=today%205-y&q=invoice%20generator,invoicing%20software,AI%20invoice,open%20source%20invoicing&hl=en)

Invoice generator's mean index rose from 18.02 in the first 52 weeks to 36.13 in the last 52 complete weeks. Invoicing software rose from 4.42 to 29.02. Broad `AI invoice` rose sharply, but needs intent validation: invoice creation, processing/OCR and accounts payable are different markets. Worldwide English aggregates markets and should not replace country-specific keyword volumes.

## Interpretation limits and next step

Google Trends uses sampled, normalized relative search interest, scaled 0–100. A zero can mean insufficient data; it does not prove nobody searches. Compare terms within a shared query configuration, not numerical indices across independently normalized charts. Sampling and low-volume noise limit precision; the two decimal places here reflect arithmetic on the export, not equivalent measurement precision. [Google's data FAQ](https://support.google.com/trends/answer/4365533?hl=en).

Use these observations as hypotheses for the [keyword-agent research prompt](nota-keyword-research-agent-prompt.md): obtain local monthly volumes, examine intent and ranking pages, and prioritize attainable pages that lead to recurring invoice use. Brand-only Nota searches are ambiguous and premature as a measure of product demand.
