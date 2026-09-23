import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  daysUntil,
  eventSortKey,
  formatEventDate,
  formatLongDate,
  isValidDay,
  isValidMonth,
  sortEvents,
  toISODay,
} from '../src/lib/dates';
import { makeEvent } from './fixtures';

describe('date validation', () => {
  it('accepts real dates, rejects impossible ones', () => {
    expect(isValidDay('2026-02-28')).toBe(true);
    expect(isValidDay('2026-02-30')).toBe(false); // Feb 30 doesn't exist
    expect(isValidDay('2026-13-01')).toBe(false);
    expect(isValidDay('12-01-2026')).toBe(false);
    expect(isValidDay('')).toBe(false);
  });

  it('validates month precision', () => {
    expect(isValidMonth('2026-02')).toBe(true);
    expect(isValidMonth('2026-13')).toBe(false);
    expect(isValidMonth('2026-02-01')).toBe(false);
  });
});

describe('formatEventDate', () => {
  it('formats day-precision dates as long dates', () => {
    expect(formatEventDate({ date: '2026-01-05', precision: 'day' })).toBe('5 January 2026');
  });
  it('formats month-precision dates without a day', () => {
    expect(formatEventDate({ date: '2026-01', precision: 'month' })).toBe('January 2026');
  });
  it('flags missing or invalid dates', () => {
    expect(formatEventDate({ date: null, precision: 'day' })).toBe('Date needed');
    expect(formatEventDate({ date: '2026-99-99', precision: 'day' })).toBe('Date needed');
    expect(formatEventDate({ date: 'junk', precision: 'month' })).toBe('Date needed');
  });
});

describe('sortEvents', () => {
  it('orders dated events chronologically, undated last', () => {
    const a = makeEvent({ date: '2026-03-01' });
    const b = makeEvent({ date: '2026-01-05' });
    const c = makeEvent({ date: null });
    const d = makeEvent({ date: '2026-01', precision: 'month' });
    const sorted = sortEvents([a, c, b, d]);
    expect(sorted.map((e) => e.id)).toEqual([d.id, b.id, a.id, c.id]);
  });
  it('does not mutate the input array', () => {
    const evs = [makeEvent({ date: '2026-03-01' }), makeEvent({ date: '2026-01-05' })];
    sortEvents(evs);
    expect(evs[0].date).toBe('2026-03-01');
  });
});

describe('eventSortKey / toISODay', () => {
  it('month precision sorts as the first of the month', () => {
    expect(eventSortKey(makeEvent({ date: '2026-02', precision: 'month' }))).toBe('2026-02-01');
    expect(toISODay('2026-02', 'month')).toBe('2026-02-01');
  });
  it('returns null for unusable dates', () => {
    expect(eventSortKey(makeEvent({ date: null }))).toBeNull();
    expect(eventSortKey(makeEvent({ date: 'bad' }))).toBeNull();
    expect(toISODay('bad', 'day')).toBeNull();
  });
});

describe('date arithmetic', () => {
  it('computes days between ISO days', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
  it('computes days until a date from a fixed reference', () => {
    const from = new Date('2026-09-20T12:00:00Z');
    expect(daysUntil('2026-09-27', from)).toBe(7);
    expect(daysUntil('2026-09-20', from)).toBe(0);
    expect(daysUntil('2026-09-19', from)).toBe(-1);
  });
  it('formats long dates', () => {
    expect(formatLongDate('2026-01-05T10:00:00Z')).toBe('5 January 2026');
    expect(formatLongDate(new Date(Date.UTC(2026, 0, 5)))).toBe('5 January 2026');
  });
});
