import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef } from 'pdf-lib';
import { generateBundle } from '../src/pdf/bundle';
import { exhibitNumber } from '../src/lib/exhibits';
import { makeBundle, makeEvent, makeExhibit, TINY_PNG } from './fixtures';
import type { CaseBundle, Exhibit } from '../src/types';

/** Extracts literal strings drawn with Tj/TJ ops from all (flate) content streams. */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const unescape = (s: string) =>
    s.replace(/\\(n|r|t|b|f|\(|\)|\\|[0-7]{1,3})/g, (_, g: string) => {
      const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      return map[g] ?? String.fromCharCode(parseInt(g, 8));
    });
  const literal = /\((?:\\[\s\S]|[^\\()])*\)/g;
  const hexStr = /<([0-9A-Fa-f\s]+)>/g;
  const winAnsi = (s: string) =>
    s.replace(/[\x80-\x9F]/g, (c) =>
      ({ '\x96': '–', '\x97': '—', '\x91': '‘', '\x92': '’', '\x93': '“', '\x94': '”', '\x85': '…' })[c] ?? c);
  const parts: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    let data: Uint8Array;
    try {
      data = inflateSync(Buffer.from(obj.contents));
    } catch {
      continue;
    }
    const s = Buffer.from(data).toString('latin1');
    for (const m of s.matchAll(literal)) parts.push(unescape(m[0].slice(1, -1)));
    for (const m of s.matchAll(hexStr)) {
      const hex = m[1].replace(/\s/g, '');
      if (hex.length % 2) continue;
      parts.push(winAnsi(Buffer.from(hex, 'hex').toString('latin1')));
    }
  }
  return parts.join(' ');
}

function publicRecordExhibit(synthetic: boolean): Exhibit {
  const meta = {
    dataset: 'apartment-building-evaluation',
    query: 'TEST QUERY',
    fetchedAt: '2026-09-20T12:00:00.000Z',
    sourceUrl: 'https://open.toronto.ca/dataset/apartment-building-evaluation/',
    recordId: 'x',
    ...(synthetic ? { synthetic: true } : {}),
  };
  const record = { 'SITE ADDRESS': '999 FICTIONAL AVE', 'PROPERTY TYPE': 'PRIVATE', 'CURRENT BUILDING EVAL SCORE': '81' };
  return makeExhibit({
    fileName: 'rentsafeto-record.json',
    kind: 'public-record',
    source: 'public-data',
    mimeType: 'application/json',
    description: synthetic ? 'SYNTHETIC SAMPLE — fictional data, not an actual City of Toronto record.' : 'Live record.',
    publicRecord: meta,
    textContent: JSON.stringify({ meta, record }),
  });
}

async function makeSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]).drawText('sample pdf page', { x: 20, y: 150, size: 12 });
  doc.addPage([300, 300]).drawText('page two', { x: 20, y: 150, size: 12 });
  return doc.save();
}

async function buildTestCase() {
  const pdfBytes = await makeSamplePdf();
  const photo = makeExhibit({ fileName: 'photo.png', kind: 'photo', mimeType: 'image/png' });
  const doc2 = makeExhibit({ fileName: 'letter.pdf', kind: 'pdf', mimeType: 'application/pdf', byteSize: pdfBytes.length });
  const note = makeExhibit({ fileName: 'note.txt', kind: 'note', source: 'tenant-note', mimeType: 'text/plain', textContent: 'Line one of the note.\nLine two.' });
  const bundle: CaseBundle = makeBundle({
    exhibits: [photo, doc2, note],
    events: [
      makeEvent({ title: 'First event', date: '2026-01-12', exhibitIds: [photo.id, doc2.id] }),
      makeEvent({ title: 'Second event', date: '2026-02-03', exhibitIds: [note.id] }),
      makeEvent({ title: 'Undated event', date: null, exhibitIds: [] }),
    ],
  });
  const files = new Map<string, Uint8Array>([
    [photo.id, TINY_PNG],
    [doc2.id, pdfBytes],
    [note.id, new TextEncoder().encode(note.textContent)],
  ]);
  return { bundle, files };
}

