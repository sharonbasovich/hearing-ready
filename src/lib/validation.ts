import type { CaseBundle } from '../types';
import { eventSortKey } from './dates';
import { exhibitNumber } from './exhibits';

export type Severity = 'warning' | 'info';

export interface Issue {
  severity: Severity;
  message: string;
  target: { kind: 'event' | 'exhibit' | 'case'; id: string };
}

export function validateBundle(bundle: CaseBundle): Issue[] {
  const issues: Issue[] = [];
  const referenced = new Set<string>();
  const exhibitIds = new Set(bundle.exhibits.map((e) => e.id));

  if (!bundle.title.trim()) {
    issues.push({ severity: 'warning', message: 'Bundle has no title — it appears on the cover page.', target: { kind: 'case', id: bundle.id } });
  }
  if (!bundle.unitAddress.trim()) {
    issues.push({ severity: 'warning', message: 'Rental unit address is missing — it appears on the cover page.', target: { kind: 'case', id: bundle.id } });
  }

  for (const ev of bundle.events) {
    for (const id of ev.exhibitIds) {
      if (exhibitIds.has(id)) referenced.add(id);
    }
    const label = ev.title.trim() || 'Untitled event';
    if (eventSortKey(ev) === null) {
      issues.push({ severity: 'warning', message: `"${label}" has no usable date — add a date or it prints as "Date needed".`, target: { kind: 'event', id: ev.id } });
    }
    if (!ev.details.trim()) {
      issues.push({ severity: 'warning', message: `"${label}" has no factual description.`, target: { kind: 'event', id: ev.id } });
    }
    if (ev.exhibitIds.length === 0) {
      issues.push({ severity: 'info', message: `"${label}" links no exhibits — link source evidence if you have it.`, target: { kind: 'event', id: ev.id } });
    }
    const stale = ev.exhibitIds.filter((id) => !exhibitIds.has(id));
    if (stale.length > 0) {
      issues.push({ severity: 'warning', message: `"${label}" links ${stale.length} exhibit(s) that no longer exist.`, target: { kind: 'event', id: ev.id } });
    }
  }

  for (const ex of bundle.exhibits) {
    const n = exhibitNumber(bundle, ex.id) ?? '?';
    if (!referenced.has(ex.id)) {
      issues.push({ severity: 'info', message: `Exhibit ${n} (${ex.fileName}) is not linked by any timeline event.`, target: { kind: 'exhibit', id: ex.id } });
    }
    if (!ex.description.trim()) {
      issues.push({ severity: 'warning', message: `Exhibit ${n} (${ex.fileName}) has no source description — describe what it shows and where it came from.`, target: { kind: 'exhibit', id: ex.id } });
    }
  }

  if (bundle.events.length === 0) {
    issues.push({ severity: 'warning', message: 'Timeline is empty — add at least one dated event.', target: { kind: 'case', id: bundle.id } });
  }
  if (bundle.exhibits.length === 0) {
    issues.push({ severity: 'warning', message: 'No exhibits yet — import photos, messages, or notes.', target: { kind: 'case', id: bundle.id } });
  }

  return issues;
}
