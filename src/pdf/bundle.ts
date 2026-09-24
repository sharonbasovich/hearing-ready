import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFArray,
  PDFRef,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { CaseBundle, Exhibit } from '../types';
import { formatEventDate, formatLongDate, sortEvents } from '../lib/dates';
import { exhibitNumber, exhibitSourceLabel, kindLabel } from '../lib/exhibits';
import { summarizeRecord, DATASET_PAGE_URL } from '../rentsafe';

export const PAGE_W = 612; // US Letter
export const PAGE_H = 792;
export const MARGIN = 54;
export const CONTENT_W = PAGE_W - MARGIN * 2;

const NAVY = rgb(0.1, 0.16, 0.29);
const INK = rgb(0.13, 0.15, 0.2);
const MUTED = rgb(0.42, 0.46, 0.54);
const ACCENT = rgb(0.76, 0.35, 0.14);
const LIGHT = rgb(0.94, 0.95, 0.97);
const RULE = rgb(0.82, 0.85, 0.89);
const LINK = rgb(0.08, 0.33, 0.62);
const WARN = rgb(0.55, 0.25, 0.05);
const CHIP_BG = rgb(0.93, 0.96, 1);

type FontKey = 'regular' | 'bold' | 'oblique' | 'mono';
type Fonts = Record<FontKey, PDFFont>;

export interface BundleFileMap {
  get(id: string): Uint8Array | undefined;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PendingLink {
  page: number; // 0-based index in the output doc
  rect: Rect;
  targetKey?: string; // resolved via targets map -> internal destination
  url?: string; // external http(s) link
}

export interface BundlePlan {
  targets: Record<string, number>; // target key -> 0-based page index
  links: PendingLink[];
  pageCount: number;
  tocPageCount: number;
  warnings: string[];
}

export interface BundleInput {
  bundle: CaseBundle;
  files: BundleFileMap;
  generatedAt?: Date;
}

const sanitize = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');

export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
      } else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}

const TOC_LEAD = 56;
const TOC_ROW = 18;
const TOC_PER_PAGE = Math.floor((PAGE_H - MARGIN * 2 - 40 - TOC_LEAD) / TOC_ROW);
const MAX_PDF_PAGES = 3;
const TEXT_LINES_PER_PAGE = 42;

interface RenderCtx {
  doc: PDFDocument;
  fonts: Fonts;
  page: PDFPage;
  pageIndex: number;
  y: number; // y-coordinate of the next line baseline region (from bottom origin)
  targets: Record<string, number>;
  links: PendingLink[];
  warnings: string[];
}

function contentTopY() {
  return PAGE_H - MARGIN - 30;
}

function contentBottomY() {
  return MARGIN + 24;
}

function newPage(ctx: RenderCtx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pageIndex = ctx.doc.getPageCount() - 1;
  ctx.y = contentTopY();
}

function ensure(ctx: RenderCtx, h: number) {
  if (ctx.y - h < contentBottomY()) newPage(ctx);
}

function para(ctx: RenderCtx, text: string, font: FontKey, size: number, color = INK, indent = 0): number {
  const lines = wrapText(sanitize(text), ctx.fonts[font], size, CONTENT_W - indent);
  let drawn = 0;
  for (const line of lines) {
    ensure(ctx, size + 4);
    ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y, size, font: ctx.fonts[font], color });
    ctx.y -= size * 1.3;
    drawn++;
  }
  return drawn;
}

function heading(ctx: RenderCtx, text: string) {
  ensure(ctx, 44);
  ctx.page.drawText(text, { x: MARGIN, y: ctx.y, size: 18, font: ctx.fonts.bold, color: NAVY });
  ctx.y -= 12;
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: MARGIN + CONTENT_W, y: ctx.y }, thickness: 1, color: RULE });
  ctx.y -= 22;
}

function addLink(ctx: RenderCtx, rect: Rect, link: Omit<PendingLink, 'page' | 'rect'>) {
  ctx.links.push({ page: ctx.pageIndex, rect, ...link });
}

// ---------- main entry ----------