describe('generateBundle', () => {
  it('produces a valid multi-page PDF with the expected structure', async () => {
    const { bundle, files } = await buildTestCase();
    const { bytes, plan } = await generateBundle({ bundle, files, generatedAt: new Date('2026-09-21T00:00:00Z') });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(plan.pageCount);
    // cover + notices + toc + timeline + 3 exhibits + checklist + sources
    expect(plan.pageCount).toBeGreaterThanOrEqual(8);
    expect(doc.getTitle()).toContain('Evidence bundle');
    expect(doc.getCreator()).toContain('Hearing-Ready');
  });

  it('records a page target for every section and exhibit', async () => {
    const { bundle, files } = await buildTestCase();
    const { plan } = await generateBundle({ bundle, files });
    expect(plan.targets['timeline']).toBeGreaterThanOrEqual(2);
    for (const ex of bundle.exhibits) {
      expect(plan.targets[`exhibit:${ex.id}`]).toBeGreaterThan(plan.targets['timeline']);
    }
    expect(plan.targets['checklist']).toBeGreaterThan(plan.targets['timeline']);
    expect(plan.targets['sources']).toBeGreaterThan(plan.targets['checklist']);
    // exhibit pages are sequential and in numbering order
    const nums = bundle.exhibits.map((e) => plan.targets[`exhibit:${e.id}`]);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
  });

  it('emits link annotations for TOC entries and timeline chips pointing at real pages', async () => {
    const { bundle, files } = await buildTestCase();
    const { bytes, plan } = await generateBundle({ bundle, files });
    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages();

    // TOC links: one per entry, all on TOC pages, all internally targeting valid pages
    const tocLinks = plan.links.filter((l) => l.targetKey && l.page < 2 + plan.tocPageCount);
    expect(tocLinks.length).toBe(bundle.exhibits.length + 3); // timeline + exhibits + checklist + sources
    for (const l of tocLinks) {
      expect(plan.targets[l.targetKey!]).toBeLessThan(plan.pageCount);
    }

    // Chip links: one per exhibit reference in events (3 total)
    const chipLinks = plan.links.filter((l) => l.targetKey?.startsWith('exhibit:') && l.page >= plan.targets['timeline']);
    expect(chipLinks.length).toBe(3);

    // Verify actual Annots made it into the file and resolve to the right pages
    const tocPage = pages[2];
    const annots = tocPage.node.lookup(PDFName.of('Annots'), PDFArray);
    expect(annots.size()).toBeGreaterThan(0);
    const first = doc.context.lookup(annots.get(0) as PDFRef) as { get: (k: PDFName) => unknown };
    const dest = first.get(PDFName.of('Dest'));
    expect(dest).toBeDefined();
  });

  it('handles an empty bundle without crashing', async () => {
    const { bytes, plan } = await generateBundle({ bundle: makeBundle(), files: new Map() });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(plan.pageCount);
    expect(plan.pageCount).toBeGreaterThanOrEqual(5);
  });

  it('surfaces a warning instead of crashing on a corrupt PDF exhibit', async () => {
    const bad = makeExhibit({ fileName: 'broken.pdf', kind: 'pdf', mimeType: 'application/pdf' });
    const bundle = makeBundle({
      exhibits: [bad],
      events: [makeEvent({ exhibitIds: [bad.id] })],
    });
    const files = new Map([[bad.id, new Uint8Array([1, 2, 3, 4])]]);
    const { plan } = await generateBundle({ bundle, files });
    expect(plan.warnings.some((w) => w.includes('broken.pdf'))).toBe(true);
  });

  it('labels a synthetic public-record exhibit as invented data, never City-published', async () => {
    const ex = publicRecordExhibit(true);
    const bundle = makeBundle({ exhibits: [ex], events: [makeEvent({ exhibitIds: [ex.id] })] });
    const { bytes } = await generateBundle({ bundle, files: new Map() });
    const text = await extractPdfText(bytes);
    expect(text).toContain('SYNTHETIC SAMPLE');
    expect(text).toContain('NOT AN ACTUAL CITY OF TORONTO RECORD');
    expect(text).toContain('invented sample data');
    expect(text).toContain('Synthetic sample (RentSafeTO format)');
    expect(text).not.toContain('Scores are as published');
    expect(text).not.toContain('PUBLIC DATA');
  });

  it('keeps genuine live-record labeling for non-synthetic exhibits', async () => {
    const ex = publicRecordExhibit(false);
    const bundle = makeBundle({ exhibits: [ex], events: [makeEvent({ exhibitIds: [ex.id] })] });
    const { bytes } = await generateBundle({ bundle, files: new Map() });
    const text = await extractPdfText(bytes);
    expect(text).toContain('PUBLIC DATA');
    expect(text).toContain('CITY OF TORONTO OPEN DATA');
    expect(text).toContain('Scores are as published by the City of Toronto');
    expect(text).not.toContain('SYNTHETIC SAMPLE');
  });

  it('keeps exhibit numbering consistent between events and targets', async () => {
    const { bundle, files } = await buildTestCase();
    const { plan } = await generateBundle({ bundle, files });
    bundle.exhibits.forEach((ex, i) => {
      expect(exhibitNumber(bundle, ex.id)).toBe(i + 1);
      expect(typeof plan.targets[`exhibit:${ex.id}`]).toBe('number');
    });
  });
});
