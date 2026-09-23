# Hearing-Ready

**A local-first evidence-bundle compiler for Ontario tenants preparing for a Landlord and Tenant Board (LTB) hearing** — focused on the T6 maintenance-application workflow and issues raised under s.82 of the Residential Tenancies Act, 2006.

Built for **LexHack 2026** (Devpost: https://lexhack-2026.devpost.com). Demo data is 100% synthetic.

## What it does

1. **Case details** — tenant, unit, landlord, and issue type (T6 / s.82) for the cover page.
2. **Evidence & exhibits** — drag in photos, PDFs, and text/message exports, or type a note. Each item becomes a numbered exhibit (E1, E2, …) with a source description and a SHA-256 checksum that identifies the exact bytes imported.
3. **Public data (optional)** — look up the building's published **RentSafeTO** apartment-building evaluation via the City of Toronto Open Data API and attach it as a labeled public-data exhibit.
4. **Timeline** — add dated events (exact day or month precision) in plain language and tag each one with the exhibits that support it.
5. **Review & export** — validation flags missing dates, unlinked exhibits, and empty descriptions, then generates a **paginated PDF bundle**: cover, how-to-use notices, clickable table of contents, timeline with clickable exhibit chips, numbered exhibit pages (photos embedded, first pages of PDFs embedded, text rendered, public records as labeled tables), a "before you file" checklist, and cited official sources.

## Local-first by design

- All uploaded files live in the browser's IndexedDB (Dexie). **Nothing is sent to a server or an LLM.**
- The only network feature is the optional RentSafeTO lookup, which sends only the street name you type to the public CKAN endpoint (`datastore_search`, dataset `apartment-building-evaluation`, no API key). The app is fully functional without it. The endpoint sends no CORS headers, so the app loads it via CKAN's `?callback=` JSONP support (a `<script>` GET to the city endpoint) — the trade-off is documented in `src/rentsafe.ts`.
- Checksums are shown to help you confirm which exact bytes are in the bundle. A checksum does **not** prove a file's authenticity or provenance.

## Important limitations

- Hearing-Ready is an **organizer**, not a legal tool. It produces a *draft for your review*; it does not file anything with the LTB, does not send anything to your landlord, and does not offer legal advice.
- Disclosure deadlines and hearing rules are set by the LTB and change — always verify on official Ontario sources (see below).
- Only the first 3 pages of an uploaded PDF are embedded; keep originals.
- Exhibit "public data" reproduces City of Toronto open data as fetched; it is not verified against the underlying inspection file.

## Official sources

- Landlord and Tenant Board — https://tribunalsontario.ca/ltb/
- LTB Rules of Practice and Procedure — https://tribunalsontario.ca/ltb/rules-of-practice/
- LTB forms incl. T6 — https://tribunalsontario.ca/ltb/forms/
- Residential Tenancies Act, 2006 (incl. s.82) — https://www.ontario.ca/laws/statute/06r17
- RentSafeTO — https://www.toronto.ca/community-people/housing-shelter/rental-housing-standards/apartment-building-standards/
- Toronto Open Data — Apartment Building Evaluation — https://open.toronto.ca/dataset/apartment-building-evaluation/
- ACTO (free tenant legal help) — https://www.acto.ca/

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest: numbering, page links, dates, PDF generation
npm run lint     # oxlint
npm run build    # typecheck + production build → dist/
```

## Demo

- One-click **"Load sample case"** (top-right) loads a fully synthetic case: generated photos, a generated PDF letter, a text-message export, a sample public-data record, and a linked timeline — then **Generate & download PDF**.
- ≤3-minute demo script: see [DEMO.md](DEMO.md).

## Tech

React 19 + TypeScript + Vite · pdf-lib (two-pass layout → TOC links resolved after pagination, internal `Link`/`Dest` annotations, embedded images and PDF pages) · Dexie (IndexedDB) · vitest · No backend.