export async function generateBundle(input: BundleInput): Promise<{ bytes: Uint8Array; plan: BundlePlan }> {
  const bundle = input.bundle;
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    oblique: await doc.embedFont(StandardFonts.HelveticaOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };

  const tocEntries = [
    { label: 'Timeline of events', target: 'timeline' },
    ...bundle.exhibits.map((ex, i) => ({ label: `Exhibit ${i + 1} — ${ex.fileName}`, target: `exhibit:${ex.id}` })),
    { label: 'Before you file — checklist', target: 'checklist' },
    { label: 'Official sources', target: 'sources' },
  ];
  const tocPageCount = Math.max(1, Math.ceil(tocEntries.length / TOC_PER_PAGE));

  // fixed front matter: cover (0), notices (1), toc (2..2+tocPageCount-1)
  doc.addPage([PAGE_W, PAGE_H]);
  doc.addPage([PAGE_W, PAGE_H]);
  for (let i = 0; i < tocPageCount; i++) doc.addPage([PAGE_W, PAGE_H]);

  const ctx: RenderCtx = {
    doc,
    fonts,
    page: doc.getPages()[0],
    pageIndex: 0,
    y: 0,
    targets: {},
    links: [],
    warnings: [],
  };

  const generatedAt = input.generatedAt ?? new Date();
  drawCover(ctx, bundle, generatedAt);
  ctx.page = doc.getPages()[1];
  ctx.pageIndex = 1;
  ctx.y = contentTopY();
  drawNotices(ctx);

  // content
  newPage(ctx);
  ctx.targets['timeline'] = ctx.pageIndex;
  await drawTimeline(ctx, input);
  for (const ex of bundle.exhibits) {
    newPage(ctx);
    ctx.targets[`exhibit:${ex.id}`] = ctx.pageIndex;
    await drawExhibit(ctx, ex, bundle, input);
  }
  newPage(ctx);
  ctx.targets['checklist'] = ctx.pageIndex;
  drawChecklist(ctx);
  newPage(ctx);
  ctx.targets['sources'] = ctx.pageIndex;
  drawSources(ctx, bundle);

  drawToc(ctx, tocEntries, tocPageCount);
  drawChrome(doc, bundle, fonts, generatedAt);
  applyLinks(doc, ctx.links, ctx.targets);

  doc.setTitle(`Evidence bundle — ${bundle.title || bundle.unitAddress || 'untitled'}`);
  doc.setCreator('Hearing-Ready (local-first evidence organizer)');
  doc.setProducer('pdf-lib');
  doc.setCreationDate(generatedAt);
  doc.setKeywords(['draft', 'evidence', 'LTB', 'Ontario', 'tenant']);

  const bytes = await doc.save();
  const plan: BundlePlan = {
    targets: ctx.targets,
    links: ctx.links,
    pageCount: doc.getPageCount(),
    tocPageCount,
    warnings: ctx.warnings,
  };
  return { bytes, plan };
}

// ---------- front matter ----------

function drawCover(ctx: RenderCtx, bundle: CaseBundle, at: Date) {
  const { page } = ctx;
  const f = ctx.fonts;
  page.drawRectangle({ x: 0, y: PAGE_H - 320, width: PAGE_W, height: 320, color: NAVY });
  page.drawText('E V I D E N C E   B U N D L E', { x: MARGIN, y: PAGE_H - 110, size: 13, font: f.bold, color: rgb(1, 1, 1) });
  wrapText(sanitize(bundle.title || 'Tenant evidence bundle'), f.bold, 26, CONTENT_W).forEach((line, i) => {
    page.drawText(line, { x: MARGIN, y: PAGE_H - 150 - i * 32, size: 26, font: f.bold, color: rgb(1, 1, 1) });
  });
  page.drawText('Prepared with Hearing-Ready — a draft organizer, not a filed document.', {
    x: MARGIN, y: PAGE_H - 270, size: 11, font: f.oblique, color: rgb(0.85, 0.88, 0.93),
  });

  let y = PAGE_H - 380;
  const rows: [string, string][] = [
    ['Tenant (draft)', bundle.tenantName || '—'],
    ['Rental unit', bundle.unitAddress || '—'],
    ['Landlord / respondent', bundle.landlordName || '—'],
    ['Issue type', bundle.issueTags.join('; ') || '—'],
    ['Prepared', formatLongDate(at)],
    ['Contents', `${bundle.events.length} timeline events · ${bundle.exhibits.length} exhibits`],
  ];
  for (const [label, value] of rows) {
    page.drawText(label.toUpperCase(), { x: MARGIN, y, size: 8, font: f.bold, color: MUTED });
    wrapText(sanitize(value), f.regular, 11, CONTENT_W - 160).forEach((line, i) => {
      page.drawText(line, { x: MARGIN + 160, y: y - 2 - i * 14, size: 11, font: f.regular, color: INK });
    });
    y -= 34;
  }

  const boxH = 124;
  page.drawRectangle({ x: MARGIN, y: MARGIN + 16, width: CONTENT_W, height: boxH, color: LIGHT, borderColor: RULE, borderWidth: 1 });
  page.drawText('READ FIRST', { x: MARGIN + 16, y: MARGIN + 16 + boxH - 26, size: 9, font: f.bold, color: ACCENT });
  [
    'This bundle is a working draft for your own review and organization. It has not been',
    'filed with the Landlord and Tenant Board, and filing or sending is never automatic.',
    'Disclosure deadlines and hearing rules change — verify them on official Ontario',
    'sources (tribunalsontario.ca/ltb) before relying on this document. This is not legal advice.',
  ].forEach((line, i) => {
    page.drawText(line, { x: MARGIN + 16, y: MARGIN + 16 + boxH - 46 - i * 14, size: 9.5, font: f.regular, color: INK });
  });
}

