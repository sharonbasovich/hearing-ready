import type { DatePrecision, TimelineEvent } from '../types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function isValidDay(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return (
    d.getUTCFullYear() === +m[1] &&
    d.getUTCMonth() === +m[2] - 1 &&
    d.getUTCDate() === +m[3]
  );
}

export function isValidMonth(date: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(date);
}

/** Normalized sortable key for an event date: month precision sorts as the 1st of that month. */
export function eventSortKey(event: TimelineEvent): string | null {
  if (!event.date) return null;
  if (event.precision === 'month') {
    return isValidMonth(event.date) ? `${event.date}-01` : null;
  }
  return isValidDay(event.date) ? event.date : null;
}

export function formatEventDate(event: Pick<TimelineEvent, 'date' | 'precision'>): string {
  if (!event.date) return 'Date needed';
  if (event.precision === 'month') {
    if (!isValidMonth(event.date)) return 'Date needed';
    const [y, m] = event.date.split('-');
    return `${MONTHS[+m - 1]} ${y}`;
  }
  if (!isValidDay(event.date)) return 'Date needed';
  const [y, m, d] = event.date.split('-');
  return `${+d} ${MONTHS[+m - 1]} ${y}`;
}

export function formatLongDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Dated events chronological (day-precision key), undated last, stable by id. */
export function sortEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    const ka = eventSortKey(a);
    const kb = eventSortKey(b);
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

export function daysBetween(fromIsoDay: string, toIsoDay: string): number {
  const a = Date.parse(`${fromIsoDay}T00:00:00Z`);
  const b = Date.parse(`${toIsoDay}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function daysUntil(isoDay: string, from: Date = new Date()): number {
  const today = from.toISOString().slice(0, 10);
  return daysBetween(today, isoDay);
}

/** Full ISO day if given 'YYYY-MM' it returns first of month; null when unparseable. */
export function toISODay(date: string, precision: DatePrecision): string | null {
  if (precision === 'month') return isValidMonth(date) ? `${date}-01` : null;
  return isValidDay(date) ? date : null;
}
