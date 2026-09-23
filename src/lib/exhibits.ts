import type { CaseBundle, Exhibit } from '../types';

/** Exhibit numbers are positional: index + 1 in bundle.exhibits order. */
export function exhibitNumber(bundle: Pick<CaseBundle, 'exhibits'>, exhibitId: string): number | null {
  const idx = bundle.exhibits.findIndex((e) => e.id === exhibitId);
  return idx === -1 ? null : idx + 1;
}

export function exhibitLabel(n: number): string {
  return `Exhibit ${n}`;
}

export function exhibitChip(n: number): string {
  return `E${n}`;
}

export function moveExhibit(exhibits: Exhibit[], id: string, delta: -1 | 1): Exhibit[] {
  const idx = exhibits.findIndex((e) => e.id === id);
  const target = idx + delta;
  if (idx === -1 || target < 0 || target >= exhibits.length) return exhibits;
  const next = exhibits.slice();
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

export function removeExhibit(bundle: CaseBundle, id: string): CaseBundle {
  return {
    ...bundle,
    exhibits: bundle.exhibits.filter((e) => e.id !== id),
    events: bundle.events.map((ev) => ({
      ...ev,
      exhibitIds: ev.exhibitIds.filter((x) => x !== id),
    })),
  };
}

/** Exhibits referenced by at least one event, sorted by number. */
export function referencedExhibitIds(bundle: CaseBundle): Set<string> {
  const set = new Set<string>();
  for (const ev of bundle.events) for (const id of ev.exhibitIds) set.add(id);
  return set;
}

export function kindLabel(kind: Exhibit['kind']): string {
  switch (kind) {
    case 'photo': return 'Photo';
    case 'pdf': return 'PDF document';
    case 'text': return 'Text / message file';
    case 'note': return 'Typed note';
    case 'public-record': return 'Public record';
  }
}

export function sourceLabel(source: Exhibit['source']): string {
  switch (source) {
    case 'tenant-upload': return 'Tenant upload';
    case 'tenant-note': return 'Tenant note';
    case 'public-data': return 'Public data (Toronto Open Data)';
  }
}

/** Source label for display; invented demo records are never labeled as City data. */
export function exhibitSourceLabel(ex: Exhibit): string {
  if (ex.publicRecord?.synthetic) return 'Synthetic sample (RentSafeTO format)';
  return sourceLabel(ex.source);
}

export function classifyFile(fileName: string, mimeType: string): Exhibit['kind'] {
  const lower = fileName.toLowerCase();
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  return 'text';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