function drawNotices(ctx: RenderCtx) {
  heading(ctx, 'How to use this bundle');
  const sections: [string, string][] = [
    ['What this is', 'A paginated compilation of your dated timeline and numbered source exhibits, assembled locally on your device to help you prepare for a Landlord and Tenant Board hearing (for example a T6 maintenance application, or issues raised under s.82 of the Residential Tenancies Act, 2006).'],
    ['Disclosure timing', 'LTB Rule 19: unless the Board directs otherwise, parties must give the other parties and the LTB the evidence they intend to rely on at least 7 days before a case management conference or hearing; responding evidence at least 5 days before. The Rules of Procedure and your notice of hearing set the deadline for your proceeding — verify the current rules on tribunalsontario.ca/ltb before relying on this bundle.'],
    ['Exhibits and sources', 'Each timeline event lists numbered exhibit chips (E1, E2, …). In the PDF, clicking a chip or a table-of-contents entry jumps to that exhibit page. Every exhibit page states where the material came from.'],
    ['Checksums', 'Each uploaded file shows a SHA-256 checksum. A checksum only identifies the exact bytes of the file you imported — it does not prove where a file came from, when it was made, or that it is authentic.'],
    ['Your files stay local', 'Uploads are stored in this browser on this device only. They are not sent to any server or AI service. The only optional network feature is the Toronto Open Data (RentSafeTO) lookup, which sends only the street name you type.'],
    ['Not legal advice', 'Hearing-Ready organizes information. It does not assess the merits of your case, predict outcomes, or tell you what to file. For advice, contact a community legal clinic (for example via ACTO) or a licensed legal professional.'],
  ];
  for (const [h, body] of sections) {
    ensure(ctx, 30);
    ctx.page.drawText(h, { x: MARGIN, y: ctx.y, size: 11, font: ctx.fonts.bold, color: ACCENT });
    ctx.y -= 15;
    para(ctx, body, 'regular', 10);
    ctx.y -= 8;
  }
}

function drawToc(ctx: RenderCtx, entries: { label: string; target: string }[], tocPageCount: number) {
  const pages = ctx.doc.getPages();
  let pi = 2;
  let page = pages[pi];
  let y = PAGE_H - MARGIN - 30;
  page.drawText('Table of contents', { x: MARGIN, y, size: 18, font: ctx.fonts.bold, color: NAVY });
  y -= 14;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 1, color: RULE });
  y -= 26;

  for (const entry of entries) {
    if (y < MARGIN + 24) {
      pi += 1;
      if (pi >= 2 + tocPageCount) break;
      page = pages[pi];
      y = PAGE_H - MARGIN - 30;
    }
    const dest = ctx.targets[entry.target];
    const label = sanitize(entry.label);
    const pageStr = dest === undefined ? '—' : String(dest + 1);
    const numW = ctx.fonts.bold.widthOfTextAtSize(pageStr, 10.5);
    const maxLabelW = CONTENT_W - numW - 40;
    let shown = label;
    while (ctx.fonts.regular.widthOfTextAtSize(shown, 10.5) > maxLabelW && shown.length > 4) {
      shown = shown.slice(0, -2);
    }
    if (shown !== label) shown = `${shown.slice(0, -1)}…`;
    page.drawText(shown, { x: MARGIN, y, size: 10.5, font: ctx.fonts.regular, color: LINK });
    const labelW = ctx.fonts.regular.widthOfTextAtSize(shown, 10.5);
    const dotsW = CONTENT_W - labelW - numW - 20;
    if (dotsW > 12) {
      const dotUnit = ctx.fonts.regular.widthOfTextAtSize('. ', 9);
      page.drawText('. '.repeat(Math.floor(dotsW / dotUnit)), { x: MARGIN + labelW + 8, y, size: 9, font: ctx.fonts.regular, color: RULE });
    }
    page.drawText(pageStr, { x: MARGIN + CONTENT_W - numW, y, size: 10.5, font: ctx.fonts.bold, color: INK });
    if (dest !== undefined) {
      ctx.links.push({ page: pi, rect: { x: MARGIN - 4, y: y - 4, w: CONTENT_W + 8, h: 16 }, targetKey: entry.target });
    }
    y -= TOC_ROW;
  }
}

