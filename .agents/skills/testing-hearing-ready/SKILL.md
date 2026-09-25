---
name: testing-hearing-ready
description: How to run, seed, and verify the Hearing-Ready app (Vite/React, local-first LTB evidence-bundle compiler) for QA sessions — includes RentSafeTO JSONP quirks and PDF link verification.
---

# Testing Hearing-Ready

## Setup
- Repo: `/home/ubuntu/repos/hearing-ready`. Deps: `npm install` (already done in this checkout).
- Dev server: `npm run dev` → http://localhost:5173 (Vite, fully client-side React 19).
- Seed data: click **"Load sample case"** (top-right) or the hero CTA on the Case step to load the synthetic bundle (6 exhibits E1–E6, 6 timeline events). **"Start over"** resets to pristine — do this before recording a clean demo.
- Case address "Unit 3, 999 Fictional Ave" sets required match tokens `{999, FICTIONAL}` for the RentSafeTO address-match guard — real City records will always mismatch (by design; the sample address is fictional).

## RentSafeTO lookup quirks
- Uses **JSONP** (injected `<script>` tag), not fetch — the City CKAN endpoint has no CORS headers. If the lookup ever appears broken, check whether the endpoint still allows script responses; nothing is "cached" locally.
- CKAN datastore endpoint (verified live): `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?resource_id=244f7a02-da5c-425b-b55f-fbdd133dd732&q=<digits>&limit=25`. Useful real records: `q=555` → "555 THE WEST MALL", `q=1325` → "1325 YORK MILLS RD".
- Mismatch guard: "Attach anyway" stays disabled until the "Attach mismatched records anyway" checkbox is checked; the ack auto-resets on each new search.

## PDF verification
- "Generate & download PDF" on the Review step writes `hearing-ready-<slug>.pdf` to `~/Downloads` (slug is truncated — filename may end mid-word, e.g. `-sa`).
- Verify page text and link annotations with `pypdf` (`python3 -m pip install pypdf`): read `page.extract_text()` per page and `page["/Annots"]` — TOC and timeline chips are internal `/Dest` (or `/GoTo`) links; the Official-sources page has `/URI` annotations.

## Tooling gotchas
- `browser_console` with a non-empty `content` runs JS instead of returning logs — call it with `content: ""` (or omit) to actually read console output.
- Chrome binary: `/home/ubuntu/.local/bin/google-chrome`; maximize with `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz` before recording.

## Devin Secrets Needed
- None — fully local, no auth.
