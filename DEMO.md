# Hearing-Ready — demo script (≤ 3 minutes)

Narration beats, timed loosely. All data is synthetic.

## 0:00–0:20 — Hook

"Preparing for an LTB hearing means dates, photos, letters, and message threads scattered everywhere. Hearing-Ready compiles that into one paginated evidence bundle — entirely on the tenant's own device. Nothing is uploaded anywhere."

Show the landing page; point at the "Local-first" pill.

## 0:20–0:50 — One click to a real case

- Click **Load sample case** (top-right).
- "One click loads a complete synthetic case — photos, a letter PDF, a message export, a typed-note style record, and a public-data record."
- Scroll the Exhibits list: numbered chips E1–E6, per-file SHA-256, source descriptions, captured dates. Reorder one exhibit with ↑ to show renumbering.

## 0:50–1:20 — Optional public data

- In the RentSafeTO panel, type `1325 York Mills` and search.
- "The only thing that ever leaves the browser is a street name — to Toronto's official open-data API. Attach the building's published evaluation as a labeled public-data exhibit."
- Click **Attach as exhibit** on a result → it appears as `E7 Public record · Public data`.

## 1:20–1:50 — Timeline

- Step 3. "Each event gets a date — exact day or just the month — plain-language facts, and the exhibits that back it up."
- Click a chip toggle to link/unlink an exhibit; show the undated draft event.
- "Undated events and missing descriptions get flagged before export — not after."

## 1:50–2:40 — Review → PDF

- Step 4: validation panel lists the one flagged issue (undated event). "It jumps you straight to the fix."
- Click **Generate & download PDF**. Open it:
  - Cover: case facts + "READ FIRST" draft disclaimer.
  - TOC: page numbers; **click an entry → jumps to that exhibit**.
  - Timeline: dated events, chips E1…E7; **click a chip → jumps to the exhibit page**.
  - Exhibit pages: photo embedded, first page of the letter PDF embedded, message text, public-data table labeled "PUBLIC DATA — City of Toronto Open Data".
  - Checklist + official sources with clickable links.
- "Checksums identify the exact bytes — they don't prove authenticity, and the app says so on every exhibit page."

## 2:40–3:00 — Close

"React + pdf-lib, no backend, MIT-licensed. It organizes a draft — it never files anything and never gives legal advice. Verify rules at tribunalsontario.ca/ltb."

## Screenshot checklist (for Devpost)

- [ ] Landing / case details
- [ ] Exhibits list with chips + checksums
- [ ] RentSafeTO lookup with results
- [ ] Timeline with linked chips
- [ ] Validation panel
- [ ] PDF: cover
- [ ] PDF: TOC
- [ ] PDF: timeline with chips
- [ ] PDF: exhibit page (photo)
- [ ] PDF: public-data exhibit