// ---------- timeline ----------

async function drawTimeline(ctx: RenderCtx, input: BundleInput) {
  const bundle = input.bundle;
  const events = sortEvents(bundle.events);
  heading(ctx, 'Timeline of events');

  if (events.length === 0) {
    para(ctx, 'No timeline events were added.', 'oblique', 10, MUTED);
    return;
  }

  for (const ev of events) {
    const detailLines = wrapText(sanitize(ev.details || ''), ctx.fonts.regular, 10.5, CONTENT_W - 18);
    const chips = ev.exhibitIds
      .map((id) => ({ id, n: exhibitNumber(bundle, id) }))
      .filter((c): c is { id: string; n: number } => c.n !== null);
    const chipRows = chips.length === 0 ? 0 : Math.ceil(chips.length / 3);
    const blockH = 20 + detailLines.length * 13.6 + (chipRows ? 8 + chipRows * 16 : 0) + 12;
    ensure(ctx, Math.min(blockH, 140));

    const dateText = formatEventDate(ev);
    const dateW = ctx.fonts.bold.widthOfTextAtSize(dateText, 9) + 14;
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 3.5, width: dateW, height: 15, color: LIGHT, borderColor: ev.date ? RULE : WARN, borderWidth: 0.8 });
    ctx.page.drawText(dateText, { x: MARGIN + 7, y: ctx.y, size: 9, font: ctx.fonts.bold, color: ev.date ? NAVY : WARN });
    const titleLines = wrapText(sanitize(ev.title || 'Untitled event'), ctx.fonts.bold, 11, CONTENT_W - dateW - 16);
    ctx.page.drawText(titleLines[0], { x: MARGIN + dateW + 10, y: ctx.y, size: 11, font: ctx.fonts.bold, color: INK });
    ctx.y -= 20;

    const blockTop = ctx.y + 4;
    const estBottom = ctx.y - detailLines.length * 13.6 - (chipRows ? 6 + chipRows * 16 : 0);
    ctx.page.drawLine({ start: { x: MARGIN + 3, y: blockTop }, end: { x: MARGIN + 3, y: estBottom }, thickness: 1.5, color: RULE });

    for (const line of detailLines) {
      ensure(ctx, 16);
      ctx.page.drawText(line, { x: MARGIN + 18, y: ctx.y, size: 10.5, font: ctx.fonts.regular, color: INK });
      ctx.y -= 13.6;
    }

    if (chips.length > 0) {
      ctx.y -= 4;
      let cx = MARGIN + 18;
      for (const chip of chips) {
        const ex = bundle.exhibits.find((e) => e.id === chip.id)!;
        let label = `E${chip.n} · ${sanitize(ex.fileName)}`;
        while (ctx.fonts.bold.widthOfTextAtSize(label, 8) > 180 && label.length > 8) label = label.slice(0, -2);
        if (label.endsWith(' ')) label = label.trimEnd();
        const full = `E${chip.n} · ${sanitize(ex.fileName)}`;
        if (label !== full) label = `${label.slice(0, -1)}…`;
        const w = ctx.fonts.bold.widthOfTextAtSize(label, 8) + 12;
        if (cx + w > MARGIN + CONTENT_W) {
          cx = MARGIN + 18;
          ctx.y -= 16;
          ensure(ctx, 18);
        }
        ctx.page.drawRectangle({ x: cx, y: ctx.y - 3.5, width: w, height: 14, color: CHIP_BG, borderColor: LINK, borderWidth: 0.7 });
        ctx.page.drawText(label, { x: cx + 6, y: ctx.y, size: 8, font: ctx.fonts.bold, color: LINK });
        addLink(ctx, { x: cx, y: ctx.y - 3.5, w, h: 14 }, { targetKey: `exhibit:${chip.id}` });
        cx += w + 8;
      }
      ctx.y -= 16;
    }
    ctx.y -= 12;
  }
}

// ---------- exhibits ----------

async function drawExhibit(ctx: RenderCtx, ex: Exhibit, bundle: CaseBundle, input: BundleInput) {
  const n = exhibitNumber(bundle, ex.id) ?? 0;
  heading(ctx, `Exhibit ${n} — ${sanitize(ex.fileName)}`);

  ctx.page.drawText(`${kindLabel(ex.kind)} · ${exhibitSourceLabel(ex)}`, { x: MARGIN, y: ctx.y, size: 10, font: ctx.fonts.bold, color: ACCENT });
  ctx.y -= 18;

  const meta: [string, string][] = [
    ['Added to bundle', formatLongDate(ex.createdAt)],
    ['Evidence date', ex.capturedDate ? formatLongDate(`${ex.capturedDate}T00:00:00Z`) : 'Not recorded'],
    ['Size', `${ex.byteSize} bytes`],
  ];
  for (const [k, v] of meta) {
    ctx.page.drawText(`${k}:`, { x: MARGIN, y: ctx.y, size: 8.5, font: ctx.fonts.bold, color: MUTED });
    ctx.page.drawText(sanitize(v), { x: MARGIN + 170, y: ctx.y, size: 9, font: ctx.fonts.regular, color: INK });
    ctx.y -= 13;
  }
  ctx.page.drawText('SHA-256 (identifies the exact bytes only — not proof of authenticity):', { x: MARGIN, y: ctx.y, size: 8.5, font: ctx.fonts.bold, color: MUTED });
  ctx.y -= 11;
  for (const line of wrapText(ex.sha256 ?? 'not computed', ctx.fonts.mono, 7, CONTENT_W - 170)) {
    ctx.page.drawText(line, { x: MARGIN + 170, y: ctx.y + 1.5, size: 7, font: ctx.fonts.mono, color: INK });
    ctx.y -= 9;
  }
  ctx.y -= 8;

  if (ex.description.trim()) {
    ctx.page.drawText('Source description', { x: MARGIN, y: ctx.y, size: 9, font: ctx.fonts.bold, color: MUTED });
    ctx.y -= 13;
    para(ctx, ex.description, 'regular', 10);
    ctx.y -= 10;
  }

  if (ex.kind === 'photo') await drawImageExhibit(ctx, ex, input);
  else if (ex.kind === 'pdf') await drawPdfExhibit(ctx, ex, input);
  else if (ex.kind === 'public-record') drawPublicRecord(ctx, ex);
  else drawTextExhibit(ctx, ex);
}

async function drawImageExhibit(ctx: RenderCtx, ex: Exhibit, input: BundleInput) {
  const bytes = input.files.get(ex.id);
  if (!bytes) {
    para(ctx, '[image bytes not available — file may have been removed]', 'oblique', 10, WARN);
    return;
  }
  try {
    const img = ex.mimeType === 'image/jpeg' || ex.mimeType === 'image/jpg'
      ? await ctx.doc.embedJpg(bytes)
      : await ctx.doc.embedPng(bytes);
    let availH = Math.min(ctx.y - contentBottomY(), 420);
    if (availH < 120) {
      newPage(ctx);
      availH = Math.min(ctx.y - contentBottomY(), 420);
    }
    const s = Math.min(CONTENT_W / img.width, availH / img.height, 1.6);
    const w = img.width * s;
    const h = img.height * s;
    ctx.y -= h;
    ctx.page.drawRectangle({ x: MARGIN - 2, y: ctx.y - 2, width: w + 4, height: h + 4, borderColor: RULE, borderWidth: 1 });
    ctx.page.drawImage(img, { x: MARGIN, y: ctx.y, width: w, height: h });
    ctx.y -= 14;
  } catch {
    ctx.warnings.push(`Could not embed image for exhibit "${ex.fileName}" — unsupported format.`);
    para(ctx, '[image could not be embedded — keep the original file]', 'oblique', 10, WARN);
  }
}

async function drawPdfExhibit(ctx: RenderCtx, ex: Exhibit, input: BundleInput) {
  const bytes = input.files.get(ex.id);
  if (!bytes) {
    para(ctx, '[PDF bytes not available]', 'oblique', 10, WARN);
    return;
  }
  try {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = src.getPageCount();
    const count = Math.min(total, MAX_PDF_PAGES);
    for (let i = 0; i < count; i++) {
      const embedded = await ctx.doc.embedPage(src.getPage(i));
      const availH = ctx.y - contentBottomY() - 20;
      const s = Math.min(CONTENT_W / embedded.width, availH / embedded.height, 1);
      if (s <= 0.05 || availH < 120) {
        newPage(ctx);
        ctx.page.drawText(`Exhibit (continued)`, { x: MARGIN, y: ctx.y, size: 10, font: ctx.fonts.bold, color: MUTED });
        ctx.y -= 20;
      }
      const aH = ctx.y - contentBottomY() - 20;
      const s2 = Math.min(CONTENT_W / embedded.width, aH / embedded.height, 1);
      const w = embedded.width * s2;
      const h = embedded.height * s2;
      ctx.y -= h;
      ctx.page.drawRectangle({ x: MARGIN - 2, y: ctx.y - 2, width: w + 4, height: h + 4, borderColor: RULE, borderWidth: 1 });
      ctx.page.drawPage(embedded, { x: MARGIN, y: ctx.y, width: w, height: h });
      ctx.y -= 16;
      ctx.page.drawText(`Page ${i + 1} of ${total} from the uploaded file`, { x: MARGIN, y: ctx.y, size: 8, font: ctx.fonts.oblique, color: MUTED });
      ctx.y -= 18;
    }
    if (total > count) {
      para(ctx, `The uploaded PDF has ${total} pages; the first ${count} are embedded here. Keep the original file with your records.`, 'oblique', 9, MUTED);
    }
  } catch {
    ctx.warnings.push(`Could not embed PDF "${ex.fileName}" — it may be encrypted or damaged.`);
    para(ctx, '[PDF could not be embedded — it may be encrypted or damaged. Keep the original file.]', 'oblique', 10, WARN);
  }
}

function drawTextExhibit(ctx: RenderCtx, ex: Exhibit) {
  const text = ex.textContent ?? '';
  if (!text.trim()) {
    para(ctx, '[no text content]', 'oblique', 10, MUTED);
    return;
  }
  const lines = wrapText(sanitize(text), ctx.fonts.mono, 9, CONTENT_W - 24);
  let lineNum = 0;
  drawTextBoxStart(ctx);
  for (const line of lines) {
    if (ctx.y - 12 < contentBottomY() || (lineNum > 0 && lineNum % TEXT_LINES_PER_PAGE === 0)) {
      newPage(ctx);
      ctx.page.drawText('Exhibit (continued)', { x: MARGIN, y: ctx.y, size: 10, font: ctx.fonts.bold, color: MUTED });
      ctx.y -= 20;
      drawTextBoxStart(ctx);
    }
    ctx.page.drawText(line, { x: MARGIN + 12, y: ctx.y, size: 9, font: ctx.fonts.mono, color: INK });
    ctx.y -= 11.5;
    lineNum++;
  }
  ctx.y -= 10;
}

function drawTextBoxStart(ctx: RenderCtx) {
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 8 }, end: { x: MARGIN, y: Math.max(ctx.y - 200, contentBottomY()) }, thickness: 0.8, color: RULE });
}

function drawPublicRecord(ctx: RenderCtx, ex: Exhibit) {
  const meta = ex.publicRecord;
  const synthetic = meta?.synthetic === true;
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 52, width: CONTENT_W, height: 58, color: CHIP_BG, borderColor: LINK, borderWidth: 0.8 });
  if (synthetic) {
    ctx.page.drawText('SYNTHETIC SAMPLE — FICTIONAL DATA, NOT AN ACTUAL CITY OF TORONTO RECORD', { x: MARGIN + 12, y: ctx.y - 14, size: 8, font: ctx.fonts.bold, color: LINK });
    const l1 = 'Format inspired by RentSafeTO evaluations. Every value below is invented for demonstration.';
    const l2 = `Dataset page shown as a format reference only: ${DATASET_PAGE_URL}`;
    ctx.page.drawText(l1.slice(0, 95), { x: MARGIN + 12, y: ctx.y - 28, size: 8.5, font: ctx.fonts.regular, color: INK });
    ctx.page.drawText(l2.slice(0, 95), { x: MARGIN + 12, y: ctx.y - 40, size: 8.5, font: ctx.fonts.regular, color: INK });
    if (meta?.sourceUrl) {
      addLink(ctx, { x: MARGIN + 12, y: ctx.y - 44, w: ctx.fonts.regular.widthOfTextAtSize(l2.slice(0, 95), 8.5), h: 12 }, { url: DATASET_PAGE_URL });
    }
  } else {
    ctx.page.drawText('PUBLIC DATA — CITY OF TORONTO OPEN DATA (RentSafeTO)', { x: MARGIN + 12, y: ctx.y - 14, size: 8, font: ctx.fonts.bold, color: LINK });
    const l1 = `Fetched ${meta ? formatLongDate(meta.fetchedAt) : '—'} · Query: "${meta?.query ?? ''}"`;
    const l2 = `Dataset: Apartment Building Evaluation · ${DATASET_PAGE_URL}`;
    ctx.page.drawText(l1.slice(0, 95), { x: MARGIN + 12, y: ctx.y - 28, size: 8.5, font: ctx.fonts.regular, color: INK });
    ctx.page.drawText(l2.slice(0, 95), { x: MARGIN + 12, y: ctx.y - 40, size: 8.5, font: ctx.fonts.regular, color: INK });
    if (meta?.sourceUrl) {
      addLink(ctx, { x: MARGIN + 12, y: ctx.y - 44, w: ctx.fonts.regular.widthOfTextAtSize(l2.slice(0, 95), 8.5), h: 12 }, { url: DATASET_PAGE_URL });
    }
  }
  ctx.y -= 68;

  // Try to render the record fields as a table from stored JSON text.
  let record: Record<string, unknown> | null = null;
  try {
    if (ex.textContent) {
      const parsed = JSON.parse(ex.textContent) as { record?: Record<string, unknown> };
      record = parsed.record ?? null;
    }
  } catch {
    record = null;
  }
  if (record) {
    const rows = summarizeRecord(record as never);
    for (const r of rows) {
      ensure(ctx, 16);
      ctx.page.drawText(`${r.label}:`, { x: MARGIN, y: ctx.y, size: 8.5, font: ctx.fonts.bold, color: MUTED });
      ctx.page.drawText(sanitize(r.value).slice(0, 80), { x: MARGIN + 200, y: ctx.y, size: 9.5, font: ctx.fonts.regular, color: INK });
      ctx.y -= 13.5;
    }
    ctx.y -= 6;
    ctx.page.drawText(
      synthetic
        ? 'All values above are invented sample data — they are NOT published by the City of Toronto and are not a real building record.'
        : 'Scores are as published by the City of Toronto. This exhibit reproduces public data and is not verified against the underlying inspection file.',
      { x: MARGIN, y: ctx.y, size: 8, font: ctx.fonts.oblique, color: MUTED },
    );
    ctx.y -= 16;
  } else {
    drawTextExhibit(ctx, ex);
  }
}

// ---------- closing pages ----------

function drawChecklist(ctx: RenderCtx) {
  heading(ctx, 'Before you file — checklist');
  const items = [
    'Check the LTB Rules of Procedure and your notice of hearing for the disclosure deadline that applies to your proceeding — under Rule 19 that is generally 7 days before the hearing for your evidence, and 5 days for responding evidence, unless the Board directs otherwise.',
    'Re-read every timeline sentence. Keep only facts you can support, and confirm each exhibit chip points to the right source.',
    'Confirm exhibit descriptions say what each item is and where it came from.',
    'Keep the original files and any physical evidence — this PDF is an organizer, not a substitute for originals.',
    'Complete the correct LTB form (for example the T6) separately — this bundle does not file anything.',
    'Consider free legal help: a community legal clinic, ACTO (acto.ca), or Pro Bono Ontario.',
  ];
  for (const item of items) {
    const lines = wrapText(item, ctx.fonts.regular, 10.5, CONTENT_W - 24);
    ensure(ctx, lines.length * 14 + 10);
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 2, width: 12, height: 12, borderColor: ACCENT, borderWidth: 1.2 });
    for (const line of lines) {
      ctx.page.drawText(line, { x: MARGIN + 24, y: ctx.y, size: 10.5, font: ctx.fonts.regular, color: INK });
      ctx.y -= 14;
    }
    ctx.y -= 10;
  }
  ensure(ctx, 90);
  ctx.y -= 10;
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 62, width: CONTENT_W, height: 70, color: LIGHT, borderColor: RULE, borderWidth: 1 });
  wrapText(
    'Reminder: this bundle was generated locally on your device. Nothing was sent to the LTB, a server, or an AI service. Review it yourself, verify deadlines on official Ontario sources, and decide what to disclose and when.',
    ctx.fonts.regular, 10, CONTENT_W - 24,
  ).forEach((line, i) => ctx.page.drawText(line, { x: MARGIN + 12, y: ctx.y - 12 - i * 13, size: 10, font: ctx.fonts.regular, color: INK }));
}

function drawSources(ctx: RenderCtx, bundle: CaseBundle) {
  heading(ctx, 'Official sources');
  para(ctx, 'Verify rules, forms, deadlines, and your rights on these official pages — not on this document.', 'oblique', 10, MUTED);
  ctx.y -= 10;
  const sources: [string, string][] = [
    ['Landlord and Tenant Board (LTB)', 'https://tribunalsontario.ca/ltb/'],
    ['LTB Rules of Procedure', 'https://tribunalsontario.ca/documents/ltb/Rules/LTB-Rules_of_Procedure.html'],
    ['LTB law, rules and decisions (hub page)', 'https://tribunalsontario.ca/ltb/law-rules-and-decisions/'],
    ['LTB Practice Direction on Evidence', 'https://tribunalsontario.ca/documents/ltb/Practice%20Directions/Practice%20Direction%20on%20Evidence.html'],
    ['LTB forms, including T6 (Tenant Application about Maintenance)', 'https://tribunalsontario.ca/ltb/forms/'],
    ['Residential Tenancies Act, 2006 (incl. s.82)', 'https://www.ontario.ca/laws/statute/06r17'],
    ['RentSafeTO — City of Toronto apartment building standards', 'https://www.toronto.ca/community-people/housing-shelter/rental-housing-standards/apartment-building-standards/'],
    ['Toronto Open Data — Apartment Building Evaluation dataset', 'https://open.toronto.ca/dataset/apartment-building-evaluation/'],
    ['ACTO — Advocacy Centre for Tenants Ontario', 'https://www.acto.ca/'],
  ];
  for (const [name, url] of sources) {
    ensure(ctx, 40);
    ctx.page.drawText(name, { x: MARGIN, y: ctx.y, size: 10.5, font: ctx.fonts.bold, color: INK });
    ctx.y -= 13;
    ctx.page.drawText(url, { x: MARGIN, y: ctx.y, size: 9.5, font: ctx.fonts.regular, color: LINK });
    addLink(ctx, { x: MARGIN, y: ctx.y - 2, w: ctx.fonts.regular.widthOfTextAtSize(url, 9.5), h: 12 }, { url });
    ctx.y -= 22;
  }
  void bundle;
}

function drawChrome(doc: PDFDocument, bundle: CaseBundle, f: Fonts, at: Date) {
  const total = doc.getPageCount();
  doc.getPages().forEach((page, i) => {
    if (i > 0) {
      page.drawText('Hearing-Ready — draft evidence bundle', { x: MARGIN, y: PAGE_H - 34, size: 8, font: f.bold, color: MUTED });
      const right = sanitize(bundle.title || bundle.unitAddress || '').slice(0, 80);
      const rw = f.regular.widthOfTextAtSize(right, 8);
      page.drawText(right, { x: PAGE_W - MARGIN - rw, y: PAGE_H - 34, size: 8, font: f.regular, color: MUTED });
      page.drawLine({ start: { x: MARGIN, y: PAGE_H - 42 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 42 }, thickness: 0.6, color: RULE });
    }
    page.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: PAGE_W - MARGIN, y: 40 }, thickness: 0.6, color: RULE });
    page.drawText('Draft for review — verify deadlines at tribunalsontario.ca/ltb', { x: MARGIN, y: 28, size: 7.5, font: f.regular, color: MUTED });
    const pg = `Page ${i + 1} of ${total}`;
    const pw = f.bold.widthOfTextAtSize(pg, 8);
    page.drawText(pg, { x: PAGE_W - MARGIN - pw, y: 28, size: 8, font: f.bold, color: MUTED });
    page.drawText(`Generated ${formatLongDate(at)}`, { x: PAGE_W / 2 - 50, y: 28, size: 7.5, font: f.regular, color: MUTED });
  });
}

function applyLinks(doc: PDFDocument, links: PendingLink[], targets: Record<string, number>) {
  const ctx = doc.context;
  const pages = doc.getPages();
  for (const link of links) {
    const page = pages[link.page];
    const rect = [link.rect.x, link.rect.y, link.rect.x + link.rect.w, link.rect.y + link.rect.h];
    let annot;
    if (link.url) {
      annot = ctx.obj({
        Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFHexString.fromText(link.url) },
      });
    } else if (link.targetKey && targets[link.targetKey] !== undefined) {
      annot = ctx.obj({
        Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0],
        Dest: [pages[targets[link.targetKey]].ref, PDFName.of('XYZ'), null, null, null],
      });
    } else {
      continue;
    }
    let annots = page.node.get(PDFName.of('Annots'));
    if (!(annots instanceof PDFArray)) {
      annots = ctx.obj([]);
      page.node.set(PDFName.of('Annots'), annots);
    }
    (annots as PDFArray).push(ctx.register(annot) as PDFRef);
  }
}
